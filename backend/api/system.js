// routes/system.js
import express from "express";
import SystemInfo from "../models/SystemInfo.js";

const router = express.Router();

// POST /api/system
// POST /api/system
router.post("/system", async (req, res) => {
  try {
    const systemData = req.body.system;
    if (!systemData) {
      return res.status(400).json({ message: "No system data provided" });
    }

    // Check if system already exists
    const existing = await SystemInfo.findOne({ machine_id: systemData.machine_id });
    if (existing) {
      return res.status(200).json({ message: "System already exists", id: existing._id });
    }

    const newSystem = new SystemInfo(systemData);
    await newSystem.save();

    res.status(201).json({ message: "System info saved", id: newSystem._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to save system info", error: err.message });
  }
});


// ✅ GET /api/system — returns all system records
router.get("/system", async (req, res) => {
  try {
    const systems = await SystemInfo.find();
    res.status(200).json(systems);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch system info", error: err.message });
  }
});

export default router;