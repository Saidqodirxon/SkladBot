import cron from "node-cron";
import User from "../models/User.js";
import Statistics from "../models/Statistics.js";
import Settings from "../models/Settings.js";
import moySkladService from "../services/moysklad.service.js";
import telegramBot from "../bot/index.js";
import rateLimiter from "../utils/rateLimiter.js";

/**
 * Debt Reminder Sender
 * Runs every minute and checks if there are users to send reminders to
 */
class DebtReminderSender {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
  }

  /**
   * Get current time in HH:mm format for Asia/Tashkent timezone
   */
  getCurrentTime() {
    const now = new Date();

    // Convert to Asia/Tashkent timezone
    const tashkentTime = new Date(
      now.toLocaleString("en-US", {
        timeZone: "Asia/Tashkent",
      })
    );

    const hours = String(tashkentTime.getHours()).padStart(2, "0");
    const minutes = String(tashkentTime.getMinutes()).padStart(2, "0");

    return `${hours}:${minutes}`;
  }

  /**
   * Process a single user - check debt and send reminder if needed
   */
  async processUser(user) {
    try {
      console.log(`Processing user: ${user.phone} (${user.getFullName()})`);

      // Check if user is active
      if (!user.is_active) {
        console.log(`  ⏭️  User is inactive, skipping`);
        return { success: false, reason: "inactive" };
      }

      // Get counterparty data from MoySklad
      const counterparty = await moySkladService.getCounterpartyByPhone(
        user.phone
      );

      if (!counterparty) {
        console.log(`  ❌ Counterparty not found in MoySklad`);
        return { success: false, reason: "not_found" };
      }

      // Check if user has debt (balance < 0)
      if (counterparty.balance >= 0) {
        console.log(`  ✅ No debt (balance: ${counterparty.balance})`);
        return { success: false, reason: "no_debt" };
      }

      // Calculate debt amount (positive number)
      const debtAmount = Math.abs(counterparty.balance);
      console.log(
        `  💰 Debt found: ${moySkladService.formatCurrency(debtAmount)}`
      );
      console.log(`  🆔 Counterparty ID: ${counterparty.id}`);

      // Send reminder via Telegram using rate limiter
      let sent = false;
      try {
        await rateLimiter.schedule(async () => {
          await telegramBot.sendDebtReminder(
            user.telegram_id,
            debtAmount,
            counterparty.name,
            user.language || "uz",
            counterparty.id
          );
        });
        sent = true;
      } catch (error) {
        console.log(`  ❌ Failed to send reminder:`, error.message);
        sent = false;
      }

      if (sent) {
        // Update last_sent_at timestamp
        user.last_sent_at = new Date();
        await user.save();

        console.log(`  ✅ Reminder sent successfully`);
        return { success: true, debtAmount };
      } else {
        console.log(`  ❌ Failed to send reminder`);
        return { success: false, reason: "send_failed" };
      }
    } catch (error) {
      console.error(`  ❌ Error processing user ${user.phone}:`, error.message);
      return { success: false, reason: "error", error: error.message };
    }
  }

  /**
   * Main cron job execution - runs every minute
   */
  async execute() {
    // Prevent concurrent executions
    if (this.isRunning) {
      console.log("⏳ Previous execution still running, skipping...");
      return;
    }

    this.isRunning = true;

    try {
      const currentTime = this.getCurrentTime();

      // Get global send time from Settings (with fallback to .env)
      const globalSendTime = await Settings.get(
        "GLOBAL_SEND_TIME",
        process.env.GLOBAL_SEND_TIME || "09:00"
      );

      // Debug logging every minute
      console.log(
        `⏰ Cron check - Current: ${currentTime}, Target: ${globalSendTime}`
      );

      // Only execute if current time matches global send time
      if (currentTime !== globalSendTime) {
        this.isRunning = false;
        return;
      }

      console.log(
        `\n🕐 GLOBAL SEND TIME MATCHED: ${currentTime} (Asia/Tashkent)`
      );
      console.log(`📢 Sending debt reminders to ALL active users...`);

      // Find all active users
      const users = await User.findActiveUsers();

      if (users.length === 0) {
        console.log(`✅ No active users found`);
        this.isRunning = false;
        return;
      }

      console.log(`📋 Found ${users.length} active user(s) to process`);

      // Process all users
      let sent = 0;
      let skipped = 0;
      let failed = 0;

      for (const user of users) {
        const result = await this.processUser(user);

        if (result.success) {
          sent++;
        } else if (
          result.reason === "no_debt" ||
          result.reason === "inactive"
        ) {
          skipped++;
        } else {
          failed++;
        }
      }

      // Update statistics
      await Statistics.updateStats({
        messages_sent_today: sent,
      });

      console.log(`\n📊 Summary for ${currentTime}:`);
      console.log(`   ✅ Sent: ${sent}`);
      console.log(`   ⏭️  Skipped: ${skipped}`);
      console.log(`   ❌ Failed: ${failed}`);
      console.log(`   📝 Total processed: ${users.length}`);
    } catch (error) {
      console.error("❌ Cron job error:", error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Helper function to sleep for a specified time
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Start the cron job
   */
  async start() {
    if (this.cronJob) {
      console.log("⚠️  Cron job is already running");
      return;
    }

    // Get and display configured send time
    const globalSendTime = await Settings.get(
      "GLOBAL_SEND_TIME",
      process.env.GLOBAL_SEND_TIME || "09:00"
    );

    // Run every minute
    // Format: second minute hour day month dayOfWeek
    this.cronJob = cron.schedule(
      "* * * * *",
      async () => {
        await this.execute();
      },
      {
        timezone: "Asia/Tashkent",
      }
    );

    console.log("✅ Debt reminder cron job started (runs every minute)");
    console.log(`   Timezone: Asia/Tashkent`);
    console.log(`   Current time: ${this.getCurrentTime()}`);
    console.log(`   Configured send time: ${globalSendTime}`);
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log("🛑 Debt reminder cron job stopped");
    }
  }

  /**
   * Get cron job status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: !!this.cronJob,
      currentTime: this.getCurrentTime(),
    };
  }
}

// Export singleton instance
const debtReminderSender = new DebtReminderSender();
export default debtReminderSender;
