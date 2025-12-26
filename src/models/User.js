import mongoose from "mongoose";

/**
 * User Schema
 * Represents a Telegram user registered in the system
 */
const userSchema = new mongoose.Schema(
  {
    // Telegram user ID (unique identifier)
    telegram_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Phone number in international format (+998xxxxxxxxx)
    phone: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: function (v) {
          return /^\+998\d{9}$/.test(v);
        },
        message: (props) =>
          `${props.value} is not a valid Uzbekistan phone number!`,
      },
    },

    // User's first name from Telegram
    first_name: {
      type: String,
      required: true,
      trim: true,
    },

    // User's last name from Telegram (optional)
    last_name: {
      type: String,
      default: "",
      trim: true,
    },

    // Whether user can receive messages
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Last time a message was sent to this user
    last_sent_at: {
      type: Date,
      default: null,
    },

    // User's preferred language
    language: {
      type: String,
      enum: ["uz", "ru"],
      default: "uz",
    },

    // Time when user should receive reminders (HH:mm format)
    send_time: {
      type: String,
      default: null,
      validate: {
        validator: function (v) {
          if (!v) return true; // Allow null
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: (props) =>
          `${props.value} is not a valid time format (use HH:mm)!`,
      },
    },

    // When user registered
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
    collection: "users",
  }
);

// Instance method to get full name
userSchema.methods.getFullName = function () {
  return this.last_name
    ? `${this.first_name} ${this.last_name}`.trim()
    : this.first_name;
};

// Static method to find all active users (for global send time)
userSchema.statics.findActiveUsers = function () {
  return this.find({
    is_active: true,
  });
};

// Static method to normalize phone number
userSchema.statics.normalizePhone = function (phone) {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, "");

  // Handle different phone formats
  if (cleaned.startsWith("998")) {
    cleaned = "+" + cleaned;
  } else if (cleaned.length === 9) {
    cleaned = "+998" + cleaned;
  } else if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }

  return cleaned;
};

const User = mongoose.model("User", userSchema);

export default User;
