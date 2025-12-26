import mongoose from "mongoose";

/**
 * Statistics Cache Schema
 * Stores cached statistics from MoySklad to avoid frequent API calls
 */
const statisticsSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      unique: true,
    },
    total_counterparties: {
      type: Number,
      default: 0,
    },
    total_debtors: {
      type: Number,
      default: 0,
    },
    total_debt: {
      type: Number,
      default: 0,
    },
    total_profit: {
      type: Number,
      default: 0,
    },
    registered_users: {
      type: Number,
      default: 0,
    },
    active_users: {
      type: Number,
      default: 0,
    },
    messages_sent_today: {
      type: Number,
      default: 0,
    },
    last_updated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
statisticsSchema.index({ date: -1 });

/**
 * Get or create today's statistics
 */
statisticsSchema.statics.getTodayStats = async function () {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let stats = await this.findOne({ date: today });

  if (!stats) {
    stats = await this.create({ date: today });
  }

  return stats;
};

/**
 * Update statistics
 */
statisticsSchema.statics.updateStats = async function (data) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return await this.findOneAndUpdate(
    { date: today },
    { ...data, last_updated: new Date() },
    { upsert: true, new: true }
  );
};

const Statistics = mongoose.model("Statistics", statisticsSchema);

export default Statistics;
