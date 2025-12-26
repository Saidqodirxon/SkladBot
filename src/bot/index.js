import { Telegraf, Markup, session } from "telegraf";
import User from "../models/User.js";
import moySkladService from "../services/moysklad.service.js";

/**
 * Telegram Bot Handler
 * Manages all bot interactions with users
 */
class TelegramBot {
  constructor() {
    this.bot = new Telegraf(process.env.BOT_TOKEN);
    this.bot.use(session()); // Enable session support
    this.setupHandlers();
    this.setupRemainingHandlers();
  }

  /**
   * Show user profile with inline keyboard
   */
  async showUserProfile(ctx, user) {
    try {
      const lang = user.language || "uz";
      const globalSendTime = process.env.GLOBAL_SEND_TIME || "09:00";

      const messages = {
        uz: {
          title: "👤 PROFIL",
          id: "🆔 ID",
          phone: "📱 Telefon",
          name: "👨 Ism",
          status: "📊 Status",
          active: "✅ Faol",
          inactive: "❌ Nofaol",
          sendTime: "⏰ Yuborish vaqti",
          lastSent: "📤 Oxirgi yuborilgan",
          never: "Hech qachon",
          language: "🌐 Til",
          uzbek: "🇺🇿 O'zbekcha",
          russian: "🇷🇺 Русский",
          checkBalance: "💰 Balansni tekshirish",
          changeLanguage: "🌐 Tilni o'zgartirish",
          help: "❓ Yordam",
        },
        ru: {
          title: "👤 ПРОФИЛЬ",
          id: "🆔 ID",
          phone: "📱 Телефон",
          name: "👨 Имя",
          status: "📊 Статус",
          active: "✅ Активен",
          inactive: "❌ Неактивен",
          sendTime: "⏰ Время отправки",
          lastSent: "📤 Последняя отправка",
          never: "Никогда",
          language: "🌐 Язык",
          uzbek: "🇺🇿 Узбекский",
          russian: "🇷🇺 Русский",
          checkBalance: "💰 Проверить баланс",
          changeLanguage: "🌐 Изменить язык",
          help: "❓ Помощь",
        },
      };

      const t = messages[lang];

      let profileMessage = `${t.title}\n\n`;
      profileMessage += `${t.id}: ${user.telegram_id}\n`;
      profileMessage += `${t.phone}: ${user.phone}\n`;
      profileMessage += `${t.name}: ${user.getFullName()}\n`;
      profileMessage += `${t.status}: ${
        user.is_active ? t.active : t.inactive
      }\n`;
      profileMessage += `${t.language}: ${
        lang === "uz" ? t.uzbek : t.russian
      }\n`;
      profileMessage += `${t.sendTime}: ${globalSendTime}\n`;

      if (user.last_sent_at) {
        profileMessage += `${t.lastSent}: ${new Date(
          user.last_sent_at
        ).toLocaleString(lang === "uz" ? "uz-UZ" : "ru-RU")}\n`;
      } else {
        profileMessage += `${t.lastSent}: ${t.never}\n`;
      }

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(t.checkBalance, "check_balance")],
        [Markup.button.callback(t.changeLanguage, "change_language")],
        [Markup.button.callback(t.help, "show_help")],
      ]);

      await ctx.reply(profileMessage, keyboard);
    } catch (error) {
      console.error("Error showing profile:", error);
      const errorMsg = user?.language === "ru" ? "❌ Ошибка" : "❌ Xatolik";
      await ctx.reply(errorMsg);
    }
  }

  /**
   * Set up all bot command and message handlers
   */
  setupHandlers() {
    // Start command - show profile or request registration
    this.bot.start(async (ctx) => {
      try {
        const telegramId = ctx.from.id.toString();
        const firstName = ctx.from.first_name || "do'stim";

        // Check if user already exists
        const user = await User.findOne({ telegram_id: telegramId });

        if (user) {
          // User exists - show enhanced profile with inline buttons
          await this.showUserProfile(ctx, user);
        } else {
          // New user - request language selection first
          await ctx.reply(
            `👋 Salom! / Здравствуйте!\n\n` +
              `🌐 Tilni tanlang / Выберите язык:`,
            Markup.inlineKeyboard([
              [
                Markup.button.callback("🇺🇿 O'zbekcha", "lang_uz"),
                Markup.button.callback("🇷🇺 Русский", "lang_ru"),
              ],
            ])
          );
        }
      } catch (error) {
        console.error("Error in start command:", error);
        await ctx.reply(
          "❌ Xatolik yuz berdi.\nIltimos, qaytadan urinib ko'ring."
        );
      }
    });

    // Language selection callback
    this.bot.action(/^lang_(uz|ru)$/, async (ctx) => {
      try {
        const lang = ctx.match[1];
        const telegramId = ctx.from.id.toString();

        // Store language in session temporarily
        if (!ctx.session) ctx.session = {};
        ctx.session.selectedLanguage = lang;

        await ctx.answerCbQuery();
        await ctx.deleteMessage();

        const messages = {
          uz: {
            welcome:
              `👋 Xush kelibsiz!\n\n` +
              `🤖 Men qarz haqida eslatma yuboruvchi botman.\n\n` +
              `📱 Ro'yxatdan o'tish uchun telefon raqamingizni yuboring.`,
            button: "📱 Telefon raqamini yuborish",
          },
          ru: {
            welcome:
              `👋 Добро пожаловать!\n\n` +
              `🤖 Я бот для напоминания о задолженности.\n\n` +
              `📱 Для регистрации поделитесь своим номером телефона.`,
            button: "📱 Отправить номер телефона",
          },
        };

        await ctx.reply(
          messages[lang].welcome,
          Markup.keyboard([
            Markup.button.contactRequest(messages[lang].button),
          ]).resize()
        );
      } catch (error) {
        console.error("Error in language selection:", error);
      }
    });

    // Profile command
    this.bot.command("profile", async (ctx) => {
      try {
        const telegramId = ctx.from.id.toString();
        const user = await User.findOne({ telegram_id: telegramId });

        if (user) {
          await this.showUserProfile(ctx, user);
        } else {
          await ctx.reply(
            "❌ Siz ro'yxatdan o'tmagansiz. /start buyrug'ini bosing.\n" +
              "❌ Вы не зарегистрированы. Нажмите /start"
          );
        }
      } catch (error) {
        console.error("Error in profile command:", error);
      }
    });

    // Callback query handlers
    this.bot.action("check_balance", async (ctx) => {
      await ctx.answerCbQuery();
      await this.handleBalanceCheck(ctx);
    });

    this.bot.action("change_language", async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const telegramId = ctx.from.id.toString();
        const user = await User.findOne({ telegram_id: telegramId });
        const lang = user?.language || "uz";

        const title = lang === "uz" ? "🌐 Tilni tanlang:" : "🌐 Выберите язык:";
        const backBtn = lang === "uz" ? "« Orqaga" : "« Назад";

        await ctx.editMessageText(
          title,
          Markup.inlineKeyboard([
            [
              Markup.button.callback("🇺🇿 O'zbekcha", "set_lang_uz"),
              Markup.button.callback("🇷🇺 Русский", "set_lang_ru"),
            ],
            [Markup.button.callback(backBtn, "back_to_profile")],
          ])
        );
      } catch (error) {
        console.error("Error in change_language:", error);
      }
    });

    this.bot.action(/^set_lang_(uz|ru)$/, async (ctx) => {
      try {
        const lang = ctx.match[1];
        const telegramId = ctx.from.id.toString();

        await User.updateOne({ telegram_id: telegramId }, { language: lang });

        const successMsg =
          lang === "uz" ? "✅ Til o'zgartirildi!" : "✅ Язык изменен!";

        await ctx.answerCbQuery(successMsg);

        const user = await User.findOne({ telegram_id: telegramId });
        await ctx.deleteMessage();
        await this.showUserProfile(ctx, user);
      } catch (error) {
        console.error("Error changing language:", error);
        const errorMsg = ctx.match[1] === "ru" ? "❌ Ошибка" : "❌ Xatolik";
        await ctx.answerCbQuery(errorMsg);
      }
    });

    this.bot.action("back_to_profile", async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const telegramId = ctx.from.id.toString();
        const user = await User.findOne({ telegram_id: telegramId });

        await ctx.deleteMessage();
        await this.showUserProfile(ctx, user);
      } catch (error) {
        console.error("Error going back to profile:", error);
      }
    });

    // Handle contact (phone number) sharing
    this.bot.on("contact", async (ctx) => {
      try {
        const contact = ctx.message.contact;
        const telegramId = ctx.from.id.toString();

        // Get selected language from session or default to uz
        const selectedLanguage = ctx.session?.selectedLanguage || "uz";

        // Verify that user shared their own contact
        if (contact.user_id !== ctx.from.id) {
          const msg =
            selectedLanguage === "uz"
              ? "❌ Iltimos, o'z telefon raqamingizni yuboring."
              : "❌ Пожалуйста, отправьте свой собственный номер телефона.";
          await ctx.reply(msg);
          return;
        }

        // Normalize phone number
        const phone = User.normalizePhone(contact.phone_number);

        // Validate phone format
        if (!/^\+998\d{9}$/.test(phone)) {
          const msg =
            selectedLanguage === "uz"
              ? "❌ Noto'g'ri raqam formati.\nIltimos, o'zbek raqamini yuboring (+998xxxxxxxxx)."
              : "❌ Неверный формат номера телефона.\nПожалуйста, отправьте узбекский номер (+998xxxxxxxxx).";
          await ctx.reply(msg);
          return;
        }

        // Check if user already exists by telegram_id OR phone
        let user = await User.findOne({
          $or: [{ telegram_id: telegramId }, { phone: phone }],
        });

        if (user) {
          // Update existing user
          user.telegram_id = telegramId; // Update telegram_id if phone matched
          user.phone = phone;
          user.first_name = ctx.from.first_name || "";
          user.last_name = ctx.from.last_name || "";
          if (!user.language) user.language = selectedLanguage;
          await user.save();

          const messages = {
            uz:
              `✅ Ma'lumotlaringiz yangilandi!\n\n` +
              `📱 Telefon: ${phone}\n` +
              `👤 Ism: ${user.getFullName()}\n\n` +
              `Siz qarz haqida eslatmalarni olasiz.\n\n` +
              `Profilni ko'rish: /profile`,
            ru:
              `✅ Ваши данные обновлены!\n\n` +
              `📱 Телефон: ${phone}\n` +
              `👤 Имя: ${user.getFullName()}\n\n` +
              `Вы будете получать напоминания о задолженности.\n\n` +
              `Просмотр профиля: /profile`,
          };

          await ctx.reply(messages[selectedLanguage], Markup.removeKeyboard());
        } else {
          // Create new user
          user = await User.create({
            telegram_id: telegramId,
            phone: phone,
            first_name: ctx.from.first_name || "",
            last_name: ctx.from.last_name || "",
            is_active: true,
            language: selectedLanguage,
          });

          const globalSendTime = process.env.GLOBAL_SEND_TIME || "09:00";

          const messages = {
            uz:
              `✅ Ro'yxatdan o'tdingiz!\n\n` +
              `📱 Telefon: ${phone}\n` +
              `👤 Ism: ${user.getFullName()}\n` +
              `⏰ Yuborish vaqti: ${globalSendTime}\n\n` +
              `Har kuni qarzingiz haqida eslatmalar olasiz (agar mavjud bo'lsa).\n\n` +
              `Buyruqlar:\n` +
              `/profile - Profilni ko'rish\n` +
              `/stat - Balansni tekshirish\n` +
              `/help - Yordam`,
            ru:
              `✅ Регистрация успешна!\n\n` +
              `📱 Телефон: ${phone}\n` +
              `👤 Имя: ${user.getFullName()}\n` +
              `⏰ Время отправки: ${globalSendTime}\n\n` +
              `Вы будете получать ежедневные напоминания о задолженности, если она есть.\n\n` +
              `Команды:\n` +
              `/profile - Просмотр профиля\n` +
              `/stat - Проверить баланс\n` +
              `/help - Помощь`,
          };

          await ctx.reply(messages[selectedLanguage], Markup.removeKeyboard());
        }

        console.log(`✅ User registered/updated: ${phone} (${telegramId})`);
      } catch (error) {
        console.error("Error handling contact:", error);
        const lang = ctx.session?.selectedLanguage || "uz";
        const msg =
          lang === "uz"
            ? "❌ Ro'yxatdan o'tishda xatolik yuz berdi.\nIltimos, keyinroq qayta urinib ko'ring."
            : "❌ Произошла ошибка при регистрации.\nПопробуйте позже.";
        await ctx.reply(msg);
      }
    });

    // Show help callback
    this.bot.action("show_help", async (ctx) => {
      try {
        await ctx.answerCbQuery();
        const telegramId = ctx.from.id.toString();
        const user = await User.findOne({ telegram_id: telegramId });
        const lang = user?.language || "uz";

        const messages = {
          uz:
            "📖 YORDAM\n\n" +
            "🤖 Bu bot qarz haqida eslatma yuboradi.\n\n" +
            "Buyruqlar:\n" +
            "/start - Botni boshlash\n" +
            "/profile - Profilni ko'rish\n" +
            "/stat - Balansni tekshirish\n" +
            "/help - Yordam\n\n" +
            "Savollar bo'lsa, administratorga murojaat qiling.",
          ru:
            "📖 ПОМОЩЬ\n\n" +
            "🤖 Этот бот напоминает о задолженности.\n\n" +
            "Команды:\n" +
            "/start - Начать работу с ботом\n" +
            "/profile - Просмотр профиля\n" +
            "/stat - Проверить баланс\n" +
            "/help - Помощь\n\n" +
            "Если у вас есть вопросы, обратитесь к администратору.",
        };

        await ctx.editMessageText(
          messages[lang],
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                lang === "uz" ? "« Orqaga" : "« Назад",
                "back_to_profile"
              ),
            ],
          ])
        );
      } catch (error) {
        console.error("Error showing help:", error);
      }
    });

    // Help command
    this.bot.help(async (ctx) => {
      const telegramId = ctx.from.id.toString();
      const user = await User.findOne({ telegram_id: telegramId });
      const lang = user?.language || "uz";

      const messages = {
        uz:
          "📖 YORDAM\n\n" +
          "🤖 Bu bot qarz haqida eslatma yuboradi.\n\n" +
          "Buyruqlar:\n" +
          "/start - Botni boshlash\n" +
          "/profile - Profilni ko'rish\n" +
          "/stat - Balansni tekshirish\n" +
          "/help - Yordam\n\n" +
          "Savollar bo'lsa, administratorga murojaat qiling.",
        ru:
          "📖 ПОМОЩЬ\n\n" +
          "🤖 Этот бот напоминает о задолженности.\n\n" +
          "Команды:\n" +
          "/start - Начать работу с ботом\n" +
          "/profile - Просмотр профиля\n" +
          "/stat - Проверить баланс\n" +
          "/help - Помощь\n\n" +
          "Если у вас есть вопросы, обратитесь к администратору.",
      };

      await ctx.reply(messages[lang]);
    });

    // Stat command - same as balance (for testing)
    this.bot.command("stat", async (ctx) => {
      await this.handleBalanceCheck(ctx);
    });

    // Balance command - check current debt
    this.bot.command("balance", async (ctx) => {
      await this.handleBalanceCheck(ctx);
    });
  }

  /**
   * Handle balance/stat check command
   */
  async handleBalanceCheck(ctx) {
    try {
      const telegramId = ctx.from.id.toString();

      // Find user in database
      const user = await User.findOne({ telegram_id: telegramId });

      if (!user) {
        await ctx.reply(
          "❌ Siz tizimda ro'yxatdan o'tmagansiz.\n\nRo'yxatdan o'tish uchun /start buyrug'ini ishlating."
        );
        return;
      }

      const lang = user.language || "uz";

      const loadMsg =
        lang === "uz" ? "🔄 Balans tekshirilmoqda..." : "🔄 Проверяю баланс...";
      await ctx.reply(loadMsg);

      // Get balance from MoySklad
      const counterparty = await moySkladService.getCounterpartyByPhone(
        user.phone
      );

      if (!counterparty) {
        const errorMsg =
          lang === "uz"
            ? `❌ Balans haqida ma'lumot olib bo'lmadi.\n` +
              `Ehtimol, raqamingiz MoySklad tizimida topilmadi.\n\n` +
              `Sizning raqamingiz: ${lookupPhone}`
            : `❌ Не удалось получить информацию о балансе.\n` +
              `Возможно, ваш номер не найден в системе MoySklad.\n\n` +
              `Ваш номер: ${lookupPhone}`;
        await ctx.reply(errorMsg);
        return;
      }

      // Format response based on balance
      const labels = {
        uz: {
          title: "📊 Ma'lumot",
          name: "👤 Ism",
          phone: "📱 Telefon",
          balance: "💰 Balans",
          debt: "❗️ QARZDORLIK",
          amount: "💸 Summa",
          debtWarning: "⚠️ Iltimos, qarzni tezda to'lang!",
          overpay: "✅ ORTIQCHA TO'LOV",
          overpayMsg: "Sizda ijobiy balans bor.",
          noDebt: "✅ QARZ YO'Q",
          noDebtMsg: "Sizda qarzdorlik yo'q.",
        },
        ru: {
          title: "📊 Информация",
          name: "👤 Имя",
          phone: "📱 Телефон",
          balance: "💰 Баланс",
          debt: "❗️ ЗАДОЛЖЕННОСТЬ",
          amount: "💸 Сумма",
          debtWarning:
            "⚠️ Пожалуйста, погасите задолженность в ближайшее время!",
          overpay: "✅ ПЕРЕПЛАТА",
          overpayMsg: "У вас есть положительный баланс.",
          noDebt: "✅ НЕТ ДОЛГА",
          noDebtMsg: "У вас нет задолженности.",
        },
      };

      const t = labels[lang];
      let message = `${t.title}\n\n`;
      message += `${t.name}: ${counterparty.name}\n`;
      message += `${t.phone}: ${counterparty.phone || lookupPhone}\n`;
      message += `${t.balance}: ${moySkladService.formatCurrency(
        counterparty.balance
      )}\n\n`;

      if (counterparty.balance < 0) {
        const debt = Math.abs(counterparty.balance);
        message += `${t.debt}\n`;
        message += `${t.amount}: ${moySkladService.formatCurrency(debt)}\n\n`;
        message += t.debtWarning;
      } else if (counterparty.balance > 0) {
        message += `${t.overpay}\n`;
        message += `${t.amount}: ${moySkladService.formatCurrency(
          counterparty.balance
        )}\n\n`;
        message += t.overpayMsg;
      } else {
        message += `${t.noDebt}\n\n`;
        message += t.noDebtMsg;
      }

      await ctx.reply(message);
    } catch (error) {
      console.error("Error checking balance:", error);
      const telegramId = ctx.from.id.toString();
      const user = await User.findOne({ telegram_id: telegramId });
      const lang = user?.language || "uz";

      const errorMsg =
        lang === "uz"
          ? "❌ Balansni tekshirishda xatolik yuz berdi.\nIltimos, keyinroq qayta urinib ko'ring."
          : "❌ Произошла ошибка при проверке баланса.\nПопробуйте позже.";

      await ctx.reply(errorMsg);
    }
  }

  /**
   * Setup remaining bot handlers
   */
  setupRemainingHandlers() {
    // Handle unknown commands
    this.bot.on("text", async (ctx) => {
      try {
        const user = await User.findOne({ telegram_id: ctx.from.id });
        const lang = user?.language || "uz";

        const messages = {
          uz: "ℹ️ Noma'lum buyruq.\n\nMavjud buyruqlar ro'yxati uchun /help dan foydalaning.",
          ru: "ℹ️ Неизвестная команда.\n\nИспользуйте /help для списка доступных команд.",
        };

        await ctx.reply(messages[lang]);
      } catch (error) {
        console.error("Error in unknown command handler:", error);
        await ctx.reply(
          "ℹ️ Noma'lum buyruq. / Неизвестная команда.\n\nMavjud buyruqlar ro'yxati uchun /help dan foydalaning. / Используйте /help для списка доступных команд."
        );
      }
    });

    // Error handling
    this.bot.catch(async (err, ctx) => {
      console.error("Bot error:", err);
      try {
        const user = await User.findOne({ telegram_id: ctx.from?.id });
        const lang = user?.language || "uz";

        const messages = {
          uz: "❌ Xatolik yuz berdi.\nIltimos, qayta urinib ko'ring.",
          ru: "❌ Произошла ошибка.\nПопробуйте позже.",
        };

        await ctx.reply(messages[lang]).catch(() => {});
      } catch {
        // Fallback if user lookup fails
        await ctx
          .reply(
            "❌ Xatolik yuz berdi. / Произошла ошибка.\nIltimos, qayta urinib ko'ring. / Попробуйте позже."
          )
          .catch(() => {});
      }
    });
  }

  /**
   * Send debt reminder to a specific user
   * @param {string} telegramId - User's Telegram ID
   * @param {number} debtAmount - Debt amount
   * @param {string} counterpartyName - Counterparty name from MoySklad
   * @param {string} language - User's language preference ('uz' or 'ru')
   */
  async sendDebtReminder(
    telegramId,
    debtAmount,
    counterpartyName,
    language = "uz"
  ) {
    try {
      let message;

      if (language === "ru") {
        message =
          `📢 НАПОМИНАНИЕ О ЗАДОЛЖЕННОСТИ\n\n` +
          `👤 Имя: ${counterpartyName}\n` +
          `❗️ Сумма долга: ${moySkladService.formatCurrency(debtAmount)}\n\n` +
          `⚠️ Пожалуйста, погасите задолженность в ближайшее время!\n\n` +
          `📊 Проверить баланс: /stat`;
      } else {
        message =
          `📢 QARZDORLIK ESLATMASI\n\n` +
          `👤 Ism: ${counterpartyName}\n` +
          `❗️ Qarz summasi: ${moySkladService.formatCurrency(
            debtAmount
          )}\n\n` +
          `⚠️ Iltimos, qarzni tezda to'lang!\n\n` +
          `📊 Balansni tekshirish: /stat`;
      }

      await this.bot.telegram.sendMessage(telegramId, message);

      console.log(
        `✅ Debt reminder sent to ${telegramId} (${language}): ${debtAmount}`
      );
      return true;
    } catch (error) {
      console.error(`Error sending reminder to ${telegramId}:`, error.message);

      // Check if user blocked the bot
      if (error.response && error.response.error_code === 403) {
        console.log(`User ${telegramId} blocked the bot`);
      }

      return false;
    }
  }

  /**
   * Start the bot (long polling)
   */
  async launch() {
    try {
      // Launch with a timeout
      const launchPromise = this.bot.launch();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Bot launch timeout")), 10000)
      );

      await Promise.race([launchPromise, timeoutPromise]);
      console.log("✅ Telegram bot started successfully");

      // Enable graceful stop
      process.once("SIGINT", () => this.bot.stop("SIGINT"));
      process.once("SIGTERM", () => this.bot.stop("SIGTERM"));
    } catch (error) {
      console.error("❌ Failed to start Telegram bot:", error.message);
      // Don't throw, allow app to continue
    }
  }

  /**
   * Stop the bot
   */
  async stop() {
    await this.bot.stop();
    console.log("🛑 Telegram bot stopped");
  }

  /**
   * Get bot instance
   */
  getBot() {
    return this.bot;
  }
}

// Export singleton instance
const telegramBot = new TelegramBot();
export default telegramBot;
