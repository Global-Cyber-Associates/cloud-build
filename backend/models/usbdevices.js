import mongoose from "mongoose";

const UsbDeviceSchema = new mongoose.Schema({
  agentId: { type: String, required: true, unique: true },
  data: {
    connected_devices: [
      {
        drive_letter: { type: String, default: "" },
        vendor_id: { type: String, default: "" },
        product_id: { type: String, default: "" },
        description: { type: String, default: "" },
        serial_number: { type: String, required: true },
        status: { type: String, enum: ["Allowed", "Blocked", "WaitingForApproval"], default: "WaitingForApproval" },
        last_seen: { type: Date, default: Date.now },
      },
    ],
  },
}, { timestamps: true });

export default mongoose.model("USBDevices", UsbDeviceSchema);
