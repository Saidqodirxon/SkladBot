import "dotenv/config";
import mongoose from "mongoose";
import Admin from "../src/models/Admin.js";

/**
 * Seed Script - Create Initial Admin User
 *
 * This script creates the first admin user for the system.
 * Run with: npm run seed:admin
 */

async function seedAdmin() {
  try {
    console.log("🌱 Starting admin seed script...\n");

    // Connect to MongoDB
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/skladbot";
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB\n");

    // Get credentials from environment or use defaults
    const username = process.env.ADMIN_USERNAME || "admin";
    const password = process.env.ADMIN_PASSWORD || "Admin123!";

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ username });

    if (existingAdmin) {
      console.log(`⚠️  Admin user "${username}" already exists!`);
      console.log("\nOptions:");
      console.log("1. Delete the existing admin and run this script again");
      console.log("2. Use a different username in .env file\n");

      await mongoose.connection.close();
      process.exit(0);
    }

    // Create new admin
    console.log(`Creating admin user: ${username}`);
    const admin = await Admin.createAdmin(username, password);

    console.log("\n✅ Admin user created successfully!\n");
    console.log("================================================");
    console.log("Admin Credentials:");
    console.log("================================================");
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
    console.log("================================================\n");
    console.log("⚠️  IMPORTANT: Change the password after first login!\n");
    console.log("You can now login at: http://localhost:3000/admin/login\n");

    // Close connection
    await mongoose.connection.close();
    console.log("✅ Database connection closed\n");
  } catch (error) {
    console.error("❌ Error seeding admin:", error);
    process.exit(1);
  }
}

// Run the seed function
seedAdmin();
