//backend/src/server.js
import express from "express";
import http from "http";
import cors from "cors";
import fs from "fs";
import path from "path";
import { Server } from "socket.io";
import { connectMongo } from "./db.js";

import dotenv from "dotenv";
dotenv.config();

import { saveAgentData, saveNetworkScan, saveVulnerabilityScan } from "./save.js";
import { runVisualizerUpdate } from "./visualizer-script/visualizer.js";
import { seedUsers } from "./seed.js";

import * as GetData from "./get.js";
import { checkUsbStatus } from "./controllers/usbhandler.js";
import usbRoutes from "./api/usb.js";
import visualizerDataRoute from "./api/visualizerData.js";
import systemRoutes from "./api/system.js";
import { getLogsSnapshot } from "./controllers/logsController.js";
import logsStatusRoute from "./api/logs.js";

import { isRouterIP } from "./utils/networkHelpers.js";
import LogsStatus from "./models/Log.js";
import Agent from "./models/Agent.js";
import authRoutes from "./api/auth.js";
import userRoutes from "./api/users.js";

import { initIO } from "./socket-nvs.js";

import VisualizerScanner from "./models/VisualizerScanner.js";
import VisualizerData from "./models/VisualizerData.js"; // ⭐ NEW: Import VisualizerData

import runDashboardWorker from "./D-board/d-aggregator.js";
import dashboardRoutes from "./api/d-board.js";


// -----------------------------------------------------
// CONFIG
// -----------------------------------------------------
const configPath = path.resolve("./config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const app = express();
app.use(cors({ origin: config.cors_origin || "*" }));
app.use(express.json());


// -----------------------------------------------------
// ROUTES (REST APIs)
// -----------------------------------------------------
app.use("/api/visualizer-data", visualizerDataRoute);
app.use("/api", systemRoutes);
app.use("/api/logs-status", logsStatusRoute);
app.use("/api/usb", usbRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.get("/api/auth/debug", (req, res) =>
  res.json({ msg: "AUTH ROUTES ACTIVE" })
);

app.get("/health", (_req, res) =>
  res.json({ status: "ok", ts: new Date().toISOString() })
);


// -----------------------------------------------------
// CREATE SERVER + SOCKET.IO
// -----------------------------------------------------
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: config.cors_origin || "*", methods: ["GET", "POST"] },
  pingTimeout: 20000,
  pingInterval: 5000,
});

// Register IO globally
initIO(io);

const logPath = path.join(process.cwd(), "agent_data_log.json");

global.ACTIVE_AGENTS = {};
global.ADMIN_SOCKET = null;   // ⭐ Admin auto-detection


// -----------------------------------------------------
// SOCKET.IO EVENTS
// -----------------------------------------------------
io.on("connection", (socket) => {
  const ip =
    socket.handshake.headers["x-forwarded-for"]?.split(",")[0] ||
    socket.handshake.address ||
    "unknown";

  console.log(`🔌 Agent connected: ${socket.id} (${ip})`);

  // AGENT REGISTRATION
  socket.on("register_agent", async (agentId) => {
    if (!agentId) return;
    console.log("🆔 Agent registered:", agentId, "socket:", socket.id);
    global.ACTIVE_AGENTS[agentId] = socket.id;

    // ⭐ MARK ONLINE
    try {
      await Agent.findOneAndUpdate(
        { agentId },
        {
          $set: {
            status: "online",
            lastSeen: new Date(),
            socketId: socket.id,
            ip: ip
          }
        },
        { upsert: true }
      );
    } catch (err) {
      console.error("❌ Failed to mark agent online:", err);
    }
  });

  // RAW NETWORK SCAN → IDENTIFIES ADMIN
  socket.on("network_scan_raw", async (devicesList) => {
    console.log("📡 RAW SCAN RECEIVED:", devicesList?.length);

    // ⭐ This socket is the admin
    global.ADMIN_SOCKET = socket.id;

    await saveNetworkScan(devicesList);
  });

  // RAW VULNERABILITY SCAN
  socket.on("network_vulnscan_raw", async (scanObject) => {
    try {
      console.log("🛡️ Received vulnerability scan result");
      await saveVulnerabilityScan(scanObject);
      console.log("🛡️ Vulnerability scan saved.");
    } catch (err) {
      console.error("❌ Failed to save vulnerability scan:", err);
    }
  });

  // FRONTEND GET_DATA
  socket.on("get_data", async (params, callback) => {
    try {
      const result = await GetData.fetchData(params);
      callback(result);
    } catch (err) {
      console.error("❌ Error fetching data:", err);
      callback({ success: false, message: "Failed", data: [] });
    }
  });

  // AGENT DATA
  socket.on("agent_data", async (payload) => {
    try {
      if (!payload?.type || !payload?.data || !payload?.agentId) {
        socket.emit("agent_response", {
          success: false,
          message: "Invalid payload format",
        });
        return;
      }

      // ⭐ Re-register if missing (Server Restart handling)
      if (!global.ACTIVE_AGENTS[payload.agentId]) {
        global.ACTIVE_AGENTS[payload.agentId] = socket.id;
        console.log(`♻️ Auto-registered agent on data: ${payload.agentId}`);
      }

      payload.ip = ip;

      try {
        const logs = fs.existsSync(logPath)
          ? JSON.parse(fs.readFileSync(logPath, "utf8"))
          : [];

        logs.push({ timestamp: new Date().toISOString(), payload });
        fs.writeFileSync(
          logPath,
          JSON.stringify(logs.slice(-200), null, 2),
          "utf8"
        );
      } catch (err) {
        console.error("❌ Failed to log agent data:", err);
      }

      if (payload.type === "usb_devices") {
        const connected = payload.data.connected_devices || [];
        const deviceStatus = await checkUsbStatus(payload.agentId, connected);
        socket.emit("usb_validation", { devices: deviceStatus });
        return;
      }

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


  // -----------------------------------------------------
  // UPDATED DISCONNECT HANDLER (admin disconnects → wipe scanner)
  // -----------------------------------------------------
  socket.on("disconnect", async (reason) => {
    console.log(`⚠️ Agent disconnected: ${socket.id} (${reason})`);

    // Remove from active agents
    for (const [agentId, id] of Object.entries(global.ACTIVE_AGENTS)) {
      if (id === socket.id) {
        delete global.ACTIVE_AGENTS[agentId];
        console.log(`🗑️ Removed offline agent: ${agentId}`);

        // ⭐ MARK OFFLINE
        try {
          await Agent.findOneAndUpdate(
            { agentId },
            { $set: { status: "offline", lastSeen: new Date() } }
          );
        } catch (err) {
          console.error("❌ Failed to mark agent offline:", err);
        }
        break;
      }
    }

    // ⭐ If ADMIN disconnected → wipe VisualizerScanner & VisualizerData
    if (socket.id === global.ADMIN_SOCKET) {
      console.log("🧹 Admin disconnected → clearing VisualizerScanner...");
      await VisualizerScanner.deleteMany({});

      console.log("🧹 Admin disconnected → clearing VisualizerData (Persistent)...");
      await VisualizerData.deleteMany({});

      global.ADMIN_SOCKET = null;
      console.log("🧼 VisualizerScanner & VisualizerData wiped.");
    }
  });
});


// -----------------------------------------------------
// VISUALIZER UPDATE LOOP (Updated)
// -----------------------------------------------------
setInterval(async () => {
  if (!global.ADMIN_SOCKET) {
    console.log("⏭️ Admin offline → skipping visualizer update");
    return;
  }

  try {
    await runVisualizerUpdate();
  } catch (err) {
    console.error("Visualizer update error:", err);
  }
}, 3500);


// -----------------------------------------------------
// LOAD scanRunRouter AFTER initIO(io)
// -----------------------------------------------------
import scanRunRouter from "./api/scanRun.js";
app.use("/api/scan", scanRunRouter);


// -----------------------------------------------------
// LOG SNAPSHOT LOOP
// -----------------------------------------------------
setInterval(async () => {
  try {
    let snapshot = await getLogsSnapshot();

    snapshot.unknownDevices = snapshot.unknownDevices.filter(
      (dev) => !isRouterIP(dev.ip, dev.hostname, dev.vendor)
    );

    await LogsStatus.findOneAndUpdate(
      {},
      { $set: snapshot },
      { upsert: true }
    );

    io.emit("logs_status_update", snapshot);
    console.log("[🧠] Logs snapshot updated");
  } catch (err) {
    console.error("❌ logs broadcast error:", err);
  }
}, 5000);


// -----------------------------------------------------
// START SERVER
// -----------------------------------------------------
async function start() {
  try {
    await connectMongo(config.mongo_uri);
    console.log("✅ MongoDB connected");

    // ⭐ STARTUP CLEANUP: Wipe old scan data
    console.log("🧹 Clearing stale scanner data...");
    await VisualizerScanner.deleteMany({});
    await VisualizerData.deleteMany({});
    console.log("✨ Visualizer collections wiped for fresh start.");

    await seedUsers();

    runDashboardWorker(4000);
    console.log("📊 Dashboard Worker running...");

    server.listen(config.socket_port || 5000, "0.0.0.0", () =>
      console.log(
        `🚀 Socket server running on port ${config.socket_port || 5000}`
      )
    );
  } catch (err) {
    console.error("💥 Failed to start server:", err);
    process.exit(1);
  }
}

start();
