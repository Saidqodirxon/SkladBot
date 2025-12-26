import "dotenv/config";
import express from "express";
import session from "express-session";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

// Import application modules
import telegramBot from "./bot/index.js";
import debtReminderSender from "./cron/sender.cron.js";
import adminRoutes from "./routes/admin.routes.js";
import { addAdminToLocals } from "./middleware/auth.js";

// ES module workaround for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main Application
 * Monolithic Node.js application with:
 * - Express REST API
 * - Telegram Bot (Telegraf)
 * - Admin Panel (EJS)
 * - MoySklad Integration
 * - Cron-based Debt Reminders
 */

class Application {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
  }

  /**
   * Connect to MongoDB
   */
  async connectDatabase() {
    try {
      const mongoUri =
        process.env.MONGODB_URI || "mongodb://localhost:27017/skladbot";

      await mongoose.connect(mongoUri);

      console.log("✅ Connected to MongoDB");
      console.log(`   Database: ${mongoose.connection.name}`);

      // Handle connection events
      mongoose.connection.on("error", (err) => {
        console.error("❌ MongoDB error:", err);
      });

      mongoose.connection.on("disconnected", () => {
        console.log("⚠️  MongoDB disconnected");
      });
    } catch (error) {
      console.error("❌ Failed to connect to MongoDB:", error);
      throw error;
    }
  }

  /**
   * Configure Express middleware
   */
  setupMiddleware() {
    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Session configuration
    this.app.use(
      session({
        secret:
          process.env.SESSION_SECRET || "your-secret-key-change-in-production",
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: process.env.NODE_ENV === "production",
          httpOnly: true,
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
        },
      })
    );

    // Add admin info to all views
    this.app.use(addAdminToLocals);

    // View engine setup
    this.app.set("view engine", "ejs");
    this.app.set("views", path.join(__dirname, "views"));

    // Static files (if needed in future)
    this.app.use(express.static(path.join(__dirname, "public")));

    // Request logging (simple)
    this.app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup application routes
   */
  setupRoutes() {
    // Admin routes
    this.app.use("/admin", adminRoutes);

    // Root redirect
    this.app.get("/", (req, res) => {
      res.redirect("/admin");
    });

    // Health check endpoint
    this.app.get("/health", (req, res) => {
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        mongodb:
          mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        bot: telegramBot.getBot() ? "running" : "stopped",
        cron: debtReminderSender.getStatus(),
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>404 - Not Found</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              text-align: center;
            }
            h1 { font-size: 72px; margin: 0; }
            p { font-size: 24px; }
            a {
              color: white;
              text-decoration: underline;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>404</h1>
            <p>Page not found</p>
            <a href="/admin">Go to Admin Panel</a>
          </div>
        </body>
        </html>
      `);
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error("❌ Application error:", err);

      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>500 - Server Error</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              text-align: center;
            }
            h1 { font-size: 72px; margin: 0; }
            p { font-size: 24px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>500</h1>
            <p>Internal Server Error</p>
            <p style="font-size: 16px;">Something went wrong. Please try again later.</p>
          </div>
        </body>
        </html>
      `);
    });
  }

  /**
   * Start the Express server
   */
  async startServer() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log("✅ Express server started");
        console.log(`   URL: http://localhost:${this.port}`);
        console.log(`   Admin: http://localhost:${this.port}/admin`);
        console.log(`   Health: http://localhost:${this.port}/health`);
        resolve();
      });
    });
  }

  /**
   * Start Telegram bot
   */
  async startBot() {
    await telegramBot.launch();
  }

  /**
   * Start cron job for automatic reminders
   */
  async startCron() {
    await debtReminderSender.start();
  }

  /**
   * Initialize and start the entire application
   */
  async start() {
    try {
      console.log("\n================================================");
      console.log("🚀 Starting SkladBot Application");
      console.log("================================================\n");

      // Step 1: Connect to database
      console.log("📦 Step 1: Connecting to MongoDB...");
      await this.connectDatabase();

      // Step 2: Setup Express
      console.log("\n📦 Step 2: Setting up Express middleware...");
      this.setupMiddleware();

      console.log("📦 Step 3: Setting up routes...");
      this.setupRoutes();

      // Step 3: Start Express server
      console.log("\n📦 Step 4: Starting Express server...");
      await this.startServer();

      // Step 4: Start Telegram bot
      console.log("\n📦 Step 5: Starting Telegram bot...");
      try {
        await this.startBot();
      } catch (error) {
        console.error("❌ Bot failed to start, but continuing:", error.message);
      }

      // Step 5: Start cron job
      console.log("\n📦 Step 6: Starting cron scheduler...");
      await this.startCron();

      console.log("\n================================================");
      console.log("✅ Application started successfully!");
      console.log("================================================\n");
      console.log("💡 Tips:");
      console.log(
        "   - Open http://localhost:" +
          this.port +
          "/admin to access admin panel"
      );
      console.log("   - Default credentials: check .env file");
      console.log("   - Use /health endpoint to check system status");
      console.log("\n");
    } catch (error) {
      console.error("\n❌ Failed to start application:", error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  async stop() {
    console.log("\n🛑 Shutting down application...");

    try {
      // Stop cron job
      debtReminderSender.stop();

      // Stop Telegram bot
      await telegramBot.stop();

      // Close Express server
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        console.log("✅ Express server closed");
      }

      // Disconnect from MongoDB
      await mongoose.connection.close();
      console.log("✅ MongoDB connection closed");

      console.log("👋 Application stopped gracefully\n");
      process.exit(0);
    } catch (error) {
      console.error("❌ Error during shutdown:", error);
      process.exit(1);
    }
  }
}

// Create application instance
const app = new Application();

// Handle graceful shutdown
process.on("SIGINT", () => app.stop());
process.on("SIGTERM", () => app.stop());

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  app.stop();
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  app.stop();
});

// Start the application
app.start();
