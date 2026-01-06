import express from "express";
import cron from "node-cron";
import fs from "fs";
import Admin from "../models/Admin.js";
import User from "../models/User.js";
import Statistics from "../models/Statistics.js";
import Broadcast from "../models/Broadcast.js";
import Settings from "../models/Settings.js";
import moySkladService from "../services/moysklad.service.js";
import telegramBot from "../bot/index.js";
import rateLimiter from "../utils/rateLimiter.js";
import excelGenerator from "../utils/excelGenerator.js";
import { requireAuth, redirectIfAuthenticated } from "../middleware/auth.js";

const router = express.Router();

// Auto-refresh statistics every hour
cron.schedule("0 * * * *", async () => {
  try {
    console.log("🔄 Auto-refresh: Updating statistics from MoySklad...");

    const allCounterparties =
      await moySkladService.getAllCounterpartiesWithBalances();
    const moySkladStats =
      moySkladService.calculateStatistics(allCounterparties);
    const registeredUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ is_active: true });

    await Statistics.updateStats({
      total_counterparties: moySkladStats.totalCounterparties,
      total_debtors: moySkladStats.totalDebtors,
      total_debt: moySkladStats.totalDebt,
      total_profit: moySkladStats.totalProfit,
      registered_users: registeredUsers,
      active_users: activeUsers,
    });

    console.log("✅ Auto-refresh: Statistics updated successfully");
  } catch (error) {
    console.error("❌ Auto-refresh: Error updating statistics:", error);
  }
});

/**
 * GET /admin/login
 * Show login form
 */
router.get("/login", redirectIfAuthenticated, (req, res) => {
  res.render("login", {
    error: null,
    title: "Admin Login",
  });
});

/**
 * POST /admin/login
 * Process login
 */
router.post("/login", redirectIfAuthenticated, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.render("login", {
        error: "Введите логин и пароль",
        title: "Admin Login",
      });
    }

    // Authenticate admin
    const admin = await Admin.authenticate(username, password);

    if (!admin) {
      return res.render("login", {
        error: "Неверный логин или пароль",
        title: "Admin Login",
      });
    }

    // Set session
    req.session.adminId = admin._id.toString();
    req.session.username = admin.username;

    console.log(`✅ Admin logged in: ${admin.username}`);

    res.redirect("/admin/users");
  } catch (error) {
    console.error("Login error:", error);
    res.render("login", {
      error: "Произошла ошибка при входе",
      title: "Admin Login",
    });
  }
});

/**
 * GET /admin/logout
 * Logout admin
 */
router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
    }
    res.redirect("/admin/login");
  });
});

/**
 * GET /admin/users
 * List all users with their current debt status
 */
router.get("/users", requireAuth, async (req, res) => {
  try {
    // Get all users sorted by creation date
    const users = await User.find().sort({ created_at: -1 });

    // Fetch current debt for each user (in parallel for performance)
    const usersWithDebt = await Promise.all(
      users.map(async (user) => {
        try {
          const counterparty = await moySkladService.getCounterpartyByPhone(
            user.phone,
            true // Use cache
          );

          return {
            ...user.toObject(),
            currentDebt:
              counterparty && counterparty.balance < 0
                ? Math.abs(counterparty.balance)
                : 0,
            counterpartyName: counterparty ? counterparty.name : "Не найден",
            counterpartyId: counterparty ? counterparty.id : null,
            moySkladFound: !!counterparty,
            isBlocked: counterparty ? counterparty.isBlocked : false,
            isDebtor: counterparty && counterparty.balance < 0,
            getFullName: () => {
              return user.last_name
                ? `${user.first_name} ${user.last_name}`.trim()
                : user.first_name;
            },
          };
        } catch (error) {
          console.error(
            `Error fetching debt for user ${user.phone}:`,
            error.message
          );
          return {
            ...user.toObject(),
            currentDebt: 0,
            counterpartyName: "Ошибка",
            moySkladFound: false,
            isBlocked: false,
            isDebtor: false,
            getFullName: () => {
              return user.last_name
                ? `${user.first_name} ${user.last_name}`.trim()
                : user.first_name;
            },
          };
        }
      })
    );

    res.render("users", {
      users: usersWithDebt,
      title: "Управление пользователями",
      formatCurrency: moySkladService.formatCurrency.bind(moySkladService),
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).render("error", {
      title: "Ошибка",
      message: "Ошибка при загрузке пользователей",
      error: error.message,
    });
  }
});

/**
 * GET /admin/users/:id/edit
 * Show edit form for a user
 */
router.get("/users/:id/edit", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).send("Пользователь не найден");
    }

    // Get current debt from MoySklad
    let currentDebt = 0;
    let counterpartyName = "Не найден";
    let counterpartyId = null;
    let moySkladFound = false;
    let isBlocked = false;

    try {
      const counterparty = await moySkladService.getCounterpartyByPhone(
        user.phone,
        true // Use cache for edit page
      );
      if (counterparty) {
        moySkladFound = true;
        counterpartyName = counterparty.name;
        counterpartyId = counterparty.id;
        isBlocked = counterparty.isBlocked || false;
        if (counterparty.balance < 0) {
          currentDebt = Math.abs(counterparty.balance);
        }
      }
    } catch (error) {
      console.error("Error fetching MoySklad data:", error.message);
    }

    // Get global send time from Settings
    const globalSendTime = await Settings.get(
      "GLOBAL_SEND_TIME",
      process.env.GLOBAL_SEND_TIME || "09:00"
    );

    res.render("edit-user", {
      user: user.toObject(),
      currentDebt,
      counterpartyName,
      counterpartyId,
      moySkladFound,
      isBlocked,
      globalSendTime,
      error: null,
      success: null,
      title: `Редактировать: ${user.getFullName()}`,
      formatCurrency: moySkladService.formatCurrency.bind(moySkladService),
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).send("Ошибка при загрузке пользователя");
  }
});

/**
 * POST /admin/users/:id
 * Update user details
 */
router.post("/users/:id", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).send("Пользователь не найден");
    }

    const { phone, is_active, send_time } = req.body;

    // Validate and update phone
    if (phone) {
      const normalizedPhone = User.normalizePhone(phone);
      if (!/^\+998\d{9}$/.test(normalizedPhone)) {
        return res.render("edit-user", {
          user: user.toObject(),
          currentDebt: 0,
          counterpartyName: "",
          moySkladFound: false,
          isBlocked: false,
          error: "Неверный формат телефона",
          success: null,
          title: `Редактировать: ${user.getFullName()}`,
          formatCurrency: moySkladService.formatCurrency.bind(moySkladService),
        });
      }
      user.phone = normalizedPhone;
    }

    // Update is_active
    user.is_active = is_active === "true" || is_active === true;

    // Validate and update send_time
    if (send_time && send_time.trim() !== "") {
      if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(send_time)) {
        return res.render("edit-user", {
          user: user.toObject(),
          currentDebt: 0,
          counterpartyName: "",
          moySkladFound: false,
          isBlocked: false,
          error: "Неверный формат времени (используйте HH:mm)",
          success: null,
          title: `Редактировать: ${user.getFullName()}`,
          formatCurrency: moySkladService.formatCurrency.bind(moySkladService),
        });
      }
      user.send_time = send_time;
    } else {
      user.send_time = null;
    }

    await user.save();

    console.log(
      `✅ User updated: ${user.phone} (send_time: ${user.send_time})`
    );

    // Redirect back to edit page with success message
    res.redirect(`/admin/users/${user._id}/edit?success=1`);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).send("Ошибка при обновлении пользователя");
  }
});

/**
 * POST /admin/users/:id/send
 * Manually send debt reminder to a specific user
 */
router.post("/users/:id/send", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Пользователь не найден" });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.json({
        success: false,
        message:
          "Пользователь неактивен. Активируйте пользователя перед отправкой.",
      });
    }

    // Determine which phone to use for MoySklad lookup
    const lookupPhone = user.phone;

    console.log(
      `Manual send for user ${user.phone}, lookup phone: ${lookupPhone}`
    );

    // Get debt from MoySklad (force fresh data for manual send)
    const counterparty = await moySkladService.getCounterpartyByPhone(
      lookupPhone,
      false // Don't use cache for manual sends
    );

    if (!counterparty) {
      return res.json({
        success: false,
        message: "Контрагент не найден в MoySklad",
      });
    }

    if (counterparty.balance >= 0) {
      return res.json({
        success: false,
        message: "У пользователя нет задолженности",
      });
    }

    // Send reminder
    const debtAmount = Math.abs(counterparty.balance);
    const sent = await telegramBot.sendDebtReminder(
      user.telegram_id,
      debtAmount,
      counterparty.name,
      user.language || "uz",
      counterparty.id
    );

    if (sent) {
      // Update last_sent_at
      user.last_sent_at = new Date();
      await user.save();

      return res.json({
        success: true,
        message: `Напоминание отправлено (${moySkladService.formatCurrency(
          debtAmount
        )})`,
      });
    } else {
      return res.json({
        success: false,
        message: "Не удалось отправить сообщение (возможно, бот заблокирован)",
      });
    }
  } catch (error) {
    console.error("Error sending manual reminder:", error);
    res.status(500).json({
      success: false,
      message: "Произошла ошибка при отправке",
    });
  }
});

/**
 * GET /admin/counterparty/:id/reconciliation
 * Get reconciliation report (Акт сверки) for a specific counterparty
 */
router.get(
  "/counterparty/:id/reconciliation",
  requireAuth,
  async (req, res) => {
    try {
      const counterpartyId = req.params.id;
      const { from, to } = req.query;

      if (!counterpartyId) {
        return res.status(400).json({ error: "Counterparty ID is required" });
      }

      console.log(
        `Fetching reconciliation for counterparty: ${counterpartyId}`
      );

      const report = await moySkladService.getCounterpartyReconciliation(
        counterpartyId,
        {
          fromDate: from,
          toDate: to,
          limit: 100,
        }
      );

      if (!report) {
        return res.status(404).json({
          success: false,
          error: "Не удалось получить отчет",
        });
      }

      res.json({
        success: true,
        report,
      });
    } catch (error) {
      console.error("Error fetching counterparty reconciliation:", error);
      res.status(500).json({
        success: false,
        error: "Ошибка при получении отчета",
      });
    }
  }
);

/**
 * GET /admin/counterparty/:id/documents
 * Get documents for a specific counterparty
 */
router.get("/counterparty/:id/documents", requireAuth, async (req, res) => {
  try {
    const counterpartyId = req.params.id;

    if (!counterpartyId) {
      return res.status(400).json({ error: "Counterparty ID is required" });
    }

    console.log(`Fetching documents for counterparty: ${counterpartyId}`);

    const documents = await moySkladService.getCounterpartyDocuments(
      counterpartyId,
      {
        types: [
          "customerorder",
          "demand",
          "paymentin",
          "paymentout",
          "invoiceout",
        ],
        limit: 30,
      }
    );

    res.json({
      success: true,
      counterpartyId,
      documents,
      total: documents.length,
    });
  } catch (error) {
    console.error("Error fetching counterparty documents:", error);
    res.status(500).json({
      success: false,
      error: "Ошибка при получении документов",
    });
  }
});

/**
 * POST /admin/users/:id/delete
 * Delete a user
 */
router.post("/users/:id/delete", requireAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).send("Пользователь не найден");
    }

    console.log(`✅ User deleted: ${user.phone}`);

    res.redirect("/admin/users");
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).send("Ошибка при удалении пользователя");
  }
});

/**
 * GET /admin
 * Redirect to dashboard
 */
router.get("/", requireAuth, (req, res) => {
  res.redirect("/admin/dashboard");
});

/**
 * GET /admin/dashboard
 * Show dashboard page (without heavy data loading)
 */
router.get("/dashboard", requireAuth, async (req, res) => {
  try {
    // Get basic cached statistics only
    let stats = await Statistics.getTodayStats();
    const cacheAge = Date.now() - new Date(stats.last_updated).getTime();

    // Get cache TTL from settings
    const cacheTTLSeconds = await Settings.get("CACHE_TTL", 300);
    const cacheTTLMs = cacheTTLSeconds * 1000; // Convert to milliseconds

    res.render("dashboard", {
      stats,
      counterparties: [], // Empty initially, will be loaded via AJAX
      filter: req.query.filter || "all",
      title: "Dashboard - Все пользователи",
      formatCurrency: moySkladService.formatCurrency.bind(moySkladService),
      cacheAge: Math.floor(cacheAge / 1000 / 60), // minutes
      cacheTTLMs,
      adminUsername: req.session.username,
    });
  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.status(500).render("error", {
      title: "Ошибка",
      message: "Ошибка при загрузке dashboard",
      error: error.message,
    });
  }
});

/**
 * GET /admin/api/dashboard-data
 * API endpoint to load dashboard data with progress tracking
 */
router.get("/api/dashboard-data", requireAuth, async (req, res) => {
  try {
    const filter = req.query.filter || "all";

    // Check if SSE is supported (X-Accel-Buffering header for nginx)
    const useSSE = req.headers["accept"] === "text/event-stream";

    if (useSSE) {
      // Set up SSE headers for progress updates
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    }

    const sendProgress = (percent, message) => {
      if (useSSE) {
        res.write(
          `data: ${JSON.stringify({ progress: percent, message })}\n\n`
        );
      }
    };

    sendProgress(0, "Загрузка статистики...");

    // Get statistics from cache or recalculate
    let stats = await Statistics.getTodayStats();
    const cacheAge = Date.now() - new Date(stats.last_updated).getTime();
    const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

    sendProgress(10, "Проверка кеша...");

    let allCounterparties = [];

    // If cache is old or empty, fetch from MoySklad
    if (cacheAge > CACHE_DURATION || stats.total_counterparties === 0) {
      console.log("📊 Fetching fresh data from MoySklad...");
      sendProgress(20, "Загрузка данных из MoySklad...");

      allCounterparties =
        await moySkladService.getAllCounterpartiesWithBalances();

      sendProgress(60, "Обработка данных...");

      const moySkladStats =
        moySkladService.calculateStatistics(allCounterparties);
      const registeredUsers = await User.countDocuments();
      const activeUsers = await User.countDocuments({ is_active: true });

      sendProgress(80, "Обновление статистики...");

      // Update cache
      stats = await Statistics.updateStats({
        total_counterparties: moySkladStats.totalCounterparties,
        total_debtors: moySkladStats.totalDebtors,
        total_debt: moySkladStats.totalDebt,
        total_profit: moySkladStats.totalProfit,
        registered_users: registeredUsers,
        active_users: activeUsers,
      });
    } else {
      console.log("📊 Using cached statistics");
      sendProgress(50, "Использование кешированных данных...");
      // Get counterparties from cache if needed for display
      if (filter !== "all") {
        allCounterparties =
          await moySkladService.getAllCounterpartiesWithBalances();
      }
    }

    sendProgress(85, "Фильтрация данных...");

    // Filter counterparties based on selection
    let displayCounterparties = [];
    if (filter === "debtors") {
      if (allCounterparties.length === 0) {
        allCounterparties =
          await moySkladService.getAllCounterpartiesWithBalances();
      }
      displayCounterparties = allCounterparties.filter((cp) => cp.balance < 0);
    } else if (filter === "registered") {
      const registeredUsers = await User.find();
      const phones = registeredUsers.map((u) => u.phone);
      if (allCounterparties.length === 0) {
        allCounterparties =
          await moySkladService.getAllCounterpartiesWithBalances();
      }
      displayCounterparties = allCounterparties.filter((cp) =>
        phones.includes(cp.phone)
      );
    } else {
      if (allCounterparties.length === 0) {
        allCounterparties =
          await moySkladService.getAllCounterpartiesWithBalances();
      }
      displayCounterparties = allCounterparties;
    }

    sendProgress(95, "Финализация...");

    // Get registered users map
    const registeredUsers = await User.find();
    const registeredPhonesMap = {};
    registeredUsers.forEach((u) => {
      registeredPhonesMap[u.phone] = {
        telegram_id: u.telegram_id,
        is_active: u.is_active,
        name: u.getFullName(),
      };
    });

    // Add registration info to counterparties
    displayCounterparties = displayCounterparties.map((cp) => ({
      ...cp,
      isRegistered: !!registeredPhonesMap[cp.phone],
      userInfo: registeredPhonesMap[cp.phone] || null,
    }));

    sendProgress(100, "Готово!");

    const responseData = {
      progress: 100,
      done: true,
      data: {
        stats: {
          total_counterparties: stats.total_counterparties,
          total_debtors: stats.total_debtors,
          total_debt: stats.total_debt,
          total_profit: stats.total_profit,
          registered_users: stats.registered_users,
          active_users: stats.active_users,
        },
        counterparties: displayCounterparties,
        cacheAge: Math.floor(cacheAge / 1000 / 60),
      },
    };

    // Send final data
    if (useSSE) {
      res.write(`data: ${JSON.stringify(responseData)}\n\n`);
      res.end();
    } else {
      // Send as regular JSON for better compatibility
      res.json(responseData);
    }
  } catch (error) {
    console.error("Error loading dashboard data:", error);
    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({
          error: true,
          message: error.message,
        })}\n\n`
      );
      res.end();
    } else {
      res.status(500).json({
        error: true,
        message: error.message || "Failed to load dashboard data",
      });
    }
  }
});

/**
 * POST /admin/refresh-stats
 * Force refresh statistics from MoySklad
 */
router.post("/refresh-stats", requireAuth, async (req, res) => {
  try {
    console.log("🔄 Manual statistics refresh requested");

    const allCounterparties =
      await moySkladService.getAllCounterpartiesWithBalances();
    const moySkladStats =
      moySkladService.calculateStatistics(allCounterparties);
    const registeredUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ is_active: true });

    await Statistics.updateStats({
      total_counterparties: moySkladStats.totalCounterparties,
      total_debtors: moySkladStats.totalDebtors,
      total_debt: moySkladStats.totalDebt,
      total_profit: moySkladStats.totalProfit,
      registered_users: registeredUsers,
      active_users: activeUsers,
    });

    res.json({ success: true, message: "Статистика обновлена" });
  } catch (error) {
    console.error("Error refreshing stats:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /admin/clear-cache
 * Clear all cached MoySklad data
 */
router.post("/clear-cache", requireAuth, async (req, res) => {
  try {
    const Cache = (await import("../models/Cache.js")).default;
    await Cache.clearAll();
    console.log("🗑️  Cache cleared manually");
    res.json({ success: true, message: "Кеш успешно очищен" });
  } catch (error) {
    console.error("Error clearing cache:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /admin/send-reminders
 * Manually send debt reminders to all debtors
 */
router.post("/send-reminders", requireAuth, async (req, res) => {
  try {
    const users = await User.find({ is_active: true });
    let sentCount = 0;
    let failedCount = 0;

    console.log(`📤 Manual reminder send started for ${users.length} users`);

    for (const user of users) {
      try {
        const counterparty = await moySkladService.getCounterpartyByPhone(
          user.phone,
          false // Don't use cache for manual reminder sends
        );

        if (counterparty && counterparty.balance < 0) {
          const debtAmount = Math.abs(counterparty.balance);

          await rateLimiter.schedule(async () => {
            await telegramBot.sendDebtReminder(
              user.telegram_id,
              debtAmount,
              counterparty.name,
              user.language || "uz",
              counterparty.id
            );
          });

          sentCount++;
          console.log(`✅ Reminder sent to ${user.phone}`);
        }
      } catch (error) {
        failedCount++;
        console.error(`❌ Failed to send to ${user.phone}:`, error.message);
      }
    }

    // Update statistics
    await Statistics.updateStats({
      messages_sent_today: sentCount,
    });

    res.json({
      success: true,
      message: `Отправлено: ${sentCount}, Ошибок: ${failedCount}`,
      sent: sentCount,
      failed: failedCount,
    });
  } catch (error) {
    console.error("Error sending reminders:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /admin/test-cron
 * Test cron job status and trigger manual execution
 */
router.get("/test-cron", requireAuth, async (req, res) => {
  try {
    const debtReminderSender = (await import("../cron/sender.cron.js")).default;
    const currentTime = new Date().toLocaleString("ru-RU", {
      timeZone: "Asia/Tashkent",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const globalSendTime = await Settings.get(
      "GLOBAL_SEND_TIME",
      process.env.GLOBAL_SEND_TIME || "09:00"
    );

    const status = debtReminderSender.getStatus();

    res.json({
      success: true,
      status: {
        cronRunning: status.isScheduled,
        currentTime: currentTime,
        configuredSendTime: globalSendTime,
        timeMatch: currentTime === globalSendTime,
        isExecuting: status.isRunning,
      },
    });
  } catch (error) {
    console.error("Error checking cron status:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /admin
 * Redirect to dashboard (keep old route for compatibility)
 */
router.get("/", requireAuth, (req, res) => {
  res.redirect("/admin/dashboard");
});

/**
 * GET /admin/broadcast
 * Show broadcast message interface
 */
router.get("/broadcast", requireAuth, async (req, res) => {
  try {
    const broadcasts = await Broadcast.find().sort({ createdAt: -1 }).limit(20);
    const activeUsers = await User.countDocuments({ is_active: true });
    const debtors = await User.find({ is_active: true });

    // Count debtors
    let debtorCount = 0;
    for (const user of debtors) {
      const isDebtor = await moySkladService.isDebtor(user.phone);
      if (isDebtor) debtorCount++;
    }

    res.render("broadcast", {
      broadcasts,
      activeUsers,
      debtorCount,
      title: "Рассылка сообщений",
    });
  } catch (error) {
    console.error("Error loading broadcast page:", error);
    res.status(500).send("Ошибка при загрузке страницы рассылки");
  }
});

/**
 * POST /admin/broadcast
 * Create and send broadcast message
 */
router.post("/broadcast", requireAuth, async (req, res) => {
  try {
    const { title, message_uz, message_ru, target_users, send_now } = req.body;

    if (!title || !message_uz || !message_ru) {
      return res.status(400).json({
        success: false,
        error: "Заполните все поля",
      });
    }

    // Create broadcast record
    const broadcast = await Broadcast.create({
      title,
      message_uz,
      message_ru,
      target_users: target_users || "all",
      status: send_now ? "sending" : "draft",
      created_by: req.session.username,
    });

    if (send_now) {
      // Send immediately in background
      sendBroadcast(broadcast._id).catch((err) => {
        console.error("Background broadcast error:", err);
      });

      res.json({
        success: true,
        message: "Рассылка запущена",
        broadcast_id: broadcast._id,
      });
    } else {
      res.json({
        success: true,
        message: "Черновик сохранен",
        broadcast_id: broadcast._id,
      });
    }
  } catch (error) {
    console.error("Error creating broadcast:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /admin/broadcast/:id/send
 * Send a draft broadcast
 */
router.post("/broadcast/:id/send", requireAuth, async (req, res) => {
  try {
    const broadcast = await Broadcast.findById(req.params.id);

    if (!broadcast) {
      return res
        .status(404)
        .json({ success: false, error: "Рассылка не найдена" });
    }

    if (broadcast.status !== "draft") {
      return res.status(400).json({
        success: false,
        error: "Можно отправить только черновики",
      });
    }

    broadcast.status = "sending";
    await broadcast.save();

    // Send in background
    sendBroadcast(broadcast._id).catch((err) => {
      console.error("Background broadcast error:", err);
    });

    res.json({ success: true, message: "Рассылка запущена" });
  } catch (error) {
    console.error("Error sending broadcast:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Helper function to send broadcast messages
 */
async function sendBroadcast(broadcastId) {
  try {
    const broadcast = await Broadcast.findById(broadcastId);
    if (!broadcast) return;

    let users = [];

    // Get target users
    if (broadcast.target_users === "all") {
      users = await User.find({ is_active: true });
    } else if (broadcast.target_users === "active") {
      users = await User.find({ is_active: true });
    } else if (broadcast.target_users === "debtors") {
      const allUsers = await User.find({ is_active: true });
      for (const user of allUsers) {
        const isDebtor = await moySkladService.isDebtor(user.phone);
        if (isDebtor) users.push(user);
      }
    }

    broadcast.total_count = users.length;
    await broadcast.save();

    console.log(
      `📢 Starting broadcast "${broadcast.title}" to ${users.length} users`
    );

    // Send messages with rate limiting
    for (const user of users) {
      try {
        const message = `${broadcast.message_uz}\n\n${broadcast.message_ru}`;

        await rateLimiter.schedule(async () => {
          await telegramBot.bot.telegram.sendMessage(user.telegram_id, message);
        });

        broadcast.sent_count++;
        await broadcast.save();

        console.log(`✅ Broadcast sent to ${user.phone}`);
      } catch (error) {
        broadcast.failed_count++;
        await broadcast.save();
        console.error(
          `❌ Failed to send broadcast to ${user.phone}:`,
          error.message
        );
      }
    }

    broadcast.status = "completed";
    broadcast.sent_at = new Date();
    await broadcast.save();

    console.log(
      `✅ Broadcast "${broadcast.title}" completed: ${broadcast.sent_count}/${broadcast.total_count}`
    );
  } catch (error) {
    console.error("Error in sendBroadcast:", error);

    const broadcast = await Broadcast.findById(broadcastId);
    if (broadcast) {
      broadcast.status = "failed";
      await broadcast.save();
    }
  }
}

/**
 * GET /admin/settings
 * Show settings page
 */
router.get("/settings", requireAuth, async (req, res) => {
  try {
    const globalSendTime = await Settings.get(
      "GLOBAL_SEND_TIME",
      process.env.GLOBAL_SEND_TIME || "09:00"
    );
    const cacheTTLSeconds = await Settings.get("CACHE_TTL", 300);
    const cacheTTLHours = Math.round(cacheTTLSeconds / 3600);

    res.render("settings", {
      globalSendTime,
      cacheTTLHours,
      success: req.query.success || null,
      error: req.query.error || null,
      title: "Настройки",
    });
  } catch (error) {
    console.error("Error loading settings:", error);
    res.status(500).send("Ошибка при загрузке настроек");
  }
});

/**
 * POST /admin/settings/send-time
 * Update global send time
 */
router.post("/settings/send-time", requireAuth, async (req, res) => {
  try {
    const { send_time } = req.body;

    if (!send_time || !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(send_time)) {
      return res.redirect(
        "/admin/settings?error=" + encodeURIComponent("Неверный формат времени")
      );
    }

    await Settings.set(
      "GLOBAL_SEND_TIME",
      send_time,
      "Глобальное время отправки напоминаний"
    );

    // Update .env for compatibility (optional)
    process.env.GLOBAL_SEND_TIME = send_time;

    console.log(`✅ Global send time updated to: ${send_time}`);
    res.redirect(
      "/admin/settings?success=" +
        encodeURIComponent("Время отправки обновлено")
    );
  } catch (error) {
    console.error("Error updating send time:", error);
    res.redirect(
      "/admin/settings?error=" + encodeURIComponent("Ошибка при обновлении")
    );
  }
});

/**
 * POST /admin/settings/system
 * Update system settings
 */
router.post("/settings/system", requireAuth, async (req, res) => {
  try {
    const { cache_ttl_hours } = req.body;

    if (!cache_ttl_hours || cache_ttl_hours < 1 || cache_ttl_hours > 48) {
      return res.redirect(
        "/admin/settings?error=" +
          encodeURIComponent("Неверное значение TTL (1-48 часов)")
      );
    }

    const cacheSeconds = parseInt(cache_ttl_hours) * 3600;

    await Settings.set(
      "CACHE_TTL",
      cacheSeconds,
      "Время жизни кеша в секундах"
    );

    // Update service
    moySkladService.cacheTTL = cacheSeconds;

    console.log(
      `✅ Cache TTL updated to: ${cache_ttl_hours} hours (${cacheSeconds}s)`
    );
    res.redirect(
      "/admin/settings?success=" + encodeURIComponent("Настройки обновлены")
    );
  } catch (error) {
    console.error("Error updating system settings:", error);
    res.redirect(
      "/admin/settings?error=" + encodeURIComponent("Ошибка при обновлении")
    );
  }
});

/**
 * GET /admin/users/:id/orders
 * View order history for a specific user
 */
router.get("/users/:id/orders", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).send("Пользователь не найден");
    }

    // Get counterparty from MoySklad
    const counterparty = await moySkladService.getCounterpartyByPhone(
      user.phone
    );

    if (!counterparty) {
      return res.render("error", {
        title: "Ошибка",
        message: "Контрагент не найден в MoySklad",
        backUrl: `/admin/users/${user._id}/edit`,
      });
    }

    // Get shipments and orders
    const [shipments, orders] = await Promise.all([
      moySkladService.getCounterpartyShipments(counterparty.id, { limit: 50 }),
      moySkladService.getCounterpartyOrders(counterparty.id, { limit: 50 }),
    ]);

    res.render("user-orders", {
      title: `История заказов - ${user.getFullName()}`,
      user: user,
      counterparty: counterparty,
      shipments: shipments,
      orders: orders,
      formatCurrency: moySkladService.formatCurrency.bind(moySkladService),
    });
  } catch (error) {
    console.error("Error viewing user orders:", error);
    res.status(500).render("error", {
      title: "Ошибка",
      message: "Произошла ошибка при загрузке заказов",
      backUrl: `/admin/users`,
    });
  }
});

/**
 * GET /admin/users/:id/orders/export
 * Export order history as Excel file
 */
router.get("/users/:id/orders/export", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).send("Пользователь не найден");
    }

    // Get counterparty from MoySklad
    const counterparty = await moySkladService.getCounterpartyByPhone(
      user.phone
    );

    if (!counterparty) {
      return res.status(404).send("Контрагент не найден в MoySklad");
    }

    // Get shipments and orders
    const [shipments, orders] = await Promise.all([
      moySkladService.getCounterpartyShipments(counterparty.id, { limit: 50 }),
      moySkladService.getCounterpartyOrders(counterparty.id, { limit: 50 }),
    ]);

    // Generate Excel file
    const excelPath = await excelGenerator.generateCombinedExcel(
      {
        counterparty: {
          id: counterparty.id,
          name: counterparty.name,
          phone: user.phone,
          balance: counterparty.balance,
        },
        shipments: shipments,
        orders: orders,
      },
      "ru" // Admin panel in Russian
    );

    // Send file
    const fileName = `history_${user.phone}_${Date.now()}.xlsx`;
    res.download(excelPath, fileName, (err) => {
      if (err) {
        console.error("Error sending file:", err);
      }
      // Clean up file after sending
      setTimeout(() => {
        try {
          if (fs.existsSync(excelPath)) {
            fs.unlinkSync(excelPath);
            console.log(`🗑️  Deleted temp file: ${excelPath}`);
          }
        } catch (error) {
          console.error("Error deleting temp file:", error.message);
        }
      }, 5000);
    });
  } catch (error) {
    console.error("Error exporting orders:", error);
    res.status(500).send("Ошибка при экспорте");
  }
});

/**
 * GET /admin/counterparty/:id/orders
 * Get orders and shipments for counterparty (API endpoint)
 */
router.get("/counterparty/:id/orders", requireAuth, async (req, res) => {
  try {
    const counterpartyId = req.params.id;

    if (!counterpartyId) {
      return res.status(400).json({ error: "Counterparty ID is required" });
    }

    console.log(`Fetching orders for counterparty: ${counterpartyId}`);

    // Get shipments and orders
    const [shipments, orders] = await Promise.all([
      moySkladService.getCounterpartyShipments(counterpartyId, { limit: 50 }),
      moySkladService.getCounterpartyOrders(counterpartyId, { limit: 50 }),
    ]);

    res.json({
      success: true,
      counterpartyId,
      shipments,
      orders,
      totals: {
        shipmentsCount: shipments.length,
        ordersCount: orders.length,
        shipmentsSum: shipments.reduce((sum, s) => sum + s.sum, 0),
        ordersSum: orders.reduce((sum, o) => sum + o.sum, 0),
      },
    });
  } catch (error) {
    console.error("Error fetching counterparty orders:", error);
    res.status(500).json({
      success: false,
      error: "Ошибка при получении заказов",
    });
  }
});

export default router;
