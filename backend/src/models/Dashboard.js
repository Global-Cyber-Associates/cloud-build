import mongoose from "mongoose";

const DashboardSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "dashboard_latest" },

    timestamp: Date,

    summary: {
      all: Number,
      active: Number,
      inactive: Number,
      unknown: Number,
      routers: Number,
    },

    allDevices: Array,
    activeAgents: Array,
    inactiveAgents: Array,
    routers: Array,
    unknownDevices: Array,
  },
  { collection: "dashboard" }
);

// ⭐ ESM default export
const Dashboard = mongoose.model("Dashboard", DashboardSchema);
export default Dashboard;
