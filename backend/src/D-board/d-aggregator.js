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
          system: sysData
        };

        if (agent.status === 'online') {
          activeAgents.push(richAgent);
        } else {
          inactiveAgents.push(richAgent);
        }
      });

      // 4. Build "All Devices" (Union of Agents & Scanned Devices)
      //    Key: IP Address
      const deviceMap = new Map();

      // Add all agents first (they are authoritative)
      [...activeAgents, ...inactiveAgents].forEach(agent => {
        if (agent.ip && agent.ip !== 'unknown') {
          deviceMap.set(agent.ip, {
            ...agent,
            source: 'agent',
            noAgent: false
          });
        }
      });

      // Merge Visualizer Data (Scanner)
      // Only add if IP doesn't exist (unless it provides useful metadata, but Agent data is usually richer)
      // If it exists, we stick with the Agent record but maybe mark it as scanned

      const routers = [];
      const unknownDevices = [];

      vizRaw.forEach(scan => {
        if (!scan.ip) return;
        const ip = scan.ip;

        if (deviceMap.has(ip)) {
          // Device is an agent, do nothing (Agent info > Scan info)
        } else {
          // Device is NOT an agent (Unmanaged)
          const device = {
            ip: scan.ip,
            hostname: scan.hostname || "Unknown",
            mac: scan.mac || "Unknown",
            vendor: scan.vendor || "Unknown",
            createdAt: scan.createdAt || scan.timestamp,
            noAgent: true,
            source: 'scanner'
          };

          deviceMap.set(ip, device);

          // Check if Router
          const lastOctet = Number(ip.split('.').pop());
          if (routerEndings.includes(lastOctet)) {
            routers.push(device);
          } else {
            unknownDevices.push(device);
          }
        }
      });

      const allDevices = Array.from(deviceMap.values());

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
