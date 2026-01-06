import fetch from "node-fetch";
import Cache from "../models/Cache.js";

/**
 * MoySklad Service
 * Handles all interactions with MoySklad API with caching
 */
class MoySkladService {
  constructor() {
    this.apiToken = process.env.MOYSKLAD_API_TOKEN;
    this.apiUrl = process.env.MOYSKLAD_API_URL;
    this.cacheTTL = 300; // 5 minutes default cache

    if (!this.apiToken) {
      console.error(
        "⚠️  MOYSKLAD_API_TOKEN is not set in environment variables"
      );
    }

    if (!this.apiUrl) {
      console.error("⚠️  MOYSKLAD_API_URL is not set in environment variables");
    }
  }

  /**
   * Get headers for MoySklad API requests
   */
  getHeaders() {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      "Accept-Encoding": "gzip",
      "Content-Type": "application/json",
    };
  }

  /**
   * Find counterparty by phone number
   * @param {string} phone - Phone number in format +998xxxxxxxxx
   * @returns {Promise<Object|null>} Counterparty data or null if not found
   */
  async findCounterpartyByPhone(phone) {
    try {
      if (!phone) {
        throw new Error("Phone number is required");
      }

      // Clean phone number for search (remove + and spaces)
      const cleanPhone = phone.replace(/[\s+]/g, "");

      // Search for counterparty by phone
      const searchUrl = `${this.apiUrl}/entity/counterparty?filter=phone~${cleanPhone}`;

      const response = await fetch(searchUrl, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        console.error(
          `MoySklad API error: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const data = await response.json();

      if (!data.rows || data.rows.length === 0) {
        console.log(`No counterparty found for phone: ${phone}`);
        return null;
      }

      // Return first match
      const counterparty = data.rows[0];

      return {
        id: counterparty.id,
        name: counterparty.name,
        phone: counterparty.phone || phone,
        balance: 0, // Will be fetched separately
        status: "unknown",
      };
    } catch (error) {
      console.error("Error finding counterparty by phone:", error.message);
      return null;
    }
  }

  /**
   * Get counterparty details including balance
   * @param {string} counterpartyId - MoySklad counterparty ID
   * @returns {Promise<Object|null>} Full counterparty data with balance
   */
  async getCounterpartyDetails(counterpartyId) {
    try {
      if (!counterpartyId) {
        throw new Error("Counterparty ID is required");
      }

      // Get counterparty basic info
      const url = `${this.apiUrl}/entity/counterparty/${counterpartyId}`;
      console.log(`Fetching counterparty: ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `MoySklad API error: ${response.status} ${response.statusText}`,
          errorText
        );
        return null;
      }

      const counterparty = await response.json();
      console.log(`Counterparty found: ${counterparty.name}`);

      // Check if counterparty is blocked
      const isBlocked = counterparty.archived === true;

      // Get balance from report/counterparty
      const reportUrl = `${this.apiUrl}/report/counterparty`;
      console.log(`Fetching balance report: ${reportUrl}`);

      const reportResponse = await fetch(reportUrl, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!reportResponse.ok) {
        console.error(
          `Balance report API error: ${reportResponse.status} ${reportResponse.statusText}`
        );
        // Try to get balance from counterparty object directly
        const balance = counterparty.accounts?.[0]?.balance || 0;
        const balanceKopeks = balance / 100;

        console.log(`Using counterparty.accounts balance: ${balanceKopeks}`);

        return {
          id: counterparty.id,
          name: counterparty.name,
          phone: counterparty.phone || "",
          balance: balanceKopeks,
          status:
            balanceKopeks < 0
              ? "debtor"
              : balanceKopeks > 0
              ? "creditor"
              : "ok",
          isBlocked: isBlocked,
        };
      }

      const reportData = await reportResponse.json();

      // Find this counterparty in the report
      const counterpartyReport = reportData.rows?.find((row) =>
        row.counterparty?.meta?.href?.includes(counterpartyId)
      );

      let balance = 0;
      if (counterpartyReport) {
        // Balance is in kopeks (минорные единицы)
        balance = (counterpartyReport.balance || 0) / 100;
        console.log(`Balance from report: ${balance}`);
      } else {
        // Fallback to accounts
        balance = (counterparty.accounts?.[0]?.balance || 0) / 100;
        console.log(`Balance from accounts: ${balance}`);
      }

      // Determine status based on balance
      let status = "ok";
      if (balance < 0) {
        status = "debtor"; // Negative balance means debt
      } else if (balance > 0) {
        status = "creditor"; // Positive balance means overpayment
      }

      console.log(
        `Final balance for ${counterparty.name}: ${balance} (status: ${status}, blocked: ${isBlocked})`
      );

      return {
        id: counterparty.id,
        name: counterparty.name,
        phone: counterparty.phone || "",
        balance: balance,
        status: status,
        isBlocked: isBlocked,
      };
    } catch (error) {
      console.error("Error getting counterparty details:", error.message);
      return null;
    }
  }

  /**
   * Get counterparty by phone with full details including balance (with caching)
   * @param {string} phone - Phone number
   * @param {boolean} useCache - Whether to use cache (default: true)
   * @returns {Promise<Object|null>} Complete counterparty data
   */
  async getCounterpartyByPhone(phone, useCache = true) {
    try {
      const cacheKey = `counterparty:${phone}`;

      // Check cache first
      if (useCache) {
        const cached = await Cache.get(cacheKey);
        if (cached) {
          console.log(`✅ Cache hit for ${phone}`);
          return cached;
        }
      }

      // First, find counterparty by phone
      const basicInfo = await this.findCounterpartyByPhone(phone);

      if (!basicInfo || !basicInfo.id) {
        return null;
      }

      // Then get full details including balance
      const fullDetails = await this.getCounterpartyDetails(basicInfo.id);

      // Cache the result
      if (fullDetails && useCache) {
        await Cache.set(cacheKey, fullDetails, this.cacheTTL);
        console.log(`💾 Cached data for ${phone}`);
      }

      return fullDetails;
    } catch (error) {
      console.error("Error getting counterparty by phone:", error.message);
      return null;
    }
  }

  /**
   * Check if counterparty is a debtor (balance < 0)
   * @param {string} phone - Phone number
   * @returns {Promise<boolean>} True if debtor, false otherwise
   */
  async isDebtor(phone) {
    try {
      const counterparty = await this.getCounterpartyByPhone(phone);

      if (!counterparty) {
        return false;
      }

      return counterparty.balance < 0;
    } catch (error) {
      console.error("Error checking debtor status:", error.message);
      return false;
    }
  }

  /**
   * Get debt amount for a phone number
   * @param {string} phone - Phone number
   * @returns {Promise<number>} Debt amount (positive number) or 0
   */
  async getDebtAmount(phone) {
    try {
      const counterparty = await this.getCounterpartyByPhone(phone);

      if (!counterparty || counterparty.balance >= 0) {
        return 0;
      }

      // Return absolute value of negative balance
      return Math.abs(counterparty.balance);
    } catch (error) {
      console.error("Error getting debt amount:", error.message);
      return 0;
    }
  }

  /**
   * Get all counterparties from MoySklad with pagination
   * @param {number} limit - Number of items per page (max 1000)
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Object>} Counterparties data with rows and meta
   */
  async getAllCounterparties(limit = 1000, offset = 0) {
    try {
      const url = `${this.apiUrl}/entity/counterparty?limit=${limit}&offset=${offset}`;

      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        console.error(
          `MoySklad API error: ${response.status} ${response.statusText}`
        );
        return { rows: [], meta: {} };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching all counterparties:", error.message);
      return { rows: [], meta: {} };
    }
  }

  /**
   * Get all counterparties with their balances
   * Fetches all pages and includes balance information
   * @returns {Promise<Array>} Array of counterparties with balances
   */
  async getAllCounterpartiesWithBalances() {
    try {
      const allCounterparties = [];
      let offset = 0;
      const limit = 1000; // MoySklad max limit
      let hasMore = true;

      console.log("📊 Fetching all counterparties from MoySklad...");

      while (hasMore) {
        const data = await this.getAllCounterparties(limit, offset);

        if (!data.rows || data.rows.length === 0) {
          hasMore = false;
          break;
        }

        // Fetch balance for each counterparty
        for (const counterparty of data.rows) {
          try {
            const details = await this.getCounterpartyDetails(counterparty.id);
            if (details) {
              allCounterparties.push(details);
            }
          } catch (error) {
            console.error(
              `Error fetching details for ${counterparty.id}:`,
              error.message
            );
            // Add counterparty without balance if details fetch fails
            allCounterparties.push({
              id: counterparty.id,
              name: counterparty.name,
              phone: counterparty.phone || "",
              balance: 0,
              status: "unknown",
            });
          }
        }

        offset += limit;

        // Check if there are more pages
        if (data.meta && data.meta.size < limit) {
          hasMore = false;
        }

        console.log(
          `Fetched ${allCounterparties.length} counterparties so far...`
        );
      }

      console.log(
        `✅ Total counterparties fetched: ${allCounterparties.length}`
      );
      return allCounterparties;
    } catch (error) {
      console.error(
        "Error in getAllCounterpartiesWithBalances:",
        error.message
      );
      return [];
    }
  }

  /**
   * Calculate statistics from counterparties
   * @param {Array} counterparties - Array of counterparties with balances
   * @returns {Object} Statistics object
   */
  calculateStatistics(counterparties) {
    const stats = {
      totalCounterparties: counterparties.length,
      totalDebtors: 0,
      totalDebt: 0, // Sum of all negative balances
      totalProfit: 0, // Sum of all positive balances
      debtors: [], // List of debtors
    };

    for (const cp of counterparties) {
      if (cp.balance < 0) {
        stats.totalDebtors++;
        stats.totalDebt += Math.abs(cp.balance);
        stats.debtors.push(cp);
      } else if (cp.balance > 0) {
        stats.totalProfit += cp.balance;
      }
    }

    return stats;
  }

  /**
   * Get counterparty documents (orders, invoices, payments)
   * @param {string} counterpartyId - MoySklad counterparty ID
   * @param {Object} options - Options
   * @param {Array<string>} options.types - Document types to fetch (default: all)
   * @param {number} options.limit - Max documents per type (default: 20)
   * @returns {Promise<Array>} Array of documents with type, date, amount, status
   */
  async getCounterpartyDocuments(counterpartyId, options = {}) {
    try {
      if (!counterpartyId) {
        throw new Error("Counterparty ID is required");
      }

      const {
        types = [
          "customerorder",
          "demand",
          "paymentin",
          "paymentout",
          "invoiceout",
          "invoicein",
        ],
        limit = 20,
      } = options;

      const cacheKey = `counterparty:${counterpartyId}:documents`;

      // Check cache
      const cached = await Cache.get(cacheKey);
      if (cached) {
        console.log(`✅ Cache hit for documents ${counterpartyId}`);
        return cached;
      }

      const allDocuments = [];

      // Fetch each document type
      for (const docType of types) {
        try {
          const url = `${this.apiUrl}/entity/${docType}?filter=agent=${this.apiUrl}/entity/counterparty/${counterpartyId}&limit=${limit}&order=moment,desc`;

          console.log(`Fetching ${docType} for counterparty ${counterpartyId}`);

          const response = await fetch(url, {
            method: "GET",
            headers: this.getHeaders(),
          });

          if (!response.ok) {
            console.error(`Error fetching ${docType}: ${response.status}`);
            continue;
          }

          const data = await response.json();

          // Process documents
          if (data.rows && data.rows.length > 0) {
            for (const doc of data.rows) {
              allDocuments.push({
                id: doc.id,
                type: docType,
                typeName: this.getDocumentTypeName(docType),
                name: doc.name || doc.description || "N/A",
                date: doc.moment || doc.created,
                sum: (doc.sum || 0) / 100, // Convert from kopeks
                state: doc.state?.name || "N/A",
                description: doc.description || "",
                moySkladUrl: `https://online.moysklad.ru/app/#/${docType}/edit?id=${doc.id}`,
              });
            }
          }
        } catch (error) {
          console.error(`Error fetching ${docType}:`, error.message);
        }
      }

      // Sort by date descending
      allDocuments.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Cache for 2 minutes
      await Cache.set(cacheKey, allDocuments, 120);

      return allDocuments;
    } catch (error) {
      console.error("Error getting counterparty documents:", error.message);
      return [];
    }
  }

  /**
   * Get counterparty reconciliation report (Акт сверки)
   * @param {string} counterpartyId - MoySklad counterparty ID
   * @param {Object} options - Options
   * @param {string} options.fromDate - Start date (YYYY-MM-DD)
   * @param {string} options.toDate - End date (YYYY-MM-DD)
   * @param {number} options.limit - Max documents per type (default: 100)
   * @returns {Promise<Object>} Reconciliation report with opening balance, transactions, closing balance
   */
  async getCounterpartyReconciliation(counterpartyId, options = {}) {
    try {
      if (!counterpartyId) {
        throw new Error("Counterparty ID is required");
      }

      const {
        fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
        toDate = new Date().toISOString().split("T")[0],
        limit = 100,
      } = options;

      const cacheKey = `counterparty:${counterpartyId}:reconciliation:${fromDate}:${toDate}`;

      // Check cache
      const cached = await Cache.get(cacheKey);
      if (cached) {
        console.log(`✅ Cache hit for reconciliation ${counterpartyId}`);
        return cached;
      }

      // Get counterparty details
      const counterparty = await this.getCounterpartyDetails(counterpartyId);
      if (!counterparty) {
        throw new Error("Counterparty not found");
      }

      const allTransactions = [];
      const types = [
        "customerorder",
        "demand",
        "paymentin",
        "paymentout",
        "invoiceout",
        "invoicein",
        "supply",
      ];

      // Fetch all documents in date range
      for (const docType of types) {
        try {
          const url = `${this.apiUrl}/entity/${docType}?filter=agent=${this.apiUrl}/entity/counterparty/${counterpartyId};moment>=${fromDate}T00:00:00;moment<=${toDate}T23:59:59&limit=${limit}&order=moment,asc`;

          console.log(`Fetching ${docType} for reconciliation`);

          const response = await fetch(url, {
            method: "GET",
            headers: this.getHeaders(),
          });

          if (!response.ok) {
            console.error(`Error fetching ${docType}: ${response.status}`);
            continue;
          }

          const data = await response.json();

          if (data.rows && data.rows.length > 0) {
            for (const doc of data.rows) {
              const sum = (doc.sum || 0) / 100;

              let debit = 0;
              let credit = 0;

              // DEBIT increases when we sell to them or they owe us
              // CREDIT increases when they pay us or we owe them

              if (
                docType === "demand" ||
                docType === "customerorder" ||
                docType === "invoiceout"
              ) {
                // Sales, orders, outgoing invoices - they owe us money
                debit = sum;
              } else if (docType === "paymentin") {
                // They paid us - reduces their debt
                credit = sum;
              } else if (docType === "paymentout") {
                // We paid them or returned money - reduces their debt
                credit = sum;
              } else if (docType === "invoicein" || docType === "supply") {
                // Incoming invoices, supplies - we owe them money
                credit = sum;
              }

              allTransactions.push({
                id: doc.id,
                type: docType,
                typeName: this.getDocumentTypeName(docType),
                name: doc.name || doc.description || "N/A",
                date: doc.moment || doc.created,
                debit: debit,
                credit: credit,
                description: doc.description || "",
              });
            }
          }
        } catch (error) {
          console.error(`Error fetching ${docType}:`, error.message);
        }
      }

      allTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));

      const periodDebitTotal = allTransactions.reduce(
        (sum, t) => sum + t.debit,
        0
      );
      const periodCreditTotal = allTransactions.reduce(
        (sum, t) => sum + t.credit,
        0
      );
      const currentBalance = counterparty.balance;
      const openingBalance =
        currentBalance - (periodDebitTotal - periodCreditTotal);
      const closingBalance =
        openingBalance + periodDebitTotal - periodCreditTotal;

      const report = {
        counterparty: {
          id: counterpartyId,
          name: counterparty.name,
          phone: counterparty.phone || "",
        },
        period: {
          from: fromDate,
          to: toDate,
        },
        openingBalance: openingBalance,
        transactions: allTransactions,
        totals: {
          debit: periodDebitTotal,
          credit: periodCreditTotal,
        },
        closingBalance: closingBalance,
      };

      await Cache.set(cacheKey, report, 300);

      return report;
    } catch (error) {
      console.error(
        "Error getting counterparty reconciliation:",
        error.message
      );
      return null;
    }
  }

  /**
   * Get human-readable document type name
   * @param {string} docType - Document type code
   * @returns {string} Human-readable name
   */
  getDocumentTypeName(docType) {
    const typeMap = {
      customerorder: "📦 Buyurtma / Заказ",
      demand: "📤 Sotuv / Отгрузка",
      paymentin: "💰 To'lov (kiruvchi) / Входящий платеж",
      paymentout: "💸 To'lov (chiquvchi) / Исходящий платеж",
      invoiceout: "📄 Faktura (chiquvchi) / Счет покупателю",
      invoicein: "📥 Faktura (kiruvchi) / Счет поставщика",
      supply: "📦 Keltirilgan tovar / Приемка",
    };
    return typeMap[docType] || docType;
  }

  /**
   * Format currency for Uzbekistan (UZS)
   * @param {number} amount - Amount in UZS
   * @returns {string} Formatted amount
   */
  formatCurrency(amount) {
    return new Intl.NumberFormat("uz-UZ", {
      style: "currency",
      currency: "UZS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  /**
   * Get shipments (demands) for a counterparty with product details
   * @param {string} counterpartyId - MoySklad counterparty ID
   * @param {Object} options - Options
   * @param {number} options.limit - Max shipments (default: 50)
   * @returns {Promise<Array>} Array of shipments with product details
   */
  async getCounterpartyShipments(counterpartyId, options = {}) {
    try {
      if (!counterpartyId) {
        throw new Error("Counterparty ID is required");
      }

      const { limit = 50 } = options;

      const cacheKey = `counterparty:${counterpartyId}:shipments`;

      // Check cache
      const cached = await Cache.get(cacheKey);
      if (cached) {
        console.log(`✅ Cache hit for shipments ${counterpartyId}`);
        return cached;
      }

      const url = `${this.apiUrl}/entity/demand?filter=agent=${this.apiUrl}/entity/counterparty/${counterpartyId}&limit=${limit}&order=moment,desc&expand=positions`;

      console.log(`Fetching shipments for counterparty ${counterpartyId}`);

      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        console.error(`Error fetching shipments: ${response.status}`);
        return [];
      }

      const data = await response.json();
      const shipments = [];

      if (data.rows && data.rows.length > 0) {
        for (const demand of data.rows) {
          const products = [];

          // Get product details from positions
          if (demand.positions && demand.positions.rows) {
            for (const position of demand.positions.rows) {
              // Get product image URL if available
              let imageUrl = null;
              if (position.assortment?.image) {
                imageUrl = position.assortment.image.meta?.href || null;
              }

              products.push({
                name: position.assortment?.name || "N/A",
                code: position.assortment?.code || "",
                article: position.assortment?.article || "",
                quantity: position.quantity || 0,
                price: (position.price || 0) / 100,
                sum: ((position.price || 0) * (position.quantity || 0)) / 100,
                imageUrl: imageUrl,
                productId:
                  position.assortment?.meta?.href?.split("/").pop() || null,
              });
            }
          }

          shipments.push({
            id: demand.id,
            name: demand.name,
            number: demand.name?.match(/\d+/)?.[0] || "",
            date: demand.moment || demand.created,
            sum: (demand.sum || 0) / 100,
            description: demand.description || "",
            state: demand.state?.name || "N/A",
            products: products,
            productsCount: products.length,
            moySkladUrl: `https://online.moysklad.ru/app/#/demand/edit?id=${demand.id}`,
          });
        }
      }

      // Cache for 5 minutes
      await Cache.set(cacheKey, shipments, 300);

      console.log(`✅ Found ${shipments.length} shipments`);
      return shipments;
    } catch (error) {
      console.error("Error getting counterparty shipments:", error.message);
      return [];
    }
  }

  /**
   * Get customer orders for a counterparty with product details
   * @param {string} counterpartyId - MoySklad counterparty ID
   * @param {Object} options - Options
   * @param {number} options.limit - Max orders (default: 50)
   * @returns {Promise<Array>} Array of orders with product details
   */
  async getCounterpartyOrders(counterpartyId, options = {}) {
    try {
      if (!counterpartyId) {
        throw new Error("Counterparty ID is required");
      }

      const { limit = 50 } = options;

      const cacheKey = `counterparty:${counterpartyId}:orders`;

      // Check cache
      const cached = await Cache.get(cacheKey);
      if (cached) {
        console.log(`✅ Cache hit for orders ${counterpartyId}`);
        return cached;
      }

      const url = `${this.apiUrl}/entity/customerorder?filter=agent=${this.apiUrl}/entity/counterparty/${counterpartyId}&limit=${limit}&order=moment,desc&expand=positions`;

      console.log(`Fetching orders for counterparty ${counterpartyId}`);

      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        console.error(`Error fetching orders: ${response.status}`);
        return [];
      }

      const data = await response.json();
      const orders = [];

      if (data.rows && data.rows.length > 0) {
        for (const order of data.rows) {
          const products = [];

          // Get product details from positions
          if (order.positions && order.positions.rows) {
            for (const position of order.positions.rows) {
              // Get product image URL if available
              let imageUrl = null;
              if (position.assortment?.image) {
                imageUrl = position.assortment.image.meta?.href || null;
              }

              products.push({
                name: position.assortment?.name || "N/A",
                code: position.assortment?.code || "",
                article: position.assortment?.article || "",
                quantity: position.quantity || 0,
                price: (position.price || 0) / 100,
                sum: ((position.price || 0) * (position.quantity || 0)) / 100,
                imageUrl: imageUrl,
                productId:
                  position.assortment?.meta?.href?.split("/").pop() || null,
              });
            }
          }

          orders.push({
            id: order.id,
            name: order.name,
            number: order.name?.match(/\d+/)?.[0] || "",
            date: order.moment || order.created,
            sum: (order.sum || 0) / 100,
            description: order.description || "",
            state: order.state?.name || "N/A",
            products: products,
            productsCount: products.length,
            moySkladUrl: `https://online.moysklad.ru/app/#/customerorder/edit?id=${order.id}`,
          });
        }
      }

      // Cache for 5 minutes
      await Cache.set(cacheKey, orders, 300);

      console.log(`✅ Found ${orders.length} orders`);
      return orders;
    } catch (error) {
      console.error("Error getting counterparty orders:", error.message);
      return [];
    }
  }
}

// Export singleton instance
const moySkladService = new MoySkladService();
export default moySkladService;
