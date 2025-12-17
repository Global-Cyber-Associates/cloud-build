import express from "express";
import {
  createUser,
  getUsers,
  deleteUser,
  updateUser,
  resetPassword, // ⭐ NEW
} from "../controllers/usersController.js";

import { authMiddleware, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// --------------------------------------------------
// ADMIN ONLY ROUTES
// --------------------------------------------------

// Create new user
router.post("/create", authMiddleware, adminOnly, createUser);

// Get all users
router.get("/", authMiddleware, adminOnly, getUsers);

// Delete user
router.delete("/:id", authMiddleware, adminOnly, deleteUser);

// Update user (role / status)
router.put("/:id", authMiddleware, adminOnly, updateUser);

// ⭐ RESET USER PASSWORD (Admin)
router.put(
  "/:id/reset-password",
  authMiddleware,
  adminOnly,
  resetPassword
);

export default router;
