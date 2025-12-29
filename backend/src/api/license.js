import express from "express";
import Tenant from "../models/Tenant.js";
import Agent from "../models/Agent.js";

const router = express.Router();

/**
 * @route POST /api/license/bootstrap
 * @desc Allows an agent to fetch its TENANT_KEY (enrollmentKey) using a License Key and Fingerprint.
 */
router.post("/bootstrap", async (req, res) => {
  try {
    const { licenseKey, fingerprint, agentId } = req.body;

    if (!licenseKey || !fingerprint) {
      return res.status(400).json({ success: false, message: "LicenseKey and Fingerprint are required" });
    }

    // 1. Find Tenant by licenseKey
    const tenant = await Tenant.findOne({ licenseKey });
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Invalid License Key" });
    }

    if (!tenant.isActive) {
      return res.status(403).json({ success: false, message: "Tenant account is inactive" });
    }

    // 2. Return the Enrollment Key (TENANT_KEY)
    res.json({
      success: true,
      tenantKey: tenant.enrollmentKey,
      companyName: tenant.name
    });

  } catch (err) {
    console.error("[LicenseBootstrap] Error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

/**
 * @route POST /api/license/verify-hardware
 * @desc (Zero-Touch) Allows an agent to recover its TENANT_KEY if it was previously registered.
 */
router.post("/verify-hardware", async (req, res) => {
    try {
        const { fingerprint } = req.body;
        if (!fingerprint) return res.status(400).json({ success: false, message: "Fingerprint required" });

        // Find any agent with this fingerprint
        const agent = await Agent.findOne({ fingerprint }).populate("tenantId");
        if (!agent || !agent.tenantId) {
            return res.status(404).json({ success: false, message: "Hardware not recognized" });
        }

        res.json({
            success: true,
            tenantKey: agent.tenantId.enrollmentKey,
            companyName: agent.tenantId.name
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

export default router;
