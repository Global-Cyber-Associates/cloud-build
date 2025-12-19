import express from "express";
import Agent from "../models/Agent.js";

import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/agents — list all agents (Tenant Scoped)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const agents = await Agent.find({ tenantId: req.user.tenantId }).sort({ lastSeen: -1 });
    res.status(200).json(agents);
  } catch (err) {
    console.error("Error fetching agents:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
