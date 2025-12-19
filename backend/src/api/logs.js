import express from "express";
import { getLogsSnapshot } from "../controllers/logsController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authMiddleware, async (req, res) => {
  try {
    const snapshot = await getLogsSnapshot(req.user.tenantId);
    res.json(snapshot);
  } catch (err) {
    console.error("❌ logsStatus API error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
