import mongoose from "mongoose";

const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    domain: {
      type: String, // optional (company.com)
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    enrollmentKey: {
      type: String,
      unique: true,
      index: true,
    },
    maxSeats: {
      type: Number,
      default: 5, // Default 5 seats
    },
    licenseKey: {
      type: String,
      unique: true,
      sparse: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Tenant", tenantSchema);
