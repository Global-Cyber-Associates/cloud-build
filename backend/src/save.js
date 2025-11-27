import Agent from "./models/Agent.js";
import SystemInfo from "./models/SystemInfo.js";
import InstalledApps from "./models/InstalledApps.js";
import PortScanData from "./models/PortScan.js";
import TaskInfo from "./models/TaskInfo.js";

// ⭐ Network scanner model
import VisualizerScanner from "./models/VisualizerScanner.js";

// ⭐ Vulnerability scan model
import ScanResult from "./models/ScanResult.js";


// =====================================================
// ORIGINAL FUNCTION (UNCHANGED)
// =====================================================
export async function saveAgentData(payload) {
  try {
    if (!payload || !payload.type || !payload.data || !payload.agentId) {
      console.error("❌ Invalid payload: missing type, data, or agentId");
      return;
    }

    const { type, agentId, data } = payload;
    const timestamp = payload.timestamp || new Date().toISOString();

    try {
      await Agent.findOneAndUpdate(
        { agentId },
        {
          $set: {
            agentId,
            socketId: payload.socket_id || null,
            ip: payload.ip || "unknown",
            lastSeen: new Date(),
          },
        },
        { upsert: true, new: true }
      );
      console.log(`💾 Agent [${agentId}] saved/updated`);
    } catch (err) {
      console.error(`❌ Failed to upsert Agent [${agentId}]:`, err);
      return;
    }

    if (type === "usb_devices") {
      console.log("ℹ️ USB data skipped.");
      return;
    }

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
        console.warn(`⚠️ Unknown data type: ${type}`);
        return;
    }

    const doc = { agentId, timestamp, type, data };

    try {
      await Model.findOneAndUpdate(
        { agentId },
        { $set: doc },
        { upsert: true, new: true }
      );
      console.log(`✅ [${type}] saved for agent ${agentId}`);
    } catch (err) {
      console.error(`❌ Failed to save [${type}] for agent ${agentId}:`, err);
    }

  } catch (err) {
    console.error("❌ Failed to save agent data:", err);
  }
}



// =====================================================
// ⭐ UPDATED NETWORK SCAN HANDLER (REALTIME SYNC)
// =====================================================
export async function saveNetworkScan(devicesList) {
  try {
    console.log("📡 saveNetworkScan CALLED. devices =", devicesList?.length);

    if (!Array.isArray(devicesList)) {
      console.error("❌ network_scan_raw invalid payload");
      return;
    }

    // 1️⃣ Extract only the alive IPs from this scan
    const aliveIPs = devicesList.map(d => d.ip.trim());

    // 2️⃣ REMOVE ALL old/stale IPs not in current scan
    await VisualizerScanner.deleteMany({
      ip: { $nin: aliveIPs }
    });

    // 3️⃣ UPSERT all current alive devices
    for (const dev of devicesList) {
      if (!dev.ip) continue;
      const ip = dev.ip.trim();

      await VisualizerScanner.findOneAndUpdate(
        { ip },
        {
          $set: {
            ip,
            mac: dev.mac || null,
            vendor: dev.vendor || null,
            ping_only: dev.ping_only ?? true,
            lastSeen: new Date(),
            updatedAt: new Date(),
          }
        },
        { upsert: true }
      );
    }

  } catch (err) {
    console.error("❌ Failed to save network scan:", err);
  }
}



// =====================================================
// ⭐ NEW: SAVE VULNERABILITY SCAN RESULTS
// =====================================================
export async function saveVulnerabilityScan(scanObject) {
  try {
    console.log("🛡️ saveVulnerabilityScan CALLED.");

    if (!scanObject || !scanObject.hosts) {
      console.error("❌ Invalid vuln scan payload:", scanObject);
      return;
    }

    // Overall impact calculation
    const impacts = scanObject.hosts.map(h => h.impact_level || "Info");
    const order = ["Info", "Low", "Medium", "High", "Critical"];

    const overall_impact =
      impacts.length > 0
        ? impacts.sort((a, b) => order.indexOf(b) - order.indexOf(a))[0]
        : "Info";

    const doc = {
      ok: scanObject.ok,
      network: scanObject.network,
      scanned_at: scanObject.scanned_at,
      duration_seconds: scanObject.duration_seconds,
      hosts: scanObject.hosts,
      overall_impact,
      raw: scanObject,
      updated_at: new Date(),
    };

    await ScanResult.findOneAndUpdate(
      {},
      { $set: doc },
      { upsert: true, new: true }
    );

    console.log("✅ Vulnerability scan saved to ScanResult.");

  } catch (err) {
    console.error("❌ Failed to save vulnerability scan:", err);
  }
}
