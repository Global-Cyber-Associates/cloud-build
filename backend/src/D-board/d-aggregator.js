// backend/src/D-board/d-aggregator.js

import VisualizerData from "../models/VisualizerData.js";
import SystemInfo from "../models/SystemInfo.js";
import Dashboard from "../models/Dashboard.js";
import Agent from "../models/Agent.js";

// -----------------------------------------
// Helper: Parse timestamps safely
// -----------------------------------------
function parseDate(v) {
  if (!v) return null;
  if (typeof v === "object") {
    if (v.$date) return new Date(v.$date);
    if (v.$numberLong) return new Date(Number(v.$numberLong));
  }
  return new Date(v);
}

// -----------------------------------------
// Extract all possible IPs from a SystemInfo doc
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

  return ips.filter(Boolean);
}

// -----------------------------------------
// MAIN WORKER
// -----------------------------------------
async function runDashboardWorker(interval = 4500) {
  console.log(`📊 Dashboard Worker running every ${interval}ms`);

  const routerEndings = [1, 250, 253, 254];

  const loop = async () => {
    try {
      // 1. Fetch Raw Data
      const agents = await Agent.find({}).lean();
      const sysRaw = await SystemInfo.find({}).lean();
      const vizRaw = await VisualizerData.find({}).lean();

      // 2. Map System Info by AgentId
      const sysByAgentId = {};
      sysRaw.forEach((sys) => {
        if (sys.agentId) sysByAgentId[sys.agentId] = sys;
      });

      // 3. Classify Agents (Active vs Inactive) using Agent.status
      const activeAgents = [];
      const inactiveAgents = [];

      agents.forEach((agent) => {
        const sys = sysByAgentId[agent.agentId] || {};
        const sysData = sys.data || {};

        // Merge agent + system info
        const richAgent = {
          agentId: agent.agentId,
          ip: agent.ip || sysData.ip || "unknown",
          hostname: sysData.hostname || "Unknown",
          status: agent.status || "offline",
          lastSeen: agent.lastSeen,
          cpu: sysData.cpu,
          memory: sysData.memory,
          os: sysData.os_type,
          system: sysData,
          mac: agent.mac || sysData.mac || null,  // ⭐ NEW: Include MAC
          timestamp: agent.lastSeen // ⭐ NEW: Populate timestamp for "Detected At"
        };

        if (agent.status === 'online') {
          activeAgents.push(richAgent);
        } else {
          inactiveAgents.push(richAgent);
        }
      });

      // 4. Build "All Devices" (Union of Agents & Scanned Devices)
      //    Strategy: Map keys using MAC if available, else IP.

      const allDevicesMap = new Map(); // Key: MAC or IP, Value: Device Object

      // Helper to add device
      const addOrUpdateDevice = (device, isAgent) => {
        // Try to find existing by MAC
        if (device.mac && allDevicesMap.has(device.mac)) {
          const existing = allDevicesMap.get(device.mac);
          // Agent always overwrites generic scan
          if (isAgent) {
            allDevicesMap.set(device.mac, { ...existing, ...device, source: 'agent', noAgent: false });
          } else {
            // If existing is agent, keep agent data but maybe update lastSeen from scan
            // If existing is scan, update with newer scan
            if (existing.source !== 'agent') {
              allDevicesMap.set(device.mac, { ...existing, ...device });
            }
          }
          return;
        }

        // Try to find existing by IP (if MAC didn't match or wasn't present)
        if (device.ip && device.ip !== 'unknown' && allDevicesMap.has(device.ip)) {
          const existing = allDevicesMap.get(device.ip);

          // If one has MAC and other doesn't, or both have same MAC (handled above), or different MACs (IP conflict?)
          // If existing has MAC and new doesn't -> keep existing (it's better identified)
          // If new has MAC and old doesn't -> replace/update

          if (isAgent) {
            // Agent wins IP slot
            allDevicesMap.set(device.ip, { ...existing, ...device, source: 'agent', noAgent: false });
          } else {
            // Scanner found IP. 
            if (existing.source !== 'agent') {
              allDevicesMap.set(device.ip, { ...existing, ...device });
            }
          }
          return;
        }

        // No match, add new (Uniquely Keyed)
        // Prefer MAC, then IP. Fallback to agentId if agent.
        let key = device.mac || device.ip;

        if ((!key || key === 'unknown') && isAgent) {
          key = device.agentId;
        }

        if (key && key !== 'unknown') {
          allDevicesMap.set(key, { ...device, source: isAgent ? 'agent' : 'scanner', noAgent: !isAgent });
        }
      };

      // A. ADD AGENTS
      [...activeAgents, ...inactiveAgents].forEach(a => addOrUpdateDevice(a, true));

      // B. ADD SCANNER DATA
      const routers = [];
      const unknownDevices = [];

      vizRaw.forEach(scan => {
        if (!scan.ip) return;

        const device = {
          ip: scan.ip,
          hostname: scan.hostname || "Unknown",
          mac: scan.mac || null,
          vendor: scan.vendor || "Unknown",
          createdAt: scan.createdAt || scan.timestamp,
          timestamp: scan.createdAt || scan.timestamp, // ⭐ ADDED for "Detected At"
        };

        addOrUpdateDevice(device, false);
      });

      // Re-process map to separate routers/unknowns based on final list
      const finalDevices = Array.from(allDevicesMap.values());

      // Filter Routers/Unknowns derived from the final list
      // (Only those that are NOT agents)
      finalDevices.forEach(d => {
        if (d.source === 'agent') return; // Agents aren't "unknown" or "routers" needing classification here typically

        const lastOctet = Number(d.ip.split('.').pop());
        if (routerEndings.includes(lastOctet)) {
          routers.push(d);
        } else {
          unknownDevices.push(d);
        }
      });

      // All Devices = Agents + Unknowns + Routers (basically everything in map)
      // But usually dashboard wants "All Devices" list.
      const allDevices = finalDevices;

      // -----------------------------------------
      // FINAL SNAPSHOT
      // -----------------------------------------
      const snapshot = {
        _id: "dashboard_latest",
        timestamp: new Date(),

        summary: {
          all: allDevices.length,
          active: activeAgents.length,
          inactive: inactiveAgents.length,
          unknown: unknownDevices.length,
          routers: routers.length,
        },

        allDevices,
        activeAgents,
        inactiveAgents,
        routers,
        unknownDevices,
      };

      await Dashboard.updateOne(
        { _id: "dashboard_latest" },
        { $set: snapshot },
        { upsert: true }
      );

      console.log("✅ Dashboard snapshot updated");
    } catch (err) {
      console.error("❌ Dashboard Worker Error:", err);
    }
  };

  await loop();
  setInterval(loop, interval);
}

export default runDashboardWorker;
