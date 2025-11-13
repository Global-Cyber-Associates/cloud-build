// backend/api/scanRun.js
import express from "express";
import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import ScanResult from "../models/ScanResult.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Adjust this path if your scanner script name/location differs
const scannerScript = path.join(__dirname, "../scanner/network_scanner_cli.py");

// Helper: compute overall impact for the whole network
function computeOverallImpact(hosts = []) {
  const order = ["Info", "Low", "Medium", "High", "Critical"];
  let current = "Info";
  for (const h of hosts) {
    const lvl = h?.impact_level || h?.impact || "Info";
    if (order.indexOf(lvl) > order.indexOf(current)) {
      current = lvl;
    }
  }
  return current;
}

// POST /api/scan
router.post("/", async (req, res) => {
  console.log("[api/scan] Triggered network scan");

  // You can accept flags from req.body in future (e.g., no_arp)
  // const noArp = req.body?.no_arp === true;

  // Spawn python scanner
  const child = execFile(
    "python",
    [scannerScript],
    { timeout: 3 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 }, // 3 min, 20MB stdout
    async (error, stdout, stderr) => {
      if (error) {
        console.error("[api/scan] Scanner process error:", error);
        // include stderr for debugging when available
        return res.status(500).json({ ok: false, error: error.message, stderr: (stderr || "").toString() });
      }

      try {
        const outText = (stdout || "").toString().trim();
        if (!outText) {
          console.error("[api/scan] Scanner produced no stdout. Stderr:", (stderr || "").toString());
          return res.status(500).json({ ok: false, error: "Scanner produced no output", stderr: (stderr || "").toString() });
        }

        let parsed;
        try {
          parsed = JSON.parse(outText);
        } catch (parseErr) {
          console.error("[api/scan] Failed to parse scanner JSON:", parseErr);
          console.error("Raw stdout:", outText);
          console.error("Stderr:", (stderr || "").toString());
          return res.status(500).json({ ok: false, error: "Invalid JSON from scanner", detail: parseErr.message, raw: outText });
        }

        // Normalize parsed shape: expect top-level { ok, scanned_at, network, duration_seconds, hosts }
        if (!parsed || typeof parsed !== "object") {
          return res.status(500).json({ ok: false, error: "Scanner returned unexpected payload" });
        }

        const hosts = Array.isArray(parsed.hosts) ? parsed.hosts : [];
        const overallImpact = computeOverallImpact(hosts);

        // Replace single doc in DB (upsert)
        const updatedDoc = await ScanResult.findOneAndUpdate(
          {},
          {
            $set: {
              ok: parsed.ok !== undefined ? parsed.ok : true,
              network: parsed.network || "unknown",
              scanned_at: parsed.scanned_at || new Date().toISOString(),
              duration_seconds: parsed.duration_seconds || 0,
              hosts,
              overall_impact: overallImpact,
              raw: parsed,
              source: "local-scanner",
              updated_at: new Date(),
            },
          },
          { upsert: true, new: true }
        );

        console.log(`[api/scan] Scan saved. hosts=${hosts.length} overall=${overallImpact}`);
        return res.json({ ok: true, saved: true, id: updatedDoc._id, result: parsed, overall_impact: overallImpact });
      } catch (err) {
        console.error("[api/scan] Error while saving/parsing scanner output:", err);
        return res.status(500).json({ ok: false, error: "Internal server error", detail: err.message });
      }
    }
  );

  // Log scanner stderr as it streams (helpful for debugging)
  child.stderr?.on("data", (chunk) => {
    console.error("[scanner stderr]", chunk.toString());
  });
});

// GET /api/scan/latest
router.get("/latest", async (_req, res) => {
  try {
    const last = await ScanResult.findOne({}, {}, { sort: { updated_at: -1 } });
    if (!last) return res.status(404).json({ ok: false, message: "No previous scan found" });
    return res.json(last);
  } catch (err) {
    console.error("[api/scan] Failed to fetch latest scan:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
