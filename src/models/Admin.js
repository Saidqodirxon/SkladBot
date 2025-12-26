import mongoose from "mongoose";
import bcrypt from "bcrypt";

/**
 * Admin Schema
 * Represents an administrator who can access the admin panel
 */
const adminSchema = new mongoose.Schema(
  {
    // Admin username (unique)
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      index: true,
    },

    // Hashed password
    password_hash: {
      type: String,
      required: true,
    },

    // When admin was created
    created_at: {
      type: Date,
      default: Date.now,
    },

    // Last login time
    last_login: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "admins",
  }
);

// Instance method to compare password
adminSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password_hash);
  } catch (error) {
    throw new Error("Error comparing passwords");
  }
};

// Static method to create admin with hashed password
adminSchema.statics.createAdmin = async function (username, password) {
  const saltRounds = 10;
  const password_hash = await bcrypt.hash(password, saltRounds);

  return this.create({
    username,
    password_hash,
  });
};

// Static method to authenticate admin
adminSchema.statics.authenticate = async function (username, password) {
  const admin = await this.findOne({ username: username.toLowerCase() });

  if (!admin) {
    return null;
  }

  const isMatch = await admin.comparePassword(password);

  if (!isMatch) {
    return null;
  }

  // Update last login
  admin.last_login = new Date();
  await admin.save();

  return admin;
};

const Admin = mongoose.model("Admin", adminSchema);

export default Admin;
