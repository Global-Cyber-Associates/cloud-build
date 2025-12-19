import mongoose from "mongoose";

const AgentSchema = new mongoose.Schema(
  {
    agentId: {
      type: String,
      required: true,
      index: true,
      // unique: true, ❌ Removed to allow same agentId across different tenants
    },

    // ⭐ MULTI-TENANT LINK
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
      immutable: true, // ❗ agent cannot change tenant
    },

    socketId: { type: String },
    ip: { type: String },

    status: {
      type: String,
      enum: ["online", "offline"],
      default: "offline",
    },

    lastSeen: { type: Date, default: Date.now },
    mac: { type: String },
  },
  { timestamps: true }
);

// ⭐ Compound index for tenant isolation
AgentSchema.index({ agentId: 1, tenantId: 1 }, { unique: true });

export default mongoose.model("Agent", AgentSchema);
