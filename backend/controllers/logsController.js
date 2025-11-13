import SystemInfo from "../models/SystemInfo.js";
import VisualizerData from "../models/VisualizerData.js";
import UsbDevice from "../models/usbdevices.js";

// ✅ Router detection (expanded)
function isRouter(ip = "") {
  return (
    ip.endsWith(".0.1") ||
    ip.endsWith(".1.1") ||
    ip.endsWith(".254") ||
    ip.endsWith(".1.254") ||
    ip.endsWith(".0.254") ||
    ip.endsWith(".43.1") ||
    ip.endsWith(".137.1") ||
    ip.endsWith(".2.1") ||
    ip.endsWith(".10.1") ||
    ip.endsWith(".248.1") ||
    ip.endsWith(".225.1") ||
    ip.endsWith(".42.129")
  );
}

export async function getLogsSnapshot() {
  try {
    const now = Date.now();

    // ✅ 1. Agents (systeminfo)
    const agents = await SystemInfo.find(
      {},
      {
        agentId: 1,
        "data.hostname": 1,
        "data.ip": 1,
        "data.os_type": 1,
        "data.os_version": 1,
        "data.memory.ram_percent": 1,
        "data.cpu.logical_cores": 1,
        timestamp: 1,
      }
    ).lean();

    const agentSnapshots = agents.map((a) => {
      const lastSeen = new Date(a.timestamp).getTime();
      const isOnline = now - lastSeen < 15000; // 15s threshold
      return {
        agentId: a.agentId,
        hostname: a.data?.hostname || "Unknown",
        ip: a.data?.ip || "Unknown",
        os_type: a.data?.os_type || "Unknown",
        os_version: a.data?.os_version || "Unknown",
        ram_percent: a.data?.memory?.ram_percent || 0,
        cpu_cores: a.data?.cpu?.logical_cores || 0,
        status: isOnline ? "online" : "offline",
        lastSeen: a.timestamp,
      };
    });

    // ✅ 2. Unknown Devices (filter out routers)
    const visualizers = await VisualizerData.find({}).lean();
    const unknownDevices = visualizers.filter(
      (v) => v.noAgent && !isRouter(v.ip)
    );

    // ✅ 3. USB Devices (auto-update last_seen for active devices)
    const usbEntries = await UsbDevice.find({}).lean();
    const usbDevices = usbEntries.map((entry) => ({
      agentId: entry.agentId,
      devices: (entry.data?.connected_devices || []).map((dev) => ({
        serial_number: dev.serial_number,
        description: dev.description,
        drive_letter: dev.drive_letter,
        status: dev.status,
        last_seen:
          dev.status === "Allowed" || dev.status === "WaitingForApproval"
            ? new Date() // refresh timestamp for active devices
            : dev.last_seen,
      })),
    }));

    // ✅ 4. Server info
    const server = {
      status: "online",
      message: "Server running OK",
    };

    // ✅ 5. Build snapshot object
    const snapshot = {
      agents: agentSnapshots,
      server,
      unknownDevices,
      usbDevices,
      timestamp: new Date(),
    };

    return snapshot;
  } catch (err) {
    console.error("❌ Error building logs snapshot:", err);
    return {
      agents: [],
      server: { status: "error", message: err.message },
      unknownDevices: [],
      usbDevices: [],
      timestamp: new Date(),
    };
  }
}
