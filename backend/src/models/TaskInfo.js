import mongoose from "mongoose";

const appSchema = new mongoose.Schema(
  {
    pid: Number,
    name: String,
    title: String,
    cpu_percent: Number,
    memory_percent: Number,
  },
  { _id: false }
);

const processSchema = new mongoose.Schema(
  {
    pid: Number,
    name: String,
    cpu_percent: Number,
    memory_percent: Number,
  },
  { _id: false }
);

const taskInfoSchema = new mongoose.Schema(
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
      default: "task_info",
    },

    data: {
      applications: [appSchema],
      background_processes: [processSchema],
    },
  },
  { timestamps: true }
);

export default mongoose.model("TaskInfo", taskInfoSchema);
