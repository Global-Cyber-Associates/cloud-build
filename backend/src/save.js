import Agent from "./models/Agent.js";
import SystemInfo from "./models/SystemInfo.js";
import InstalledApps from "./models/InstalledApps.js";
import PortScanData from "./models/PortScan.js";
import TaskInfo from "./models/TaskInfo.js";
import VisualizerScanner from "./models/VisualizerScanner.js";
import ScanResult from "./models/ScanResult.js";
import mongoose from "mongoose";

// ⭐ DEFAULT TENANT (fallback for agents)
const DEFAULT_TENANT_ID = new mongoose.Types.ObjectId(
  "694114ce93766c317e31ff5a"
);

// =====================================================
// ⭐ RESOLVE AGENT + TENANT
// =====================================================
async function resolveAgentAndTenant(payload) {
  const { agentId } = payload;

  let agent = await Agent.findOne({ agentId });

  if (!agent) {
    agent = await Agent.create({
      agentId,
      tenantId: DEFAULT_TENANT_ID,
      socketId: payload.socket_id || null,
      ip: payload.ip || "unknown",
      lastSeen: new Date(),
      status: "online",
      mac: payload.mac || payload.data?.mac || null,
    });
  }

  return agent;
}

// =====================================================
// ⭐ SAVE AGENT DATA (PHASE-1 SAFE VERSION)
// =====================================================
export async function saveAgentData(payload) {
  try {
    if (!payload?.type || !payload?.data || !payload?.agentId) {
      console.error("❌ Invalid payload");
      return;
    }

    const { type, agentId, data } = payload;
    const timestamp = payload.timestamp || new Date().toISOString();

    // Resolve agent + tenant
    const agent = await resolveAgentAndTenant(payload);
    const tenantId = agent.tenantId;

    // Update agent heartbeat
    await Agent.findOneAndUpdate(
      { agentId , tenantId},
      {
        $set: {
          socketId: payload.socket_id || null,
          ip: payload.ip || "unknown",
          lastSeen: new Date(),
          status: "online",
          mac: payload.mac || payload.data?.mac || null,
        },
      }
    );

    // Skip USB payloads
    if (type === "usb_devices") return;

    let Model;
    switch (type) {
      case "system_info":
        Model = SystemInfo;
        break;
      case "installed_apps":
        Model = InstalledApps;
        break;
      case "port_scan":
        Model = PortScanData;
        break;
      case "task_info":
        Model = TaskInfo;
        break;
      default:
        return;
    }

    // 🔑 IMPORTANT:
    // We DO NOT filter by tenantId yet
    // We ONLY write tenantId
    await Model.findOneAndUpdate(
      { agentId },
      {
        $set: {
          agentId,
          tenantId,
          timestamp,
          type,
          data,
        },
      },
      { upsert: true }
    );

  } catch (err) {
    console.error("❌ saveAgentData failed:", err);
  }
}

// =====================================================
// ⭐ SAVE NETWORK SCAN (PHASE-1 SAFE)
// =====================================================
export async function saveNetworkScan(
  devicesList,
  tenantId = DEFAULT_TENANT_ID
) {
  try {
    if (!Array.isArray(devicesList)) return;

    const aliveIPs = devicesList
      .map((d) => d.ip?.trim())
      .filter(Boolean);

    // NOTE: VisualizerScanner schema must have tenantId later
    await VisualizerScanner.deleteMany({
      ip: { $nin: aliveIPs },
    });

    for (const dev of devicesList) {
      if (!dev.ip) continue;

      await VisualizerScanner.findOneAndUpdate(
        { ip: dev.ip.trim() },
        {
          $set: {
            ip: dev.ip.trim(),
            tenantId,
            mac: dev.mac || null,
            vendor: dev.vendor || null,
            ping_only: dev.ping_only ?? true,
            lastSeen: new Date(),
          },
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error("❌ saveNetworkScan failed:", err);
  }
}

// =====================================================
// ⭐ SAVE VULNERABILITY SCAN (PHASE-1 SAFE)
// =====================================================
export async function saveVulnerabilityScan(
  scanObject,
  tenantId = DEFAULT_TENANT_ID
) {
  try {
    if (!scanObject?.hosts) return;

    const order = ["Info", "Low", "Medium", "High", "Critical"];
    const impacts = scanObject.hosts.map(
      (h) => h.impact_level || "Info"
    );

    const overall_impact =
      impacts.length > 0
        ? impacts.sort(
            (a, b) => order.indexOf(b) - order.indexOf(a)
          )[0]
        : "Info";

    await ScanResult.findOneAndUpdate(
      {},
      {
        $set: {
          tenantId,
          ok: scanObject.ok,
          network: scanObject.network,
          scanned_at: scanObject.scanned_at,
          duration_seconds: scanObject.duration_seconds,
          hosts: scanObject.hosts,
          overall_impact,
          raw: scanObject,
          updated_at: new Date(),
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error("❌ saveVulnerabilityScan failed:", err);
  }
}
