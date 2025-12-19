import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import InstalledApps from "../models/InstalledApps.js";

const router = express.Router();

// GET /api/installed-apps/:agentId
router.get("/:agentId", authMiddleware, async (req, res) => {
    try {
        const { agentId } = req.params;
        const { tenantId } = req.user;

        const doc = await InstalledApps.findOne({
            agentId,
            tenantId,
        }).sort({ timestamp: -1 });

        if (!doc) {
            return res.status(404).json({ success: false, message: "No data found" });
        }

        res.json({ success: true, data: doc });
    } catch (err) {
        console.error("❌ InstalledApps API error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

export default router;
