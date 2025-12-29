import dotenv from "dotenv";
dotenv.config();
import { activateLicense } from "./backend/src/utils/licenseManager.js";
import { connectMongo } from "./backend/src/db.js";

async function test() {
  try {
    console.log("Testing backend imports...");
    // Just testing imports for now
    console.log("Imports successful.");
    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
}
test();
