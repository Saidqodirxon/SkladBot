import xlsx from "xlsx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Excel Generator Utility
 * Creates detailed Excel files with document and product information
 */
class ExcelGenerator {
  /**
   * Generate combined Excel file with detailed shipments and orders
   * Shows each document with full product details (image, name, code, quantity, price)
   * @param {Object} data - Data object
   * @param {Object} data.counterparty - Counterparty info
   * @param {Array} data.shipments - Array of shipments
   * @param {Array} data.orders - Array of orders
   * @param {string} language - Language code ('uz' or 'ru')
   * @returns {Promise<string>} Path to generated Excel file
   */
  async generateCombinedExcel(data, language = "uz") {
    try {
      const { counterparty, shipments, orders } = data;

      // Create workbook
      const workbook = xlsx.utils.book_new();

      // Texts
      const texts = {
        uz: {
          shipmentsSheet: "Yuboruvlar",
          ordersSheet: "Buyurtmalar",
        },
        ru: {
          shipmentsSheet: "Отгрузки",
          ordersSheet: "Заказы",
        },
      };

      const t = texts[language] || texts.uz;

      // Generate shipments sheet with detailed products
      if (shipments && shipments.length > 0) {
        const shipmentsWS = this.generateDetailedShipmentsSheet(
          counterparty,
          shipments,
          language
        );
        xlsx.utils.book_append_sheet(workbook, shipmentsWS, t.shipmentsSheet);
      }

      // Generate orders sheet with detailed products
      if (orders && orders.length > 0) {
        const ordersWS = this.generateDetailedOrdersSheet(
          counterparty,
          orders,
          language
        );
        xlsx.utils.book_append_sheet(workbook, ordersWS, t.ordersSheet);
      }

      // Generate file path
      const tempDir = path.join(__dirname, "../../temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const timestamp = Date.now();
      const fileName = `history_${counterparty.phone}_${timestamp}.xlsx`;
      const filePath = path.join(tempDir, fileName);

      // Write file
      xlsx.writeFile(workbook, filePath);

      console.log(`✅ Combined Excel file generated: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error("Error generating combined Excel file:", error.message);
      throw error;
    }
  }

  /**
   * Generate detailed worksheet for shipments
   * Each shipment shows document info and all products with details
   * @private
   */
  generateDetailedShipmentsSheet(counterparty, shipments, language) {
    const texts = {
      uz: {
        title: "YUBORUVLAR TARIXI (Что получил клиент)",
        clientName: "Mijoz:",
        phone: "Telefon:",
        totalDebt: "Jami qarz:",
        docInfo: "HUJJAT MA'LUMOTLARI",
        date: "Sana:",
        docNumber: "Hujjat raqami:",
        sum: "Summa:",
        status: "Holat:",
        productsTitle: "MAHSULOTLAR:",
        productName: "Mahsulot nomi",
        image: "Rasm",
        code: "Kod",
        article: "Artikul",
        quantity: "Miqdor",
        price: "Narx",
        productSum: "Summa",
        total: "JAMI:",
        grandTotal: "UMUMIY JAMI:",
      },
      ru: {
        title: "ИСТОРИЯ ОТГРУЗОК (Что получил клиент)",
        clientName: "Клиент:",
        phone: "Телефон:",
        totalDebt: "Общий долг:",
        docInfo: "ИНФОРМАЦИЯ О ДОКУМЕНТЕ",
        date: "Дата:",
        docNumber: "Номер документа:",
        sum: "Сумма:",
        status: "Статус:",
        productsTitle: "ТОВАРЫ:",
        productName: "Наименование товара",
        image: "Фото",
        code: "Код",
        article: "Артикул",
        quantity: "Кол-во",
        price: "Цена",
        productSum: "Сумма",
        total: "ИТОГО:",
        grandTotal: "ОБЩИЙ ИТОГ:",
      },
    };

    const t = texts[language] || texts.uz;
    const wsData = [];

    // Header with counterparty info
    wsData.push([t.title]);
    wsData.push([]);
    wsData.push([t.clientName, counterparty.name]);
    wsData.push([t.phone, counterparty.phone]);
    if (counterparty.balance < 0) {
      wsData.push([
        t.totalDebt,
        this.formatCurrency(Math.abs(counterparty.balance)),
      ]);
    }
    wsData.push([]);
    wsData.push(["═".repeat(100)]);
    wsData.push([]);

    let grandTotal = 0;

    // Process each shipment with detailed product info
    shipments.forEach((shipment, index) => {
      const date = new Date(shipment.date).toLocaleDateString(
        language === "ru" ? "ru-RU" : "uz-UZ"
      );

      // Document header
      wsData.push([`${t.docInfo} #${index + 1}`]);
      wsData.push([t.date, date]);
      wsData.push([t.docNumber, shipment.number || shipment.name]);
      wsData.push([t.sum, this.formatCurrency(shipment.sum)]);
      wsData.push([t.status, shipment.state]);
      wsData.push([]);

      // Products table header
      wsData.push([t.productsTitle]);
      wsData.push([
        "№",
        t.image,
        t.productName,
        t.code,
        t.article,
        t.quantity,
        t.price,
        t.productSum,
      ]);

      // Products data
      if (shipment.products && shipment.products.length > 0) {
        console.log(
          `📦 Shipment #${index + 1} has ${shipment.products.length} products`
        );

        shipment.products.forEach((product, prodIndex) => {
          console.log(`  Product ${prodIndex + 1}:`, {
            name: product.name,
            code: product.code,
            article: product.article,
            quantity: product.quantity,
            price: product.price,
            sum: product.sum,
            imageUrl: product.imageUrl,
          });

          const imageIndicator = product.imageUrl ? "📷 Bor" : "-";

          wsData.push([
            prodIndex + 1,
            imageIndicator,
            product.name || "N/A",
            product.code || "-",
            product.article || "-",
            product.quantity || 0,
            this.formatCurrency(product.price || 0),
            this.formatCurrency(product.sum || 0),
          ]);
        });
      } else {
        console.log(`⚠️ Shipment #${index + 1} has NO products!`);
        wsData.push(["-", "-", "Ma'lumot yo'q", "-", "-", "-", "-", "-"]);
      }

      wsData.push([]);
      wsData.push([
        "",
        "",
        "",
        "",
        "",
        t.total,
        this.formatCurrency(shipment.sum),
      ]);
      wsData.push([]);
      wsData.push(["─".repeat(100)]);
      wsData.push([]);

      grandTotal += shipment.sum;
    });

    // Grand total
    wsData.push([t.grandTotal, this.formatCurrency(grandTotal)]);

    const ws = xlsx.utils.aoa_to_sheet(wsData);

    // Set column widths for better readability
    ws["!cols"] = [
      { wch: 5 }, // №
      { wch: 10 }, // Image
      { wch: 50 }, // Product name
      { wch: 15 }, // Code
      { wch: 15 }, // Article
      { wch: 10 }, // Quantity
      { wch: 15 }, // Price
      { wch: 15 }, // Sum
    ];

    return ws;
  }

  /**
   * Generate detailed worksheet for orders
   * Each order shows document info and all products with details
   * @private
   */
  generateDetailedOrdersSheet(counterparty, orders, language) {
    const texts = {
      uz: {
        title: "BUYURTMALAR TARIXI",
        clientName: "Mijoz:",
        phone: "Telefon:",
        totalDebt: "Jami qarz:",
        docInfo: "HUJJAT MA'LUMOTLARI",
        date: "Sana:",
        docNumber: "Hujjat raqami:",
        sum: "Summa:",
        status: "Holat:",
        productsTitle: "MAHSULOTLAR:",
        productName: "Mahsulot nomi",
        image: "Rasm",
        code: "Kod",
        article: "Artikul",
        quantity: "Miqdor",
        price: "Narx",
        productSum: "Summa",
        total: "JAMI:",
        grandTotal: "UMUMIY JAMI:",
      },
      ru: {
        title: "ИСТОРИЯ ЗАКАЗОВ",
        clientName: "Клиент:",
        phone: "Телефон:",
        totalDebt: "Общий долг:",
        docInfo: "ИНФОРМАЦИЯ О ДОКУМЕНТЕ",
        date: "Дата:",
        docNumber: "Номер документа:",
        sum: "Сумма:",
        status: "Статус:",
        productsTitle: "ТОВАРЫ:",
        productName: "Наименование товара",
        image: "Фото",
        code: "Код",
        article: "Артикул",
        quantity: "Кол-во",
        price: "Цена",
        productSum: "Сумма",
        total: "ИТОГО:",
        grandTotal: "ОБЩИЙ ИТОГ:",
      },
    };

    const t = texts[language] || texts.uz;
    const wsData = [];

    // Header with counterparty info
    wsData.push([t.title]);
    wsData.push([]);
    wsData.push([t.clientName, counterparty.name]);
    wsData.push([t.phone, counterparty.phone]);
    if (counterparty.balance < 0) {
      wsData.push([
        t.totalDebt,
        this.formatCurrency(Math.abs(counterparty.balance)),
      ]);
    }
    wsData.push([]);
    wsData.push(["═".repeat(100)]);
    wsData.push([]);

    let grandTotal = 0;

    // Process each order with detailed product info
    orders.forEach((order, index) => {
      const date = new Date(order.date).toLocaleDateString(
        language === "ru" ? "ru-RU" : "uz-UZ"
      );

      // Document header
      wsData.push([`${t.docInfo} #${index + 1}`]);
      wsData.push([t.date, date]);
      wsData.push([t.docNumber, order.number || order.name]);
      wsData.push([t.sum, this.formatCurrency(order.sum)]);
      wsData.push([t.status, order.state]);
      wsData.push([]);

      // Products table header
      wsData.push([t.productsTitle]);
      wsData.push([
        "№",
        t.image,
        t.productName,
        t.code,
        t.article,
        t.quantity,
        t.price,
        t.productSum,
      ]);

      // Products data
      if (order.products && order.products.length > 0) {
        console.log(
          `📦 Order #${index + 1} has ${order.products.length} products`
        );

        order.products.forEach((product, prodIndex) => {
          console.log(`  Product ${prodIndex + 1}:`, {
            name: product.name,
            code: product.code,
            article: product.article,
            quantity: product.quantity,
            price: product.price,
            sum: product.sum,
            imageUrl: product.imageUrl,
          });

          const imageIndicator = product.imageUrl ? "📷 Bor" : "-";

          wsData.push([
            prodIndex + 1,
            imageIndicator,
            product.name || "N/A",
            product.code || "-",
            product.article || "-",
            product.quantity || 0,
            this.formatCurrency(product.price || 0),
            this.formatCurrency(product.sum || 0),
          ]);
        });
      } else {
        console.log(`⚠️ Order #${index + 1} has NO products!`);
        wsData.push(["-", "-", "Ma'lumot yo'q", "-", "-", "-", "-", "-"]);
      }

      wsData.push([]);
      wsData.push([
        "",
        "",
        "",
        "",
        "",
        t.total,
        this.formatCurrency(order.sum),
      ]);
      wsData.push([]);
      wsData.push(["─".repeat(100)]);
      wsData.push([]);

      grandTotal += order.sum;
    });

    // Grand total
    wsData.push([t.grandTotal, this.formatCurrency(grandTotal)]);

    const ws = xlsx.utils.aoa_to_sheet(wsData);

    // Set column widths for better readability
    ws["!cols"] = [
      { wch: 5 }, // №
      { wch: 10 }, // Image
      { wch: 50 }, // Product name
      { wch: 15 }, // Code
      { wch: 15 }, // Article
      { wch: 10 }, // Quantity
      { wch: 15 }, // Price
      { wch: 15 }, // Sum
    ];

    return ws;
  }

  /**
   * Helper to format currency
   * @private
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
   * Clean up old temporary files
   * @param {number} maxAgeMinutes - Delete files older than this (default: 60 minutes)
   */
  async cleanupTempFiles(maxAgeMinutes = 60) {
    try {
      const tempDir = path.join(__dirname, "../../temp");
      if (!fs.existsSync(tempDir)) {
        return;
      }

      const files = fs.readdirSync(tempDir);
      const now = Date.now();
      const maxAge = maxAgeMinutes * 60 * 1000;

      let deletedCount = 0;
      files.forEach((file) => {
        const filePath = path.join(tempDir, file);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtimeMs;

        if (fileAge > maxAge) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      });

      if (deletedCount > 0) {
        console.log(`🗑️  Cleaned up ${deletedCount} old temp files`);
      }
    } catch (error) {
      console.error("Error cleaning up temp files:", error.message);
    }
  }
}

// Export singleton instance
const excelGenerator = new ExcelGenerator();
export default excelGenerator;
