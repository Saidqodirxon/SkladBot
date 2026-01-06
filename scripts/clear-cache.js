import mongoose from "mongoose";
import dotenv from "dotenv";
import Cache from "./src/models/Cache.js";

dotenv.config();

async function clearCache() {
  try {
    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    console.log("🗑️  Clearing all cache...");
    await Cache.clearAll();
    console.log("✅ Cache cleared successfully");

    await mongoose.connection.close();
    console.log("👋 MongoDB connection closed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

clearCache();
