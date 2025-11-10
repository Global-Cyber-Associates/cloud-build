import Agent from "./models/Agent.js";
import SystemInfo from "./models/SystemInfo.js";
import InstalledApps from "./models/InstalledApps.js";
import PortScanData from "./models/PortScan.js";
import TaskInfo from "./models/TaskInfo.js";

export async function saveAgentData(payload) {
  try {
    if (!payload || !payload.type || !payload.data || !payload.agentId) {
      console.error("❌ Invalid payload: missing type, data, or agentId");
      return;
    }

    const { type, agentId, data } = payload;
    const timestamp = payload.timestamp || new Date().toISOString();

    // 1️⃣ Create or update Agent entry
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

    // 2️⃣ Skip usb_devices entirely
    if (type === "usb_devices") {
      console.log("ℹ️ USB data is handled separately. Skipping save here.");
      return;
    }

    // 3️⃣ Select the correct model
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
        console.warn(`⚠️ Unknown data type: ${type}. Ignoring.`);
        return;
    }

    const doc = { agentId, timestamp, type, data };

    // 4️⃣ Save to MongoDB
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
