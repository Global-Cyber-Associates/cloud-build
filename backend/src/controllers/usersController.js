import User from "../models/User.js";
import bcrypt from "bcrypt";

// --------------------------------------------------
// 🔒 HELPER: Count active admins (TENANT-AWARE)
// --------------------------------------------------
async function getActiveAdminCount(tenantId) {
  return await User.countDocuments({
    role: "admin",
    isActive: true,
    tenantId,
  });
}

// --------------------------------------------------
// ⭐ CREATE USER (Admin, Tenant-scoped)
// --------------------------------------------------
export async function createUser(req, res) {
  try {
    const { name, email, password, role } = req.body;
    const tenantId = req.user.tenantId;

    const exists = await User.findOne({ email, tenantId });
    if (exists) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name,
      email,
      password: hashed,
      role,
      tenantId,          // ⭐ IMPORTANT
      isActive: true,
    });

    res.json({
      message: "User created",
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        isActive: newUser.isActive,
      },
    });
  } catch (err) {
    res.status(500).json({
      message: "Error creating user",
      error: err.message,
    });
  }
}

// --------------------------------------------------
// ⭐ GET ALL USERS (Admin, Tenant-scoped)
// --------------------------------------------------
export async function getUsers(req, res) {
  try {
    const tenantId = req.user.tenantId;

    const users = await User.find({ tenantId }).select("-password");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch users" });
  }
}

// --------------------------------------------------
// ⭐ DELETE USER (Admin, Tenant-scoped)
// --------------------------------------------------
export async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    const { id: loggedInUserId, tenantId } = req.user;

    const user = await User.findOne({ _id: id, tenantId });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // ❌ Prevent deleting yourself
    if (user._id.toString() === loggedInUserId) {
      return res.status(400).json({
        message: "You cannot delete your own account",
      });
    }

    // ❌ Prevent deleting last active admin in tenant
    if (user.role === "admin" && user.isActive) {
      const adminCount = await getActiveAdminCount(tenantId);
      if (adminCount <= 1) {
        return res.status(400).json({
          message: "Cannot delete the last active admin",
        });
      }
    }

    await user.deleteOne();
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({
      message: "Failed to delete user",
      error: err.message,
    });
  }
}

// --------------------------------------------------
// ⭐ UPDATE USER (Admin, Tenant-scoped)
// --------------------------------------------------
export async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { role, isActive } = req.body;
    const { id: loggedInUserId, tenantId } = req.user;

    const user = await User.findOne({ _id: id, tenantId });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // ❌ Prevent self-demotion
    if (user._id.toString() === loggedInUserId && role === "user") {
      return res.status(400).json({
        message: "You cannot demote yourself",
      });
    }

    // ❌ Prevent demoting last active admin
    if (user.role === "admin" && role === "user" && user.isActive) {
      const adminCount = await getActiveAdminCount(tenantId);
      if (adminCount <= 1) {
        return res.status(400).json({
          message: "Cannot demote the last active admin",
        });
      }
    }

    // ❌ Prevent disabling last active admin
    if (
      user.role === "admin" &&
      isActive === false &&
      user.isActive === true
    ) {
      const adminCount = await getActiveAdminCount(tenantId);
      if (adminCount <= 1) {
        return res.status(400).json({
          message: "Cannot disable the last active admin",
        });
      }
    }

    if (role !== undefined) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();
    res.json({ message: "User updated" });
  } catch (err) {
    res.status(500).json({
      message: "Failed to update user",
      error: err.message,
    });
  }
}

// --------------------------------------------------
// ⭐ RESET USER PASSWORD (Admin, Tenant-scoped)
// --------------------------------------------------
export async function resetPassword(req, res) {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    const tenantId = req.user.tenantId;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    const user = await User.findOne({ _id: id, tenantId });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    res.status(500).json({
      message: "Failed to reset password",
      error: err.message,
    });
  }
}
