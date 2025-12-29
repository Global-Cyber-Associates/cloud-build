import User from "../models/User.js";
import Tenant from "../models/Tenant.js";
import crypto from "crypto";
import Agent from "../models/Agent.js";

// --------------------------------------------------
// ⭐ GET PENDING CLIENT REQUESTS
// --------------------------------------------------
export async function getPendingRequests(req, res) {
  try {
    const users = await User.find({ role: "client", isApproved: false }).select("-password");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch requests" });
  }
}

// --------------------------------------------------
// ⭐ APPROVE CLIENT & CREATE TENANT
// --------------------------------------------------
export async function approveClient(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.isApproved) {
      return res.status(400).json({ message: "User already approved" });
    }

    // 1. Create Tenant
    const key = "noc_" + crypto.randomBytes(16).toString("hex");
    const tenantName = user.companyName || `${user.name}'s Company`;
    
    const tenant = await Tenant.create({
      name: tenantName,
      enrollmentKey: key,
    });

    // 2. Update User
    user.isApproved = true;
    user.tenantId = tenant._id;
    await user.save();

    res.json({
      message: "Client approved and tenant created",
      tenant: {
        id: tenant._id,
        name: tenant.name,
        enrollmentKey: tenant.enrollmentKey,
      },
    });
  } catch (err) {
    res.status(500).json({
      message: "Approval failed",
      error: err.message,
    });
  }
}

// --------------------------------------------------
// ⭐ GET TENANTS LIST WITH STATS
// --------------------------------------------------
export async function getTenantsSummary(req, res) {
  try {
    const tenants = await Tenant.find();
    
    const summary = await Promise.all(
      tenants.map(async (t) => {
        const deviceCount = await Agent.countDocuments({ tenantId: t._id });
        const owner = await User.findOne({ tenantId: t._id, role: "client" });
        return {
          id: t._id,
          name: t.name,
          enrollmentKey: t.enrollmentKey,
          deviceCount,
          ownerEmail: owner ? owner.email : "N/A",
          createdAt: t.createdAt,
          isActive: t.isActive,
          maxSeats: t.maxSeats || 5
        };
      })
    );
    
    res.json(summary);
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch tenants summary",
      error: err.message,
    });
  }
}

// --------------------------------------------------
// ⭐ UPDATE TENANT SEAT LIMIT
// --------------------------------------------------
export async function updateTenantSeats(req, res) {
  try {
    const { id } = req.params;
    const { maxSeats } = req.body;

    const tenant = await Tenant.findByIdAndUpdate(id, { $set: { maxSeats } }, { new: true });
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    res.json({ message: "Seat limit updated", maxSeats: tenant.maxSeats });
  } catch (err) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
}

// --------------------------------------------------
// ⭐ GET TENANT AGENTS (LICENSING FOCUS)
// --------------------------------------------------
export async function getTenantAgents(req, res) {
  try {
    const { id } = req.params;
    const agents = await Agent.find({ tenantId: id }).sort({ lastSeen: -1 });
    res.json(agents);
  } catch (err) {
    res.status(500).json({ message: "Fetch failed", error: err.message });
  }
}

// --------------------------------------------------
// ⭐ DEACTIVATE AGENT LICENSE
// --------------------------------------------------
export async function deactivateAgentLicense(req, res) {
  try {
    const { id } = req.params;
    const agent = await Agent.findByIdAndUpdate(id, { 
      $set: { 
        isLicensed: false, 
        licenseToken: null,
        fingerprint: null // Optional: clear fingerprint to allow re-registration on different HW if needed
      } 
    }, { new: true });

    if (!agent) return res.status(404).json({ message: "Agent not found" });

    res.json({ message: "Agent license deactivated", agentId: agent.agentId });
  } catch (err) {
    res.status(500).json({ message: "Deactivation failed", error: err.message });
  }
}
// --------------------------------------------------
// ⭐ APPROVE AGENT LICENSE (MANUAL)
// --------------------------------------------------
export async function approveAgentLicense(req, res) {
  try {
    const { id } = req.params;
    const agent = await Agent.findById(id);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const tenant = await Tenant.findById(agent.tenantId);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    const activeSeats = await Agent.countDocuments({ tenantId: agent.tenantId, isLicensed: true });
    if (activeSeats >= (tenant.maxSeats || 5)) {
      return res.status(400).json({ message: "Seat limit reached for this tenant" });
    }

    agent.isLicensed = true;
    await agent.save();

    // ⭐ Notify agent if online
    const io = req.app.get("io");
    if (io && global.ACTIVE_AGENTS) {
      const socketId = global.ACTIVE_AGENTS[agent.agentId];
      if (socketId) {
        console.log(`[Admin] Notifying agent ${agent.agentId} of license approval...`);
        io.to(socketId).emit("license_approved", {
          success: true,
          message: "Your license has been approved by Admin. You may now activate."
        });
      }
    }

    res.json({ message: "Agent license approved", agentId: agent.agentId });
  } catch (err) {
    res.status(500).json({ message: "Approval failed", error: err.message });
  }
}
