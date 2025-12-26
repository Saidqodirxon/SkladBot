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
}

// Export singleton instance
const moySkladService = new MoySkladService();
export default moySkladService;
