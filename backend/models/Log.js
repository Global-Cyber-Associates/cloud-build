// models/Log.js
import mongoose from "mongoose";

const LogsStatusSchema = new mongoose.Schema(
  {
    agents: [
      {
        agentId: String,
        hostname: String,
        ip: String,
        os_type: String,
        os_version: String,
        ram_percent: Number,
        cpu_cores: Number,
        status: String,
        lastSeen: Date,
      },
    ],
    server: {
      status: String,
      message: String,
    },
    unknownDevices: [
      {
        ip: String,
        mac: String,
        vendor: String,
        hostname: String,
      },
    ],
    usbDevices: [
      {
        agentId: String,
        devices: [
          {
            serial_number: String,
            description: String,
            drive_letter: String,
            status: String,
            last_seen: Date,
          },
        ],
      },
    ],
    timestamp: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// ✅ Prevent model overwrite
export default mongoose.models.LogsStatus || mongoose.model("LogsStatus", LogsStatusSchema);
