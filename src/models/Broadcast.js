import mongoose from "mongoose";

/**
 * Broadcast Message Schema
 * For storing promotional/broadcast messages sent to users
 */
const broadcastSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message_uz: {
      type: String,
      required: true,
    },
    message_ru: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["draft", "sending", "completed", "failed"],
      default: "draft",
    },
    target_users: {
      type: String,
      enum: ["all", "active", "debtors", "specific"],
      default: "all",
    },
    specific_phones: [String], // For targeted messages
    sent_count: {
      type: Number,
      default: 0,
    },
    failed_count: {
      type: Number,
      default: 0,
    },
    total_count: {
      type: Number,
      default: 0,
    },
    created_by: {
      type: String,
      required: true,
    },
    sent_at: Date,
  },
  {
    timestamps: true,
  }
);

// Indexes
broadcastSchema.index({ status: 1 });
broadcastSchema.index({ created_at: -1 });

const Broadcast = mongoose.model("Broadcast", broadcastSchema);

export default Broadcast;
