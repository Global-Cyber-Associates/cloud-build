import mongoose from "mongoose";

const UsbDeviceSchema = new mongoose.Schema({
  agentId: { type: String, required: true, unique: true },
  data: {
    connected_devices: [
      {
        drive_letter: String,
        vendor_id: String,
        product_id: String,
        description: String,
        serial_number: { type: String, required: true },
        status: { type: String, enum: ["Allowed", "Blocked", "WaitingForApproval"], default: "WaitingForApproval" },
        last_seen: { type: Date, default: Date.now },
      },
    ],
  },
}, { timestamps: true });

// ✅ Prevent duplicate model registration
export default mongoose.models.UsbDevice || mongoose.model("UsbDevice", UsbDeviceSchema);
