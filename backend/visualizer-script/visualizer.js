import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ScanResult from "../models/VisualizerScanner.js";
import SystemInfo from "../models/SystemInfo.js";
import VisualizerData from "../models/VisualizerData.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.resolve(__dirname, "../config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const MONGO_URI = config.mongo_uri;

let connected = false;
async function connectDB() {
  if (!connected) {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    connected = true;
    console.log("✅ MongoDB connected for visualizer update");
  }
}

export async function runVisualizerUpdate() {
  try {
    await connectDB();

    const allScans = await ScanResult.find({}).sort({ createdAt: -1 });
    if (!allScans.length) {
      console.log("⚠️ No scan results found.");
      return;
    }

    const systems = await SystemInfo.find();
    const ipToHostname = new Map();
    const ipToAgentId = new Map();
    const systemIPs = new Set();

    systems.forEach((sys) => {
      const wlanData = sys.data?.wlan_info || sys.wlan_ip || [];
      const hostname = sys.data?.hostname || sys.hostname || "Unknown";
      const agentId = sys?.agent_id || sys.agentId || "unknown";

      wlanData.forEach((iface) => {
        const ip = (iface.address || "").trim();
        if (ip) {
          systemIPs.add(ip);
          ipToHostname.set(ip, hostname);
          ipToAgentId.set(ip, agentId);
        }
      });
    });

    const aliveDevices = allScans.filter(
      (dev) =>
        dev.isAlive === true ||
        dev.ping_only === true ||
        dev.status === "alive" ||
        dev.pingSuccess === true
    );

    if (!aliveDevices.length) {
      console.log("⚠️ No active devices detected — nothing updated.");
      return;
    }

    const finalDevices = aliveDevices.map((dev) => {
      const ip = (dev.ips?.[0] || "N/A").trim();
      const hasAgent = systemIPs.has(ip);
      const hostname = hasAgent ? ipToHostname.get(ip) || "Unknown" : "Unknown";
      const agentId = hasAgent ? ipToAgentId.get(ip) || "unknown" : "unknown";

      return {
        agentId,
        ip,
        mac: dev.mac || "Unknown",
        vendor: dev.vendor || "Unknown",
        hostname,
        noAgent: !hasAgent,
        createdAt: new Date(),
      };
    });

    await VisualizerData.deleteMany({});
    await VisualizerData.insertMany(finalDevices);

    console.log(
      `[${new Date().toLocaleTimeString()}] ✅ Visualizer updated — ${finalDevices.length} active devices stored`
    );
  } catch (err) {
    console.error(
      `[${new Date().toLocaleTimeString()}] ❌ Visualizer update failed:`,
      err.message
    );
  }
}
