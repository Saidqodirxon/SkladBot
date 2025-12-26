import mongoose from "mongoose";

/**
 * Settings Schema
 * Stores global application settings
 */
const settingsSchema = new mongoose.Schema(
  {
    // Setting key (unique identifier)
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Setting value (can be any type)
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // Setting description
    description: {
      type: String,
      default: "",
    },

    // Last updated timestamp
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "settings",
    timestamps: true,
  }
);

// Static method to get a setting value
settingsSchema.statics.get = async function (key, defaultValue = null) {
  const setting = await this.findOne({ key });
  return setting ? setting.value : defaultValue;
};

// Static method to set a setting value
settingsSchema.statics.set = async function (key, value, description = "") {
  await this.findOneAndUpdate(
    { key },
    { key, value, description, updatedAt: new Date() },
    { upsert: true, new: true }
  );
  return value;
};

// Static method to get all settings
settingsSchema.statics.getAll = async function () {
  const settings = await this.find();
  const result = {};
  settings.forEach((s) => {
    result[s.key] = s.value;
  });
  return result;
};

const Settings = mongoose.model("Settings", settingsSchema);

export default Settings;
