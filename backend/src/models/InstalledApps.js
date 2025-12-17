import mongoose from "mongoose";

const installedAppSchema = new mongoose.Schema(
  {
    name: String,
    version: String,
    publisher: String,
    install_date: String,
    install_location: String,
    uninstall_string: String,
    display_icon: String,
    registry_key: String,
  },
  { _id: false }
);

const installedAppsSchema = new mongoose.Schema(
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
      default: "installed_apps",
    },

    data: {
      apps: [installedAppSchema],
      count: Number,
    },
  },
  { timestamps: true }
);

export default mongoose.model("InstalledApps", installedAppsSchema);
