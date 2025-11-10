// routes/usb.js
import express from "express";
import UsbDevice from "../models/UsbDevices.js";

const router = express.Router();

/* =======================================================
   Fetch all USBDevices documents
======================================================= */
router.get("/", async (_, res) => {
  try {
    const devices = await UsbDevice.find(); // fetch all documents
    res.json(devices); // return as JSON
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =======================================================
   Update a user's USB status
   POST /api/usb/status
   Body: { serial, username, status }
======================================================= */
router.post("/status", async (req, res) => {
  const { serial, username, status } = req.body;

  if (!serial || !username || !status) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    // Find the agent
    const agent = await UsbDevice.findOne({ agentId: username });
    if (!agent) return res.status(404).json({ message: "User not found" });

    // Find the device in this agent
    const device = agent.data.connected_devices.find((d) => d.serial_number === serial);
    if (!device) return res.status(404).json({ message: "Device not found" });

    // Update status
    device.status = status;
    await agent.save();

    res.json({ message: "Status updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
