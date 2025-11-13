import express from "express";
import { getLogsSnapshot } from "../controllers/logsController.js";
const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const snapshot = await getLogsSnapshot();
    res.json(snapshot);
  } catch (err) {
    console.error("❌ logsStatus API error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
