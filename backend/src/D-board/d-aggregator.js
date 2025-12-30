import VisualizerData from "../models/VisualizerData.js";
import SystemInfo from "../models/SystemInfo.js";
import Dashboard from "../models/Dashboard.js";
import Agent from "../models/Agent.js";
import VisualizerScanner from "../models/VisualizerScanner.js";
import { isRouterIP } from "../utils/networkHelpers.js";

// -----------------------------------------
// Helper: Extract all possible IPs from a SystemInfo doc
// -----------------------------------------
function extractIPs(sys) {
  if (!sys) return [];
  const d = sys.data || sys;
  const ips = [];

  if (d.ip) ips.push(d.ip);
  if (d.address) ips.push(d.address);

  if (Array.isArray(d.wlan_info)) {
    d.wlan_info.forEach((w) => w?.address && ips.push(w.address));
  }
  if (Array.isArray(d.wlan_ip)) {
    d.wlan_ip.forEach((w) => w?.address && ips.push(w.address));
  }

  // ⭐ Filter out loopback and APIPA
  return ips.filter(ip =>
    ip &&
    !ip.startsWith("127.") &&
    !ip.startsWith("169.254.")
  );
}

// -----------------------------------------
// Helper: Normalize MAC for comparison
// -----------------------------------------
function normalizeMAC(mac) {
  if (!mac) return null;
  return mac.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// -----------------------------------------
// MAIN WORKER
// -----------------------------------------
async function runDashboardWorker(interval = 4500) {
  console.log(`📊 Dashboard Worker (Hyper-Stable) running every ${interval}ms`);

  const loop = async () => {
    // 0. Iterate Active Tenants
    const tenants = global.ACTIVE_TENANTS ? [...global.ACTIVE_TENANTS] : [];

    for (const tenantId of tenants) {
      try {
        const tStr = tenantId.toString();
        // 1. Fetch Scoped Data
        const agents = await Agent.find({ tenantId }).lean();
        const sysRaw = await SystemInfo.find({ tenantId }).lean();
        const scanRaw = await VisualizerScanner.find({ tenantId }).lean();

        // 2. Map System Info by AgentId
        const sysByAgentId = {};
        sysRaw.forEach((sys) => {
          if (sys.agentId) sysByAgentId[sys.agentId] = sys;
        });

        // 3. Process Agents with Intelligent IP Resolution
        const rawAgentsFormatted = agents.map((agent) => {
          const sys = sysByAgentId[agent.agentId] || {};
          const sysData = sys.data || {};

          // Resolve the "Actual" LAN IP
          let finalIP = agent.ip || "unknown";

          const possibleIPs = extractIPs(sysData);
          const routableIP = possibleIPs.find(ip =>
            !ip.startsWith("127.") &&
            !ip.startsWith("169.254.") &&
            (ip.startsWith("192.") || ip.startsWith("10.") || ip.startsWith("172."))
          );

          // ⭐ FIX: Prioritize Agent's Reported Local IP over Socket Public IP
          // If we have a valid routable local IP, use it.
          if (routableIP) {
            finalIP = routableIP;
          } else if (finalIP.startsWith("127.") || finalIP === "::1" || finalIP === "unknown") {
            // Fallback if socket IP is useless
            if (routableIP) finalIP = routableIP;
          }

          return {
            agentId: agent.agentId,
            ip: finalIP,
            hostname: sysData.hostname || agent.agentId || "Unknown",
            status: agent.status || "offline",
            lastSeen: agent.lastSeen,
            cpu: sysData.cpu || {},
            memory: sysData.memory || {},
            os: sysData.os_type || "Unknown",
            system: sysData,
            mac: normalizeMAC(agent.mac || sysData.mac),
            timestamp: agent.lastSeen,
            tenantId
          };
        });

        // 4. Build Deduplicated Device Map
        const allDevicesMap = new Map();

        const addOrUpdateDevice = (device, isAgent) => {
          const normMac = normalizeMAC(device.mac);
          let existingKey = null;
          let existingData = null;

          for (const [k, v] of allDevicesMap.entries()) {
            const macMatch = normMac && v.mac === normMac;
            const ipMatch = device.ip && device.ip !== 'unknown' && v.ip === device.ip;

            if (macMatch || ipMatch) {
              existingKey = k;
              existingData = v;
              break;
            }
          }

          if (existingData) {
            if (isAgent) {
              allDevicesMap.set(existingKey, {
                ...existingData,
                ...device,
                source: 'agent',
                noAgent: false,
                mac: normMac || existingData.mac,
                vendor: device.vendor || existingData.vendor || "Unknown"
              });
            } else {
              if (existingData.source !== 'agent') {
                allDevicesMap.set(existingKey, { ...existingData, ...device, mac: normMac });
              } else {
                allDevicesMap.set(existingKey, {
                  ...existingData,
                  mac: existingData.mac || normMac,
                  vendor: existingData.vendor || device.vendor || "Unknown",
                  isRouter: existingData.isRouter || isRouterIP(device.ip, device.hostname, device.vendor)
                });
              }
            }
            return;
          }

          let key = normMac || device.ip;
          if ((!key || key === 'unknown') && isAgent) key = device.agentId;

          if (key && key !== 'unknown') {
            const isRouter = isRouterIP(device.ip, device.hostname, device.vendor);
            allDevicesMap.set(key, {
              ...device,
              mac: normMac,
              source: isAgent ? 'agent' : 'scanner',
              noAgent: !isAgent,
              isRouter
            });
          }
        };

        // Populate Map
        rawAgentsFormatted.forEach(a => addOrUpdateDevice(a, true));

        scanRaw.forEach(scan => {
          if (!scan.ip || scan.ip.startsWith("127.") || scan.ip.startsWith("169.254.")) return;

          // Relaxed Filter: Only skip if it looks like absolute noise AND is not in target range 
          // (We will filter by targetSubnet later anyway)
          addOrUpdateDevice({
            ip: scan.ip,
            hostname: scan.hostname || "Unknown",
            mac: normalizeMAC(scan.mac),
            vendor: scan.vendor || "Unknown",
            createdAt: scan.createdAt || scan.lastSeen,
            timestamp: scan.createdAt || scan.lastSeen,
            tenantId
          }, false);
        });

        // ⭐ 5. DYNAMIC SUBNET DETECTION
        let targetSubnet = null;
        const allEntries = Array.from(allDevicesMap.values());

        const primaryGateway = allEntries.find(d => isRouterIP(d.ip, d.hostname, d.vendor));
        if (primaryGateway) {
          const pts = primaryGateway.ip.split('.');
          if (pts.length === 4) targetSubnet = pts.slice(0, 3).join('.') + '.';
        }

        if (!targetSubnet) {
          const firstOnline = rawAgentsFormatted.find(a => a.status === 'online' && a.ip !== 'unknown');
          if (firstOnline) {
            const pts = firstOnline.ip.split('.');
            if (pts.length === 4) targetSubnet = pts.slice(0, 3).join('.') + '.';
          }
        }

        // ⭐ 6. FILTER: LAN-Only stable view
        const filteredDevices = (targetSubnet
          ? allEntries.filter(d => d.ip && d.ip.startsWith(targetSubnet))
          : allEntries)
          .sort((a, b) => {
            // Stable sort by IP
            const ipToNum = (ip) => ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
            return ipToNum(a.ip) - ipToNum(b.ip);
          });

        // 7. Classify (Now pre-sorted)
        const routers = [];
        const unknownDevices = [];
        const activeAgents = [];
        const inactiveAgents = [];

        filteredDevices.forEach(d => {
          if (d.source === 'agent') {
            if (d.status === 'online') activeAgents.push(d);
            else inactiveAgents.push(d);
          } else {
            if (isRouterIP(d.ip, d.hostname, d.vendor)) {
              routers.push(d);
            } else {
              unknownDevices.push(d);
            }
          }
        });

        // ⭐ 8. SYNC VISUALIZER FIRST to ensure 1:1 match
        const vizItems = filteredDevices.map(d => ({
          tenantId,
          agentId: d.agentId || "unknown",
          ip: d.ip,
          mac: d.mac || "Unknown",
          vendor: d.vendor || "Unknown",
          hostname: d.hostname || d.agentId || "Unknown",
          noAgent: d.noAgent ?? true,
          isRouter: d.isRouter || false,
          status: d.status // ⭐ FIX: Include status so offline/online toggle triggers update
        }));

        // 9. Check if data actually changed to prevent flickering
        const currentDataHash = JSON.stringify(vizItems);
        const lastDataHash = global[`LAST_HASH_${tStr}`];

        if (currentDataHash === lastDataHash) {
          // No change in devices, only update agent heartbeats in background if needed
          // But don't broadcast/save massive snapshot unless data changed
          // Heartbeats are handled in Step 3/4 and Step 7-10 logic.
          // We can skip database update for visualizer and dashboard if nothing changed.
        } else {
          global[`LAST_HASH_${tStr}`] = currentDataHash;

          await VisualizerData.deleteMany({ tenantId });
          if (vizItems.length > 0) {
            await VisualizerData.insertMany(vizItems);
          }

          // 9. Save Snapshot (Uses the exact same vizItems count)
          const snapshot = {
            tenantId,
            track: Date.now(),
            timestamp: new Date(),
            summary: {
              all: vizItems.length,
              active: activeAgents.length,
              inactive: inactiveAgents.length,
              unknown: unknownDevices.length,
              routers: routers.length,
            },
            allDevices: filteredDevices,
            activeAgents,
            inactiveAgents,
            routers,
            unknownDevices,
          };

          await Dashboard.findOneAndUpdate({ tenantId }, { $set: snapshot }, { upsert: true });
          console.log(`📡 [${tStr}] Change detected: ${vizItems.length} devices. Broadcasting...`);

          // ⭐ 10. BROADCAST
          try {
            const { getIO } = await import("../socket-nvs.js");
            const io = getIO();
            io.to(tStr).emit("dashboard_update", snapshot);
            io.to(tStr).emit("visualizer_refresh", vizItems);
          } catch (e) { }
        }

      } catch (err) {
        console.error(`❌ Dashboard loop error:`, err);
      }
    }
  };

  await loop();
  setInterval(loop, interval);
}

export default runDashboardWorker;
