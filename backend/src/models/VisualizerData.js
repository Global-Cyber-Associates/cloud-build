import mongoose from "mongoose";

const visualizerDataSchema = new mongoose.Schema(
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
      ref: "Agent",
    },

    ip: {
      type: String,
      required: true,
    },

    mac: {
      type: String,
      required: true,
    },

    vendor: String,

    hostname: {
      type: String,
      default: "Unknown",
    },

    noAgent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// ⭐ Tenant-safe index
visualizerDataSchema.index({ tenantId: 1, ip: 1 });

export default mongoose.models.VisualizerData ||
  mongoose.model("VisualizerData", visualizerDataSchema);