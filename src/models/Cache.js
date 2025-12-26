import mongoose from "mongoose";

/**
 * Cache Schema
 * Stores cached data from MoySklad to avoid repeated API calls
 */
const cacheSchema = new mongoose.Schema(
  {
    // Cache key (e.g., "counterparty:{phone}", "all_counterparties")
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Cached data
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // When cache expires
    expiresAt: {
      type: Date,
      required: true,
    },

    // When cache was created
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "cache",
  }
);

// Index for automatic cleanup of expired cache
cacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static method to get cached data
cacheSchema.statics.get = async function (key) {
  const cache = await this.findOne({
    key: key,
    expiresAt: { $gt: new Date() },
  });

  if (!cache) {
    return null;
  }

  return cache.data;
};

// Static method to set cached data
cacheSchema.statics.set = async function (key, data, ttlSeconds = 300) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await this.findOneAndUpdate(
    { key: key },
    {
      key: key,
      data: data,
      expiresAt: expiresAt,
      createdAt: new Date(),
    },
    {
      upsert: true,
      new: true,
    }
  );

  return data;
};

// Static method to delete cached data
cacheSchema.statics.delete = async function (key) {
  await this.deleteOne({ key: key });
};

// Static method to clear all cache
cacheSchema.statics.clearAll = async function () {
  await this.deleteMany({});
};

// Static method to clear expired cache
cacheSchema.statics.clearExpired = async function () {
  await this.deleteMany({
    expiresAt: { $lt: new Date() },
  });
};

const Cache = mongoose.model("Cache", cacheSchema);

export default Cache;
