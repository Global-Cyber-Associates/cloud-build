import bcrypt from "bcrypt";
import User from "./models/User.js";
import Tenant from "./models/Tenant.js";
import crypto from "crypto";

const DEFAULT_TENANT_ID = "694114ce93766c317e31ff5a";

export const seedUsers = async () => {
  try {
    // 1️⃣ Ensure Default Tenant Exists
    let tenant = await Tenant.findById(DEFAULT_TENANT_ID);
    if (!tenant) {
      console.log("⚠️ Default Tenant missing. Creating...");
      const key = "noc_" + crypto.randomBytes(16).toString("hex");
      tenant = await Tenant.create({
        _id: DEFAULT_TENANT_ID,
        name: "Default Tenant",
        enrollmentKey: key,
      });
      console.log("✅ Default Tenant Created.");
    } else if (!tenant.enrollmentKey) {
      console.log("⚠️ Default Tenant has no key. Generating...");
      const key = "noc_" + crypto.randomBytes(16).toString("hex");
      tenant.enrollmentKey = key;
      await tenant.save();
    }

    console.log("\n==================================================");
    console.log("🔑 ENROLLMENT KEY:", tenant.enrollmentKey);
    console.log("==================================================\n");

    const userEmail = process.env.USER_EMAIL;
    const userPassword = process.env.USER_PASSWORD;

    if (!userEmail || !userPassword) {
      console.log("⚠️ Missing default credentials in .env, skipping seeding.");
      return;
    }

    // Check for User
    const existingUser = await User.findOne({ email: userEmail });
    if (!existingUser) {
      const hashedPassword = await bcrypt.hash(userPassword, 10);
      await User.create({
        name: "User",
        email: userEmail,
        password: hashedPassword,
        role: "user",
      });
      console.log(`✅ Default User created: ${userEmail}`);
    } else {
      console.log("ℹ️ User already exists.");
    }
  } catch (error) {
    console.error("❌ Error seeding users:", error);
  }
};
