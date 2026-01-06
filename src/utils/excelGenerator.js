import xlsx from "xlsx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Excel Generator Utility
 * Creates Excel files for order history and shipments
 */
class ExcelGenerator {
  /**
   * Generate Excel file with shipment details
   * @param {Object} data - Data object
   * @param {Object} data.counterparty - Counterparty info (id, name, phone, balance)
   * @param {Array} data.shipments - Array of shipments with products
   * @param {string} language - Language code ('uz' or 'ru')
   * @returns {Promise<string>} Path to generated Excel file
   */
  async generateShipmentsExcel(data, language = "uz") {
    try {
      const { counterparty, shipments } = data;

      // Create workbook
      const workbook = xlsx.utils.book_new();

      // Texts in different languages
      const texts = {
        uz: {
          sheetName: "Yuboruvlar",
          title: "YUBORUVLAR TARIXI",
          clientName: "Mijoz:",
          phone: "Telefon:",
          totalDebt: "Jami qarz:",
          date: "Sana",
          docNumber: "Hujjat №",
          productName: "Mahsulot nomi",
          code: "Kod",
          quantity: "Miqdor",
          price: "Narx",
          sum: "Summa",
          status: "Holat",
          total: "JAMI:",
          empty: "Ma'lumot topilmadi",
        },
        ru: {
          sheetName: "Отгрузки",
          title: "ИСТОРИЯ ОТГРУЗОК",
          clientName: "Клиент:",
          phone: "Телефон:",
          totalDebt: "Общий долг:",
          date: "Дата",
          docNumber: "Документ №",
          productName: "Наименование товара",
          code: "Код",
          quantity: "Кол-во",
          price: "Цена",
          sum: "Сумма",
          status: "Статус",
          total: "ИТОГО:",
          empty: "Данные не найдены",
        },
      };

      const t = texts[language] || texts.uz;

      // Prepare data for worksheet
      const wsData = [];

      // Header
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

      if (!shipments || shipments.length === 0) {
        wsData.push([t.empty]);
      } else {
        // Table header
        wsData.push([
          t.date,
          t.docNumber,
          t.productName,
          t.code,
          t.quantity,
          t.price,
          t.sum,
          t.status,
        ]);

        // Process each shipment
        let grandTotal = 0;
        shipments.forEach((shipment) => {
          const date = new Date(shipment.date).toLocaleDateString(
            language === "ru" ? "ru-RU" : "uz-UZ"
          );

          if (shipment.products && shipment.products.length > 0) {
            // First product row includes shipment info
            const firstProduct = shipment.products[0];
            // Add product name with image link if available
            let productName = firstProduct.name;
            if (firstProduct.imageUrl) {
              productName = `${firstProduct.name} 📷`;
            }

            wsData.push([
              date,
              shipment.number || shipment.name,
              productName,
              firstProduct.code || firstProduct.article,
              firstProduct.quantity,
              firstProduct.price,
              firstProduct.sum,
              shipment.state,
            ]);

            // Rest of the products
            for (let i = 1; i < shipment.products.length; i++) {
              const product = shipment.products[i];
              let prodName = product.name;
              if (product.imageUrl) {
                prodName = `${product.name} 📷`;
              }

              wsData.push([
                "",
                "",
                prodName,
                product.code || product.article,
                product.quantity,
                product.price,
                product.sum,
                "",
              ]);
            }
          } else {
            // Shipment without products
            wsData.push([
              date,
              shipment.number || shipment.name,
              "-",
              "",
              "",
              "",
              shipment.sum,
              shipment.state,
            ]);
          }

          grandTotal += shipment.sum;

          // Empty row between shipments
          wsData.push([]);
        });

        // Grand total
        wsData.push(["", "", "", "", "", t.total, grandTotal, ""]);
      }

      // Create worksheet
      const ws = xlsx.utils.aoa_to_sheet(wsData);

      // Set column widths
      ws["!cols"] = [
        { wch: 12 }, // Date
        { wch: 12 }, // Doc number
        { wch: 40 }, // Product name
        { wch: 15 }, // Code
        { wch: 10 }, // Quantity
        { wch: 15 }, // Price
        { wch: 15 }, // Sum
        { wch: 15 }, // Status
      ];

      // Add worksheet to workbook
      xlsx.utils.book_append_sheet(workbook, ws, t.sheetName);

      // Generate file path
      const tempDir = path.join(__dirname, "../../temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const timestamp = Date.now();
      const fileName = `shipments_${counterparty.phone}_${timestamp}.xlsx`;
      const filePath = path.join(tempDir, fileName);

      // Write file
      xlsx.writeFile(workbook, filePath);

      console.log(`✅ Excel file generated: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error("Error generating Excel file:", error.message);
      throw error;
    }
  }

  /**
   * Generate Excel file with orders details
   * @param {Object} data - Data object
   * @param {Object} data.counterparty - Counterparty info
   * @param {Array} data.orders - Array of orders with products
   * @param {string} language - Language code ('uz' or 'ru')
   * @returns {Promise<string>} Path to generated Excel file
   */
  async generateOrdersExcel(data, language = "uz") {
    try {
      const { counterparty, orders } = data;

      // Create workbook
      const workbook = xlsx.utils.book_new();

      // Texts in different languages
      const texts = {
        uz: {
          sheetName: "Buyurtmalar",
          title: "BUYURTMALAR TARIXI",
          clientName: "Mijoz:",
          phone: "Telefon:",
          totalDebt: "Jami qarz:",
          date: "Sana",
          docNumber: "Hujjat №",
          productName: "Mahsulot nomi",
          code: "Kod",
          quantity: "Miqdor",
          price: "Narx",
          sum: "Summa",
          status: "Holat",
          total: "JAMI:",
          empty: "Ma'lumot topilmadi",
        },
        ru: {
          sheetName: "Заказы",
          title: "ИСТОРИЯ ЗАКАЗОВ",
          clientName: "Клиент:",
          phone: "Телефон:",
          totalDebt: "Общий долг:",
          date: "Дата",
          docNumber: "Документ №",
          productName: "Наименование товара",
          code: "Код",
          quantity: "Кол-во",
          price: "Цена",
          sum: "Сумма",
          status: "Статус",
          total: "ИТОГО:",
          empty: "Данные не найдены",
        },
      };

      const t = texts[language] || texts.uz;

      // Prepare data for worksheet
      const wsData = [];

      // Header
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

      if (!orders || orders.length === 0) {
        wsData.push([t.empty]);
      } else {
        // Table header
        wsData.push([
          t.date,
          t.docNumber,
          t.productName,
          t.code,
          t.quantity,
          t.price,
          t.sum,
          t.status,
        ]);

        // Process each order
        let grandTotal = 0;
        orders.forEach((order) => {
          const date = new Date(order.date).toLocaleDateString(
            language === "ru" ? "ru-RU" : "uz-UZ"
          );

          if (order.products && order.products.length > 0) {
            // First product row includes order info
            const firstProduct = order.products[0];
            // Add product name with image icon if available
            let productName = firstProduct.name;
            if (firstProduct.imageUrl) {
              productName = `${firstProduct.name} 📷`;
            }

            wsData.push([
              date,
              order.number || order.name,
              productName,
              firstProduct.code || firstProduct.article,
              firstProduct.quantity,
              firstProduct.price,
              firstProduct.sum,
              order.state,
            ]);

            // Rest of the products
            for (let i = 1; i < order.products.length; i++) {
              const product = order.products[i];
              let prodName = product.name;
              if (product.imageUrl) {
                prodName = `${product.name} 📷`;
              }

              wsData.push([
                "",
                "",
                prodName,
                product.code || product.article,
                product.quantity,
                product.price,
                product.sum,
                "",
              ]);
            }
          } else {
            // Order without products
            wsData.push([
              date,
              order.number || order.name,
              "-",
              "",
              "",
              "",
              order.sum,
              order.state,
            ]);
          }

          grandTotal += order.sum;

          // Empty row between orders
          wsData.push([]);
        });

        // Grand total
        wsData.push(["", "", "", "", "", t.total, grandTotal, ""]);
      }

      // Create worksheet
      const ws = xlsx.utils.aoa_to_sheet(wsData);

      // Set column widths
      ws["!cols"] = [
        { wch: 12 }, // Date
        { wch: 12 }, // Doc number
        { wch: 40 }, // Product name
        { wch: 15 }, // Code
        { wch: 10 }, // Quantity
        { wch: 15 }, // Price
        { wch: 15 }, // Sum
        { wch: 15 }, // Status
      ];

      // Add worksheet to workbook
      xlsx.utils.book_append_sheet(workbook, ws, t.sheetName);

      // Generate file path
      const tempDir = path.join(__dirname, "../../temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const timestamp = Date.now();
      const fileName = `orders_${counterparty.phone}_${timestamp}.xlsx`;
      const filePath = path.join(tempDir, fileName);

      // Write file
      xlsx.writeFile(workbook, filePath);

      console.log(`✅ Excel file generated: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error("Error generating Excel file:", error.message);
      throw error;
    }
  }

  /**
   * Generate combined Excel file with both shipments and orders
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

      // Generate shipments sheet
      if (shipments && shipments.length > 0) {
        const shipmentsWS = this.generateShipmentsSheet(
          counterparty,
          shipments,
          language
        );
        xlsx.utils.book_append_sheet(workbook, shipmentsWS, t.shipmentsSheet);
      }

      // Generate orders sheet
      if (orders && orders.length > 0) {
        const ordersWS = this.generateOrdersSheet(
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
   * Generate worksheet for shipments
   * @private
   */
  generateShipmentsSheet(counterparty, shipments, language) {
    const texts = {
      uz: {
        title: "YUBORUVLAR TARIXI",
        clientName: "Mijoz:",
        phone: "Telefon:",
        totalDebt: "Jami qarz:",
        date: "Sana",
        docNumber: "Hujjat №",
        productName: "Mahsulot nomi",
        code: "Kod",
        quantity: "Miqdor",
        price: "Narx",
        sum: "Summa",
        status: "Holat",
        total: "JAMI:",
      },
      ru: {
        title: "ИСТОРИЯ ОТГРУЗОК",
        clientName: "Клиент:",
        phone: "Телефон:",
        totalDebt: "Общий долг:",
        date: "Дата",
        docNumber: "Документ №",
        productName: "Наименование товара",
        code: "Код",
        quantity: "Кол-во",
        price: "Цена",
        sum: "Сумма",
        status: "Статус",
        total: "ИТОГО:",
      },
    };

    const t = texts[language] || texts.uz;
    const wsData = [];

    // Header
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

    // Table header
    wsData.push([
      t.date,
      t.docNumber,
      t.productName,
      t.code,
      t.quantity,
      t.price,
      t.sum,
      t.status,
    ]);

    // Process shipments
    let grandTotal = 0;
    shipments.forEach((shipment) => {
      const date = new Date(shipment.date).toLocaleDateString(
        language === "ru" ? "ru-RU" : "uz-UZ"
      );

      if (shipment.products && shipment.products.length > 0) {
        const firstProduct = shipment.products[0];
        // Add image icon for products with images
        let productName = firstProduct.name;
        if (firstProduct.imageUrl) {
          productName = `${firstProduct.name} 📷`;
        }

        wsData.push([
          date,
          shipment.number || shipment.name,
          productName,
          firstProduct.code || firstProduct.article,
          firstProduct.quantity,
          firstProduct.price,
          firstProduct.sum,
          shipment.state,
        ]);

        for (let i = 1; i < shipment.products.length; i++) {
          const product = shipment.products[i];
          let prodName = product.name;
          if (product.imageUrl) {
            prodName = `${product.name} 📷`;
          }

          wsData.push([
            "",
            "",
            prodName,
            product.code || product.article,
            product.quantity,
            product.price,
            product.sum,
            "",
          ]);
        }
      } else {
        wsData.push([
          date,
          shipment.number || shipment.name,
          "-",
          "",
          "",
          "",
          shipment.sum,
          shipment.state,
        ]);
      }

      grandTotal += shipment.sum;
      wsData.push([]);
    });

    // Grand total
    wsData.push(["", "", "", "", "", t.total, grandTotal, ""]);

    const ws = xlsx.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 12 },
      { wch: 12 },
      { wch: 40 },
      { wch: 15 },
      { wch: 10 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
    ];

    return ws;
  }

  /**
   * Generate worksheet for orders
   * @private
   */
  generateOrdersSheet(counterparty, orders, language) {
    const texts = {
      uz: {
        title: "BUYURTMALAR TARIXI",
        clientName: "Mijoz:",
        phone: "Telefon:",
        totalDebt: "Jami qarz:",
        date: "Sana",
        docNumber: "Hujjat №",
        productName: "Mahsulot nomi",
        code: "Kod",
        quantity: "Miqdor",
        price: "Narx",
        sum: "Summa",
        status: "Holat",
        total: "JAMI:",
      },
      ru: {
        title: "ИСТОРИЯ ЗАКАЗОВ",
        clientName: "Клиент:",
        phone: "Телефон:",
        totalDebt: "Общий долг:",
        date: "Дата",
        docNumber: "Документ №",
        productName: "Наименование товара",
        code: "Код",
        quantity: "Кол-во",
        price: "Цена",
        sum: "Сумма",
        status: "Статус",
        total: "ИТОГО:",
      },
    };

    const t = texts[language] || texts.uz;
    const wsData = [];

    // Header
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

    // Table header
    wsData.push([
      t.date,
      t.docNumber,
      t.productName,
      t.code,
      t.quantity,
      t.price,
      t.sum,
      t.status,
    ]);

    // Process orders
    let grandTotal = 0;
    orders.forEach((order) => {
      const date = new Date(order.date).toLocaleDateString(
        language === "ru" ? "ru-RU" : "uz-UZ"
      );

      if (order.products && order.products.length > 0) {
        const firstProduct = order.products[0];
        // Add image icon for products with images
        let productName = firstProduct.name;
        if (firstProduct.imageUrl) {
          productName = `${firstProduct.name} 📷`;
        }

        wsData.push([
          date,
          order.number || order.name,
          productName,
          firstProduct.code || firstProduct.article,
          firstProduct.quantity,
          firstProduct.price,
          firstProduct.sum,
          order.state,
        ]);

        for (let i = 1; i < order.products.length; i++) {
          const product = order.products[i];
          let prodName = product.name;
          if (product.imageUrl) {
            prodName = `${product.name} 📷`;
          }

          wsData.push([
            "",
            "",
            prodName,
            product.code || product.article,
            product.quantity,
            product.price,
            product.sum,
            "",
          ]);
        }
      } else {
        wsData.push([
          date,
          order.number || order.name,
          "-",
          "",
          "",
          "",
          order.sum,
          order.state,
        ]);
      }

      grandTotal += order.sum;
      wsData.push([]);
    });

    // Grand total
    wsData.push(["", "", "", "", "", t.total, grandTotal, ""]);

    const ws = xlsx.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 12 },
      { wch: 12 },
      { wch: 40 },
      { wch: 15 },
      { wch: 10 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
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
