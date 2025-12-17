import mongoose from "mongoose";

const scannerDeviceSchema = new mongoose.Schema(
  {
    // ⭐ MULTI-TENANT KEY (SCHEMA ONLY)
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },

    ip: {
      type: String,
      required: true,
      index: true,
      // ⚠️ DO NOT keep unique:true in multi-tenant
      // Same IP can exist in different tenants
    },

    mac: { type: String, default: null },
    vendor: { type: String, default: null },
    ping_only: { type: Boolean, default: true },

    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ⭐ Compound index for tenant isolation (SAFE)
scannerDeviceSchema.index({ tenantId: 1, ip: 1 }, { unique: true });

export default mongoose.model("VisualizerScanner", scannerDeviceSchema);
