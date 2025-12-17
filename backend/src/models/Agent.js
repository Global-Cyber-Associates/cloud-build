import mongoose from "mongoose";

const AgentSchema = new mongoose.Schema(
  {
    agentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // ⭐ MULTI-TENANT KEY
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },

    socketId: { type: String },
    ip: { type: String },
    mac: { type: String },

    lastSeen: {
      type: Date,
      default: Date.now,
    },

    status: {
      type: String,
      enum: ["online", "offline"],
      default: "offline",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Agent", AgentSchema);
