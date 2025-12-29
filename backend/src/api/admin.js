import express from "express";
import {
  getPendingRequests,
  approveClient,
  getTenantsSummary,
  updateTenantSeats,
  getTenantAgents,
  deactivateAgentLicense,
  approveAgentLicense
} from "../controllers/adminController.js";
import { authMiddleware, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// --------------------------------------------------
// GLOBAL ADMIN ROUTES
// --------------------------------------------------

// Get all pending client registration requests
router.get("/requests", authMiddleware, adminOnly, getPendingRequests);

// Approve a client request (creates tenant)
router.post("/approve/:id", authMiddleware, adminOnly, approveClient);

// Get all tenants with device stats
router.get("/tenants", authMiddleware, adminOnly, getTenantsSummary);

// Update tenant seat limit
router.post("/tenants/:id/seats", authMiddleware, adminOnly, updateTenantSeats);

// Get list of agents for a specific tenant (with license status)
router.get("/tenants/:id/agents", authMiddleware, adminOnly, getTenantAgents);

// Deactivate an agent's license (frees a seat)
router.post("/agents/:id/deactivate", authMiddleware, adminOnly, deactivateAgentLicense);

// Approve an agent's license (manual)
router.post("/agents/:id/approve", authMiddleware, adminOnly, approveAgentLicense);

export default router;
