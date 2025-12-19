import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import TaskInfo from "../models/TaskInfo.js";
import SystemInfo from "../models/SystemInfo.js";

const router = express.Router();

// GET /api/task-manager/:agentId
router.get("/:agentId", authMiddleware, async (req, res) => {
    try {
        const { agentId } = req.params;
        const { tenantId } = req.user;

        // Fetch Task Info
        const taskDoc = await TaskInfo.findOne({
            agentId,
            tenantId,
        }).sort({ timestamp: -1 });

        if (!taskDoc) {
            return res.status(404).json({ success: false, message: "No task data found" });
        }

        // Fetch System Info for styling (OS, Hostname)
        const systemDoc = await SystemInfo.findOne({
            agentId,
            tenantId,
        }).sort({ timestamp: -1 });

        const responseData = {
            agentId: taskDoc.agentId,
            device: systemDoc ? {
                hostname: systemDoc.data.hostname,
                os_type: systemDoc.data.os_type,
                os_version: systemDoc.data.os_version,
            } : null,
            data: taskDoc.data,
            timestamp: taskDoc.timestamp,
        }

        res.json({ success: true, data: [responseData] }); // Array to match expected structure if needed, or object
    } catch (err) {
        console.error("❌ TaskManager API error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

export default router;
