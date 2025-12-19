
import { connectMongo } from "./db.js";
import mongoose from "mongoose";
import Tenant from "./models/Tenant.js";
import User from "./models/User.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();



import fs from "fs";
import path from "path";

import { fileURLToPath } from 'url';

// Config
const TENANT_NAME = "Tenant B (Test)";
const USER_EMAIL = "user_b@test.com";
const USER_PASS = "password123";

async function createTenantB() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const configPath = path.join(__dirname, "config.json");
    console.log(`📂 Loading config from: ${configPath}`);
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

    await connectMongo(config.mongo_uri);

    console.log("🚀 Creating separate Tenant B environment...");

    // 1. Create Tenant
    const key = "noc_" + crypto.randomBytes(16).toString("hex");
    const tenant = await Tenant.create({
        name: TENANT_NAME,
        enrollmentKey: key
    });

    console.log(`✅ Created Tenant: ${tenant.name}`);
    console.log(`🔑 ENROLLMENT KEY (Put this in Laptop 2's .env): ${key}`);

    // 2. Create User linked to Tenant
    const hashedPassword = await bcrypt.hash(USER_PASS, 10);
    const user = await User.create({
        name: "User B",
        email: USER_EMAIL,
        password: hashedPassword,
        tenantId: tenant._id,
        role: "user"
    });

    console.log(`✅ Created User: ${user.email}`);
    console.log(`🔐 Password: ${USER_PASS}`);

    console.log("\n⚠️  INSTRUCTIONS:");
    console.log("1. Use the KEY above on Laptop 2 (agent .env)");
    console.log("2. Login to Dashboard with the EMAIL/PASS above");
    console.log("3. Verify Laptop 2 appears ONLY for User B");

    process.exit(0);
}

createTenantB();
