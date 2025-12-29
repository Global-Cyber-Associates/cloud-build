import User from "./models/User.js";
import Tenant from "./models/Tenant.js";
import bcrypt from "bcrypt";
import crypto from "crypto";

export const seedUsers = async () => {
  try {
    console.log("🌱 Seeding Users and Tenants (Checking for existing entries)...");

    // 1. Ensure System Admin Tenant exists
    let adminTenant = await Tenant.findOne({ name: "System Administration" });
    if (!adminTenant) {
      console.log("Creating System Administration Tenant...");
      const key = "noc_" + crypto.randomBytes(16).toString("hex");
      adminTenant = await Tenant.create({
        name: "System Administration",
        enrollmentKey: key,
        licenseKey: "GCA-ADMIN-2025"
      });
    }

    // 2. Seed ADMIN if not exists
    const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
    const adminPass = process.env.ADMIN_PASSWORD || "pass123";
    
    const adminExists = await User.findOne({ email: adminEmail });
    if (!adminExists) {
      const hashedAdminPass = await bcrypt.hash(adminPass, 10);
      await User.create({
        name: "System Administrator",
        email: adminEmail,
        password: hashedAdminPass,
        role: "admin",
        isApproved: true,
        tenantId: adminTenant._id
      });
      console.log(`✅ Admin Created: ${adminEmail}`);
    } else {
      console.log(`ℹ️ Admin already exists: ${adminEmail}`);
    }

    // 3. Ensure Default Client Tenant exists
    let clientTenant = await Tenant.findOne({ name: "Default Client Company" });
    if (!clientTenant) {
      console.log("Creating Default Client Company Tenant...");
      const key = "noc_" + crypto.randomBytes(16).toString("hex");
      clientTenant = await Tenant.create({
        name: "Default Client Company",
        enrollmentKey: key,
        licenseKey: "GCA-CLIENT-2025"
      });
    }

    // 4. Seed CLIENT if not exists
    const clientEmail = process.env.USER_EMAIL || "client@example.com";
    const clientPass = process.env.USER_PASSWORD || "pass123";

    const clientExists = await User.findOne({ email: clientEmail });
    if (!clientExists) {
      const hashedClientPass = await bcrypt.hash(clientPass, 10);
      await User.create({
        name: "Default Client",
        email: clientEmail,
        password: hashedClientPass,
        role: "client",
        isApproved: true,
        companyName: "Default Client Company",
        tenantId: clientTenant._id
      });
      console.log(`✅ Client Created: ${clientEmail}`);
    } else {
      console.log(`ℹ️ Client already exists: ${clientEmail}`);
    }
    
    console.log("✅ Seeding process complete. Database preserved.");

  } catch (error) {
    console.error("❌ Error seeding database:", error);
  }
};
