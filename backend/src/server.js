// backend/src/server.js
import express from "express";
import http from "http";
import cors from "cors";
import fs from "fs";
import path from "path";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

import { connectMongo } from "./db.js";

import {
  saveAgentData,
  saveNetworkScan,
  saveVulnerabilityScan,
} from "./save.js";

import { runVisualizerUpdate } from "./visualizer-script/visualizer.js";
import { seedUsers } from "./seed.js";

import * as GetData from "./get.js";
import { checkUsbStatus } from "./controllers/usbhandler.js";
import { activateLicense } from "./utils/licenseManager.js";

import usbRoutes from "./api/usb.js";
import visualizerDataRoute from "./api/visualizerData.js";
import systemRoutes from "./api/system.js";
import logsStatusRoute from "./api/logs.js";
import dashboardRoutes from "./api/d-board.js";
import authRoutes from "./api/auth.js";
import userRoutes from "./api/users.js";
import adminRoutes from "./api/admin.js";

import agentRoutes from "./api/agentlist.js";
import installedAppsRoutes from "./api/installedApps.js";
import taskManagerRoutes from "./api/taskManager.js";
import licenseRoutes from "./api/license.js";

import { getLogsSnapshot } from "./controllers/logsController.js";
import { isRouterIP } from "./utils/networkHelpers.js";

import LogsStatus from "./models/Log.js";
import Agent from "./models/Agent.js";
import Tenant from "./models/Tenant.js";
import VisualizerScanner from "./models/VisualizerScanner.js";
import VisualizerData from "./models/VisualizerData.js";

import { initIO } from "./socket-nvs.js";
import runDashboardWorker from "./D-board/d-aggregator.js";
import scanRunRouter from "./api/scanRun.js";

// -----------------------------------------------------
// CONFIG
// -----------------------------------------------------
const configPath = path.resolve("./config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const app = express();
app.use(cors({ origin: config.cors_origin || "*" }));
app.use(express.json());

// -----------------------------------------------------
// ROUTES
// -----------------------------------------------------
app.use("/api/visualizer-data", visualizerDataRoute);
app.use("/api", systemRoutes);
app.use("/api/logs-status", logsStatusRoute);
app.use("/api/usb", usbRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/installed-apps", installedAppsRoutes);
app.use("/api/task-manager", taskManagerRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/license", licenseRoutes);

app.get("/api/auth/debug", (_req, res) =>
  res.json({ msg: "AUTH ROUTES ACTIVE" })
);

app.get("/health", (_req, res) =>
  res.json({ status: "ok", ts: new Date().toISOString() })
);

// -----------------------------------------------------
// SERVER + SOCKET.IO
// -----------------------------------------------------
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: config.cors_origin || "*", methods: ["GET", "POST"] },
  pingTimeout: 20000,
  pingInterval: 5000,
});

initIO(io);
app.set("io", io);

const logPath = path.join(process.cwd(), "agent_data_log.json");

global.ACTIVE_AGENTS = {};
global.ACTIVE_TENANTS = new Set(); // Track active tenants for visualizer updates

// -----------------------------------------------------
// SOCKET EVENTS
// -----------------------------------------------------
// -----------------------------------------------------
// SOCKET MIDDLEWARE: AUTHENTICATION
// -----------------------------------------------------
io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token || socket.handshake.headers?.token;

    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    // 🔹 STRIP "Bearer " prefix if present
    const cleanToken = token.startsWith("Bearer ") ? token.slice(7, token.length) : token;

    // console.log(`[SocketAuth] Token: ${cleanToken.substring(0, 10)}... (Original: ${token.substring(0,10)}...)`);

    // 1️⃣ Try as USER (JWT)
    try {
      const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);
      if (decoded && decoded.tenantId) {
        socket.user = decoded;
        socket.tenantId = decoded.tenantId;
        socket.isAgent = false;
        return next();
      }
    } catch (e) {
      // Not a JWT or invalid, proceed to check as Agent Key
    }

    // 2️⃣ Try as AGENT (Enrollment Key)
    const tenant = await Tenant.findOne({ enrollmentKey: cleanToken });
    if (tenant) {
      socket.tenantId = tenant._id.toString();
      socket.isAgent = true;
      return next();
    }

    return next(new Error("Authentication error: Invalid credentials"));
  } catch (err) {
    console.error("Socket auth error:", err);
    return next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  const ip =
    socket.handshake.headers["x-forwarded-for"]?.split(",")[0] ||
    socket.handshake.address ||
    "unknown";

  const type = socket.isAgent ? "🤖 Agent" : "👤 User";
  console.log(`🔌 Connected: ${socket.id} (${ip}) - ${type} [Tenant: ${socket.tenantId}]`);

  if (socket.tenantId) {
    socket.join(socket.tenantId.toString()); // ⭐ Join tenant room for broadcasts
    global.ACTIVE_TENANTS.add(socket.tenantId.toString());
  }

  // -------------------------------
  // AGENT REGISTRATION
  // -------------------------------
  socket.on("register_agent", async (payload) => {
    if (!payload) return;
    // Support both old (string) and new (object) registration
    const agentId = typeof payload === "string" ? payload : payload.agentId;
    const fingerprint = payload?.fingerprint;

    if (!agentId) return;

    global.ACTIVE_AGENTS[agentId] = socket.id;

    const updateFields = {
      tenantId: socket.tenantId,
      status: "online",
      lastSeen: new Date(),
      socketId: socket.id,
      ip,
    };

    if (fingerprint) {
      updateFields.fingerprint = fingerprint;
    }

    const agent = await Agent.findOneAndUpdate(
      { agentId, tenantId: socket.tenantId },
      { $set: updateFields },
      { upsert: true, new: true }
    );

    // If using the new licensing model, inform agent of status
    socket.emit("registration_status", {
      isLicensed: agent.isLicensed,
      fingerprintMatched: agent.fingerprint === fingerprint
    });
  });

  // -------------------------------
  // LICENSE ACTIVATION
  // -------------------------------
  socket.on("license_activate", async (payload, callback) => {
    try {
      if (!socket.isAgent || !socket.tenantId) {
        return callback({ success: false, message: "Unauthorized" });
      }

      const { agentId, fingerprint } = payload;
      const token = await activateLicense(socket.tenantId, agentId, fingerprint);

      callback({ success: true, token });
    } catch (err) {
      callback({ success: false, message: err.message });
    }
  });

  // -------------------------------
  // RAW NETWORK SCAN (TENANT SCOPED)
  // -------------------------------
  socket.on("network_scan_raw", async (devicesList) => {
    if (!socket.tenantId) return;
    await saveNetworkScan(devicesList, socket.tenantId);
  });

  socket.on("network_vulnscan_raw", async (scanObject) => {
    if (!socket.tenantId) return;
    await saveVulnerabilityScan(scanObject, socket.tenantId);
  });

  // -----------------------------------------------------
  // ⭐ FRONTEND GET_DATA — TENANT AWARE (STEP 6G)
  // -----------------------------------------------------
  // -----------------------------------------------------
  // ⭐ FRONTEND GET_DATA — TENANT AWARE
  // -----------------------------------------------------
  socket.on("get_data", async (params, callback) => {
    try {
      // Auth already handled at connection, but let's re-verify socket.tenantId exists
      if (!socket.tenantId) {
        return callback({
          success: false,
          message: "Tenant context missing in token",
          data: [],
        });
      }

      const result = await GetData.fetchData({
        ...params,
        tenantId: socket.tenantId, // Use socket's trusted tenantId
      });

      callback(result);
    } catch (err) {
      console.error("❌ get_data error:", err.message);
      callback({
        success: false,
        message: "Failed to fetch data",
        data: [],
      });
    }
  });

  // -------------------------------
  // AGENT DATA
  // -------------------------------
  socket.on("agent_data", async (payload) => {
    try {
      if (!payload?.type || !payload?.data || !payload?.agentId) return;

      global.ACTIVE_AGENTS[payload.agentId] = socket.id;
      payload.ip = ip;
      // Inject tenantId for verification
      payload.tenantId = socket.tenantId;

      try {
        const logs = fs.existsSync(logPath)
          ? JSON.parse(fs.readFileSync(logPath, "utf8"))
          : [];
        logs.push({ timestamp: new Date().toISOString(), payload });
        fs.writeFileSync(
          logPath,
          JSON.stringify(logs.slice(-200), null, 2)
        );
      } catch { }

      if (payload.type === "usb_devices") {
        const devices = payload.data.connected_devices || [];
        const status = await checkUsbStatus(payload.agentId, devices, socket.tenantId);
        // We emit back via socket 'usb_validation' manually here or inside checkUsbStatus?
        // usbhandler.js handles emission if socket is passed, but here we didn't pass socket object yet.
        // Let's rely on the return value or modify checking.

        socket.emit("usb_validation", { devices: status });
        return;
      }

      // 🔐 LICENSE ENFORCEMENT
      const agent = await Agent.findOne({ agentId: payload.agentId, tenantId: socket.tenantId });
      if (!agent || !agent.isLicensed) {
        console.warn(`[DENIED] Data from unlicensed/revoked agent: ${payload.agentId} (Tenant: ${socket.tenantId})`);
        return socket.emit("agent_response", {
          success: false,
          message: "Agent license revoked or not found. Please reactivate.",
          code: "LICENSE_REVOKED"
        });
      }

      await saveAgentData(payload, socket.tenantId);

      socket.emit("agent_response", {
        success: true,
        message: `${payload.type} saved`,
      });
    } catch (err) {
      console.error("❌ agent_data error:", err);
    }
  });

  // -------------------------------
  // DISCONNECT
  // -------------------------------
  socket.on("disconnect", async () => {
    for (const [agentId, sid] of Object.entries(global.ACTIVE_AGENTS)) {
      if (sid === socket.id) {
        delete global.ACTIVE_AGENTS[agentId];
        await Agent.findOneAndUpdate(
          { agentId },
          { $set: { status: "offline", lastSeen: new Date() } }
        );
      }
    }

    // We don't remove from ACTIVE_TENANTS immediately to avoid flicker, 
    // or we could implementing reference counting. 
    // For now, let's leave it; the visualizer loop isn't harmful if no data changes.
  });
});

// -----------------------------------------------------
// VISUALIZER LOOP (SAFE TO PAUSE)
// -----------------------------------------------------
setInterval(async () => {
  // Iterate over all active tenants
  for (const tenantId of global.ACTIVE_TENANTS) {
    await runVisualizerUpdate(tenantId);
  }
}, 3500);

// -----------------------------------------------------
// ROUTES: SCAN RUN
// -----------------------------------------------------
app.use("/api/scan", scanRunRouter);

// -----------------------------------------------------
// LOG SNAPSHOT LOOP
// -----------------------------------------------------
// -----------------------------------------------------
// LOG SNAPSHOT LOOP (MULTI-TENANT)
// -----------------------------------------------------
setInterval(async () => {
  // Iterate over all active tenants
  // console.log(`[DEBUG] Active Tenants: ${[...global.ACTIVE_TENANTS]}`); // Too verbose for 5s loop? Maybe once in a while.

  for (const tenantId of global.ACTIVE_TENANTS) {
    if (!tenantId) continue;

    try {
      const snapshot = await getLogsSnapshot(tenantId);

      // Filter unknown devices
      if (snapshot.unknownDevices) {
        snapshot.unknownDevices = snapshot.unknownDevices.filter(
          (d) => !isRouterIP(d.ip, d.hostname, d.vendor)
        );
      }

      // DB WRITE (Scoped)
      await LogsStatus.findOneAndUpdate({ tenantId }, { $set: { ...snapshot, tenantId } }, { upsert: true });

      // Emit to specific tenant room
      io.to(tenantId).emit("logs_status_update", snapshot);
    } catch (e) {
      console.error("Logs loop error for tenant", tenantId, e);
    }
  }
}, 5000);

// -----------------------------------------------------
// START SERVER
// -----------------------------------------------------
async function start() {
  await connectMongo(config.mongo_uri);

  // await VisualizerScanner.deleteMany({}); // Don't wipe on restart, or do? Maybe keep state.
  // await VisualizerData.deleteMany({});

  await seedUsers();
  runDashboardWorker(4000);

  server.listen(config.socket_port || 5000, "0.0.0.0", () =>
    console.log(`🚀 Server running on ${config.socket_port || 5000}`)
  );
}

start();
