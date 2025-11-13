import mongoose from "mongoose";

const VulnFlagSchema = new mongoose.Schema({
  description: String,
  impact: {
    type: String,
    enum: ["Info", "Low", "Medium", "High", "Critical"],
    default: "Info",
  },
});

const HostSchema = new mongoose.Schema({
  ip: String,
  mac: String,
  open_ports: Object,
  impact_level: {
    type: String,
    enum: ["Info", "Low", "Medium", "High", "Critical"],
    default: "Info",
  },
  vuln_flags: [VulnFlagSchema],
});

const ScanResultSchema = new mongoose.Schema({
  ok: { type: Boolean, default: true },
  network: String,
  scanned_at: String,
  duration_seconds: Number,
  hosts: [HostSchema],
  overall_impact: {
    type: String,
    enum: ["Info", "Low", "Medium", "High", "Critical"],
    default: "Info",
  },
  raw: Object, // full original scanner output
  source: { type: String, default: "local-scanner" },
  updated_at: { type: Date, default: Date.now },
});

export default mongoose.model("ScanResult", ScanResultSchema);
