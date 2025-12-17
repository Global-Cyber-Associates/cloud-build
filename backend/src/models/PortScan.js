import mongoose from "mongoose";

const portScanSchema = new mongoose.Schema(
  {
    // ⭐ MULTI-TENANT KEY
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

    timestamp: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      default: "port_scan",
    },

    data: {
      target: String,
      open_ports: [Number],
      scanned_range: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model("PortScan", portScanSchema);
