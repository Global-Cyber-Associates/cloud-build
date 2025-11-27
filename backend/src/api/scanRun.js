// backend/src/api/scanRun.js
import express from "express";
import ScanResult from "../models/ScanResult.js";
import { getIO } from "../socket-nvs.js";
import { saveVulnerabilityScan } from "../save.js";

const router = express.Router();

const SCAN_TIMEOUT = 20000; // 20 seconds


// -----------------------------------------------------
// ⭐ TRIGGER SCAN AND WAIT FOR AGENT RESULT
// -----------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const io = getIO();
    global.ACTIVE_AGENTS = global.ACTIVE_AGENTS || {};

    const agentId = req.body.agentId || "Sugumar";
    const socketId = global.ACTIVE_AGENTS[agentId];

    if (!socketId) {
      return res.status(400).json({
        ok: false,
        error: "Agent not connected",
      });
    }

    console.log(`🛡️ Triggering vulnerability scan for agent: ${agentId} (socket ${socketId})`);

    // ⬅️ Get actual socket object
    const agentSocket = io.sockets.sockets.get(socketId);
    if (!agentSocket) {
      return res.status(400).json({ ok: false, error: "Agent socket missing" });
    }

    // -------------------------------
    // ⭐ Promise waits for agent response
    // -------------------------------
    const waitForScan = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out waiting for vulnerability scan result"));
      }, SCAN_TIMEOUT);

      agentSocket.once("network_vulnscan_raw", async (scanData) => {
        clearTimeout(timeout);
        try {
          await saveVulnerabilityScan(scanData);
          resolve(scanData);
        } catch (err) {
          reject(err);
        }
      });
    });

    // -------------------------------
    // ⭐ Tell agent to start scanning
    // -------------------------------
    io.to(socketId).emit("run_vuln_scan");

    // -------------------------------
    // ⭐ Wait for agent scan result
    // -------------------------------
    const finalScan = await waitForScan;

    return res.json({
      ok: true,
      message: "Scan complete",
      result: finalScan,
    });

  } catch (err) {
    console.error("❌ Scan trigger failed:", err);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});


// -----------------------------------------------------
// ⭐ FETCH LATEST SCAN RESULT
// -----------------------------------------------------
router.get("/latest", async (_req, res) => {
  try {
    const doc = await ScanResult.findOne().sort({ updated_at: -1 });

    if (!doc) {
      return res.status(404).json({
        ok: false,
        message: "No scan results found",
      });
    }

    return res.json(doc);

  } catch (err) {
    console.error("❌ Failed to fetch latest scan:", err);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

export default router;
