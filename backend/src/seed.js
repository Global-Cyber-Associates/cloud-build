import bcrypt from "bcrypt";
import User from "./models/User.js";

export const seedUsers = async () => {
  try {
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
