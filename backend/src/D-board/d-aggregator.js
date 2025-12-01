// backend/src/D-board/d-aggregator.js

import VisualizerData from "../models/VisualizerData.js";
import SystemInfo from "../models/SystemInfo.js";
import Dashboard from "../models/Dashboard.js";

// -----------------------------------------
// Helper: Parse weird Mongo timestamps
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
// Extract all possible IPs from a system doc
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
// The worker function
// -----------------------------------------
async function runDashboardWorker(interval = 4500) {
  console.log(`📊 Dashboard Worker running every ${interval}ms`);

  const ROUTER_ENDINGS = [1, 250, 253, 254];

  const loop = async () => {
    try {
      const vizRaw = await VisualizerData.find({}).lean();
      const sysRaw = await SystemInfo.find({}).lean();

      if (!vizRaw.length && !sysRaw.length) {
        console.log("📭 No visualizer/system data yet — skipping");
        return;
      }

      // -----------------------------------------
      // Build latest visualizer per IP
      // -----------------------------------------
      const latest = {};
      vizRaw.forEach((d) => {
        if (!d.ip) return;

        const existing = latest[d.ip];
        const newT = parseDate(d.createdAt || d.timestamp);
        const oldT = existing ? parseDate(existing.createdAt || existing.timestamp) : null;

        if (!existing || (newT && oldT && newT > oldT) || (newT && !oldT)) {
          latest[d.ip] = d;
        }
      });

      const visualizerData = Object.values(latest);

      // -----------------------------------------
      // Extract agent IPs
      // -----------------------------------------
      const agentIPSet = new Set();
      sysRaw.forEach((s) => extractIPs(s).forEach((ip) => agentIPSet.add(ip)));

      // -----------------------------------------
      // Classify devices
      // -----------------------------------------
      const activeAgents = visualizerData.filter(
        (d) => !d.noAgent && agentIPSet.has(d.ip)
      );

      const inactiveAgents = sysRaw.filter((s) => {
        const ips = extractIPs(s);
        if (!ips.length) return false;
        return ips.every((ip) => !visualizerData.some((v) => v.ip === ip));
      });

      const unmanaged = visualizerData.filter((d) => d.noAgent === true);

      const routers = unmanaged.filter((d) => {
        const last = Number(d.ip.split(".")[3]);
        const hasAgents = agentIPSet.size > 0;

        if (ROUTER_ENDINGS.includes(last) && !hasAgents) return true;

        if (ROUTER_ENDINGS.includes(last) && hasAgents) {
          const subnet = d.ip.split(".").slice(0, 3).join(".");
          return [...agentIPSet].some(
            (x) => x.split(".").slice(0, 3).join(".") === subnet
          );
        }

        return false;
      });

      const unknownDevices = unmanaged.filter(
        (d) => !routers.some((r) => r.ip === d.ip)
      );

      const allDevices = visualizerData.filter(
        (d) => !routers.some((r) => r.ip === d.ip)
      );

      // -----------------------------------------
      // Build snapshot object
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

      // Save (upsert)
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

  // Run instantly, then on interval
  await loop();
  setInterval(loop, interval);
}

// ⭐ ESM default export
export default runDashboardWorker;
