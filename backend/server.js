// backend/server.js
import express from "express";
import http from "http";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { connectMongo } from "./db.js";
import { saveAgentData } from "./save.js";
import * as GetData from "./get.js";
import { checkUsbStatus } from "./controllers/usbhandler.js";
import usbRoutes from "./api/usb.js";
import loginRoutes from "./api/login.js";
import setupRoutes from "./api/setup.js";
import "./visualizer-script/visualizerScanner.js";

dotenv.config();

const CONFIG_PATH = path.resolve("./config.json");
let config = fs.existsSync(CONFIG_PATH)
  ? JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"))
  : {};

console.log("🔍 Loaded config:", config);
import visualizerDataRoute from "./api/visualizerData.js";
import systemRoutes from "./api/system.js";
import { getLogsSnapshot } from "./controllers/logsController.js";
import logsStatusRoute from "./api/logs.js";
import scanRunRouter from "./api/scanRun.js";
import { isRouterIP } from "./utils/networkHelpers.js"; // ✅ Router detection utility
import LogsStatus from "./models/Log.js"; // ✅ Model for logs snapshot

import "./visualizer-script/visualizerScanner.js";



const app = express();
app.use(cors({ origin: config.cors_origin || "*" }));
app.use(express.json());

// ✅ Health check
// Register API routes
app.use("/api/visualizer-data", visualizerDataRoute);
app.use("/api", systemRoutes);
app.use("/api/logs-status", logsStatusRoute);
app.use("/api/usb", usbRoutes);
app.use("/api/scan", scanRunRouter);

app.get("/health", (_req, res) =>
  res.json({ status: "ok", ts: new Date().toISOString() })
);

// ✅ API routes
app.use("/api/setup", setupRoutes);
app.use("/api/auth", loginRoutes);
app.use("/api/usb", usbRoutes);

// ✅ Check if setup is complete (used by frontend)
app.get("/api/check-setup", (_req, res) => {
  try {
    const isConfigured = !!(config.mongo_uri && config.mongo_uri.trim() !== "");
    res.json({ setupComplete: isConfigured });
  } catch (err) {
    console.error("Error checking setup:", err);
    res.status(500).json({ setupComplete: false });
  }
});

const logPath = path.join(process.cwd(), "agent_data_log.json");

let io;
let server;
// --- Create HTTP and WebSocket server ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.cors_origin || "*", methods: ["GET", "POST"] },
  pingTimeout: 20000,
  pingInterval: 5000,
});

// --- Log path for incoming agent data ---
const logPath = path.join(process.cwd(), "agent_data_log.json");

// 🧠 Emit live logs snapshot every 10 seconds
setInterval(async () => {
  try {
    // Get snapshot (system info + unknown devices + server status)
    let snapshot = await getLogsSnapshot();

    // 🧩 Filter out routers/hotspots from unknownDevices
    snapshot.unknownDevices = snapshot.unknownDevices.filter(
      (dev) => !isRouterIP(dev.ip, dev.hostname, dev.vendor)
    );

    // 🧹 Keep only ONE entry in LogsStatus (replace each cycle)
    await LogsStatus.findOneAndUpdate({}, { $set: snapshot }, { upsert: true, new: true });

    // Emit to connected clients
    io.emit("logs_status_update", snapshot);
    console.log("[🧠] Logs snapshot updated & broadcast:", new Date().toISOString());
  } catch (err) {
    console.error("❌ logs broadcast error:", err);
  }
}, 5000);

// --- Socket.IO agent communication ---
io.on("connection", (socket) => {
  const ip =
    socket.handshake.headers["x-forwarded-for"]?.split(",")[0] ||
    socket.handshake.address ||
    "unknown";
  console.log(`🔌 Agent connected: ${socket.id} (${ip})`);

// ===================================================
// 🔌 SOCKET.IO INITIALIZER
// ===================================================
function initializeSocketServer() {
  io = new Server(server, {
    cors: { origin: config.cors_origin || "*", methods: ["GET", "POST"] },
    pingTimeout: 20000,
    pingInterval: 5000,
  });

  io.on("connection", (socket) => {
    const ip =
      socket.handshake.headers["x-forwarded-for"]?.split(",")[0] ||
      socket.handshake.address ||
      "unknown";
    console.log(`🔌 Agent connected: ${socket.id} (${ip})`);

    socket.on("agent_data", async (payload) => {
      try {
        if (!payload?.type || !payload?.data || !payload?.agentId) {
          socket.emit("agent_response", { success: false, message: "Invalid payload format" });
          return;
        }

        payload.ip = ip;

        // 🧾 Log all received data
        try {
          const logs = fs.existsSync(logPath)
            ? JSON.parse(fs.readFileSync(logPath, "utf-8"))
            : [];
          logs.push({ timestamp: new Date().toISOString(), payload });
          fs.writeFileSync(logPath, JSON.stringify(logs, null, 2), "utf-8");
        } catch (err) {
          console.error("❌ Failed to log agent data:", err);
        }

        console.log(`[📦] Received ${payload.type} from agent ${payload.agentId} (${ip})`);

        // 🔹 Handle USB devices
        if (payload.type === "usb_devices") {
          const connectedDevices = payload.data.connected_devices || [];
          console.log("[🔹] Connected devices received:", connectedDevices);

          const devicesWithStatus = await checkUsbStatus(payload.agentId, connectedDevices);
          socket.emit("usb_validation", { devices: devicesWithStatus });
          console.log("[✅] USB statuses sent to agent:", devicesWithStatus);
          return;
        }

        // 💾 Save agent data
        await saveAgentData(payload);
        socket.emit("agent_response", { success: true, message: `${payload.type} saved successfully` });
      // --- Optional local JSON log for debugging ---
      try {
        const logs = fs.existsSync(logPath)
          ? JSON.parse(fs.readFileSync(logPath, "utf-8"))
          : [];
        logs.push({ timestamp: new Date().toISOString(), payload });
        fs.writeFileSync(logPath, JSON.stringify(logs.slice(-200), null, 2), "utf-8"); // keep last 200 only
      } catch (err) {
        console.error("❌ Error handling agent data:", err);
        socket.emit("agent_response", {
          success: false,
          message: "Failed to save agent data",
          error: err.message,
        });
      }
    });

    socket.on("get_data", async (params, callback) => {
      try {
        const result = await GetData.fetchData(params);
        callback(result);
      } catch (err) {
        console.error("❌ Error fetching data:", err);
        callback({ success: false, message: "Failed to fetch data", error: err.message, data: [] });
      console.log(`[📦] Received ${payload.type} from agent ${payload.agentId} (${ip})`);

      // --- Handle USB devices separately ---
      if (payload.type === "usb_devices") {
        const connectedDevices = payload.data.connected_devices || [];
        console.log("[🔹] Connected devices received:", connectedDevices);

        const devicesWithStatus = await checkUsbStatus(payload.agentId, connectedDevices);
        socket.emit("usb_validation", { devices: devicesWithStatus });
        console.log("[✅] USB statuses sent to agent:", devicesWithStatus);
        return;
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`⚠️ Agent disconnected: ${socket.id} (${reason})`);
    });
      // --- Save data for all other agent types ---
      await saveAgentData(payload);
      socket.emit("agent_response", {
        success: true,
        message: `${payload.type} saved successfully`,
      });
    } catch (err) {
      console.error("❌ Error handling agent data:", err);
      socket.emit("agent_response", {
        success: false,
        message: "Failed to save agent data",
        error: err.message,
      });
    }
  });
}

// ===================================================
// 🚀 START SERVER
// ===================================================
  socket.on("get_data", async (params, callback) => {
    try {
      const result = await GetData.fetchData(params);
      callback(result);
    } catch (err) {
      console.error("❌ Error fetching data:", err);
      callback({
        success: false,
        message: "Failed to fetch data",
        error: err.message,
        data: [],
      });
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`⚠️ Agent disconnected: ${socket.id} (${reason})`);
  });
});

// --- Start server ---
async function start() {
  try {
    // ----------------------------
    // 1️⃣ SETUP MODE
    // ----------------------------
    if (!config.mongo_uri) {
      console.warn("⚠️ No Mongo URI found — entering SETUP MODE...");

      const setupServer = http.createServer(app);
      setupServer.listen(config.socket_port || 5000, "0.0.0.0", () => {
        console.log(
          `🛠️ Setup mode active — open http://localhost:${config.socket_port || 5000}/setup to configure`
        );
      });

      // Watch for config.json updates
      fs.watchFile(CONFIG_PATH, async () => {
        try {
          const updatedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
          if (updatedConfig.mongo_uri && updatedConfig.mongo_uri !== config.mongo_uri) {
            console.log("🔁 Mongo URI added — reloading server...");

            config = updatedConfig;

            await connectMongo(config.mongo_uri);
            console.log("✅ MongoDB connected after setup");

            // Close setup server before switching
            setupServer.close(() => {
              console.log("♻️ Switching from setup mode to full backend...");

              server = http.createServer(app);
              initializeSocketServer();

              server.listen(config.socket_port || 5000, "0.0.0.0", () => {
                console.log(`🚀 Server running on port ${config.socket_port || 5000}`);
              });
            });
          }
        } catch (err) {
          console.error("❌ Failed during reload check:", err);
        }
      });

      return;
    }

    // ----------------------------
    // 2️⃣ NORMAL MODE
    // ----------------------------
    await connectMongo(config.mongo_uri);
    console.log("✅ MongoDB connected");

    server = http.createServer(app);
    initializeSocketServer();

    server.listen(config.socket_port || 5000, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${config.socket_port || 5000}`);
    });
  } catch (err) {
    console.error("💥 Failed to start server:", err);
    process.exit(1);
  }
}

// ===================================================
// 🔄 AUTO-RELOAD CONFIG WHEN SETUP FINISHES
// ===================================================
fs.watchFile(CONFIG_PATH, (curr, prev) => {
  try {
    const updatedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    if (updatedConfig.mongo_uri && updatedConfig.mongo_uri !== config.mongo_uri) {
      config = updatedConfig;
      console.log("🔄 Config updated in runtime — Mongo URI loaded.");
    }
  } catch (err) {
    console.error("⚠️ Error reloading config:", err.message);
  }
});

start();
