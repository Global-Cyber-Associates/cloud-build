import mongoose from "mongoose";

const cpuSchema = new mongoose.Schema(
  {
    physical_cores: Number,
    logical_cores: Number,
    cpu_freq_mhz: Number,
  },
  { _id: false }
);

const memorySchema = new mongoose.Schema(
  {
    total_ram: Number,
    available_ram: Number,
    used_ram: Number,
    ram_percent: Number,
  },
  { _id: false }
);

const diskDetailSchema = new mongoose.Schema(
  {
    mountpoint: String,
    fstype: String,
    total: Number,
    used: Number,
    free: Number,
    percent: Number,
  },
  { _id: false }
);

const wlanSchema = new mongoose.Schema(
  {
    interface_name: String,
    type: String,
    address: String,
    netmask: String,
    broadcast: String,
  },
  { _id: false }
);

const systemInfoSchema = new mongoose.Schema(
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
      default: "system_info",
    },

    data: {
      agent_id: String,
      hostname: String,
      os_type: String,
      os_version: String,
      os_release: String,
      cpu: cpuSchema,
      memory: memorySchema,
      disk: { type: Map, of: diskDetailSchema },
      users: [String],
      machine_id: String,
      wlan_info: [wlanSchema],
      ip: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model("SystemInfo", systemInfoSchema);
