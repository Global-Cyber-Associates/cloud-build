import jwt from "jsonwebtoken";
import Agent from "../models/Agent.js";
import Tenant from "../models/Tenant.js";

const SECRET = process.env.JWT_SECRET || "GCA_SECRET_2025";

/**
 * Enforces seat licensing and issues a signed hardware-bound license token.
 */
export async function activateLicense(tenantId, agentId, fingerprint) {
  try {
    console.log(`[LicenseManager] Attempting activation for tenant ${tenantId}, agent ${agentId}`);
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      console.error(`[LicenseManager] Tenant ${tenantId} not found`);
      throw new Error("Tenant not found");
    }

    // Check if this agent is already licensed
    let agent = await Agent.findOne({ tenantId, agentId, fingerprint });

    if (!agent || !agent.isLicensed) {
      console.warn(`[LicenseManager] Activation denied: Agent ${agentId} is not yet approved by Admin`);
      throw new Error("Activation pending. Please wait for Admin approval in the License Manager.");
    }

    // If licensed, issue the token
    return issueToken(tenantId, fingerprint, agentId);
  } catch (error) {
    console.error("[LicenseManager] Activation failed:", error.message);
    throw error;
  }
}

function issueToken(tenantId, fingerprint, agentId) {
  const payload = {
    tenantId,
    fingerprint,
    agentId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 30), // 30 days validity
  };

  return jwt.sign(payload, SECRET);
}

export async function verifyLicense(token, fingerprint) {
  try {
    const decoded = jwt.verify(token, SECRET);
    if (decoded.fingerprint !== fingerprint) return false;
    return true;
  } catch (err) {
    return false;
  }
}
