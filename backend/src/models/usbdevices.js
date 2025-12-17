import mongoose from "mongoose";

const UsbDeviceSchema = new mongoose.Schema(
  {
    // ⭐ MULTI-TENANT KEY (SCHEMA ONLY)
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },

    agentId: {
      type: String,
      required: true,
      index: true,
    },

    data: {
      connected_devices: [
        {
          drive_letter: String,
          vendor_id: String,
          product_id: String,
          description: String,

          serial_number: {
            type: String,
            required: true,
          },

          status: {
            type: String,
            enum: ["Allowed", "Blocked", "WaitingForApproval"],
            default: "WaitingForApproval",
          },

          last_seen: {
            type: Date,
            default: Date.now,
          },
        },
      ],
    },
  },
  { timestamps: true }
);

// ⭐ Tenant-safe uniqueness
UsbDeviceSchema.index(
  { tenantId: 1, agentId: 1 },
  { unique: true }
);

// ✅ Prevent duplicate model registration
export default mongoose.models.UsbDevice ||
  mongoose.model("UsbDevice", UsbDeviceSchema);
