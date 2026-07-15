const { ipcMain, dialog, app } = require("electron");
const inventoryService = require("../services/inventoryService");
const dashboardService = require("../services/dashboardService");
const backupService = require("../services/backupService");
const settingsService = require("../services/settingsService");
const ledgerService = require("../services/ledgerService");
const fs = require("fs");

function registerIpcHandlers() {
  // Dashboard
  ipcMain.handle("dashboard:getData", async () => {
    try {
      return { success: true, data: dashboardService.getDashboardData() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Inventory - List Products
  ipcMain.handle("inventory:getAll", async (event, filters) => {
    try {
      const result = inventoryService.getAllProducts(filters);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Inventory - Get Single Product
  ipcMain.handle("inventory:getById", async (event, id) => {
    try {
      const product = inventoryService.getProductById(id);
      return { success: true, data: product };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Inventory - Add Product
  ipcMain.handle("inventory:add", async (event, productData) => {
    try {
      const errors = validateProduct(productData);
      if (errors.length > 0) {
        return { success: false, error: errors.join("; ") };
      }
      const result = inventoryService.addProduct(productData);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Inventory - Update Product
  ipcMain.handle("inventory:update", async (event, id, productData) => {
    try {
      const errors = validateProduct(productData);
      if (errors.length > 0) {
        return { success: false, error: errors.join("; ") };
      }
      inventoryService.updateProduct(id, productData);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Inventory - Delete Product
  ipcMain.handle("inventory:delete", async (event, id) => {
    try {
      inventoryService.deleteProduct(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Inventory - Change Status
  ipcMain.handle("inventory:changeStatus", async (event, id, status) => {
    try {
      inventoryService.changeStatus(id, status);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Inventory - Change Condition
  ipcMain.handle("inventory:changeCondition", async (event, id, condition) => {
    try {
      inventoryService.changeCondition(id, condition);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Inventory - Inspection Notes
  ipcMain.handle(
    "inventory:addInspectionNote",
    async (event, productId, note) => {
      try {
        const result = inventoryService.addInspectionNote(productId, note);
        return { success: true, data: result };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  );

  ipcMain.handle("inventory:getInspectionNotes", async (event, productId) => {
    try {
      const notes = inventoryService.getInspectionNotes(productId);
      return { success: true, data: notes };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("inventory:deleteInspectionNote", async (event, noteId) => {
    try {
      inventoryService.deleteInspectionNote(noteId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Inventory - Dropdown data
  ipcMain.handle("inventory:getCategories", async () => {
    try {
      return { success: true, data: inventoryService.getCategories() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("inventory:getSuppliers", async () => {
    try {
      return { success: true, data: inventoryService.getSuppliers() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Settings - Get all settings
  ipcMain.handle("settings:getAll", async () => {
    try {
      const settings = settingsService.getAllSettings();
      return { success: true, data: settings };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Settings - Update settings
  ipcMain.handle("settings:update", async (event, settings) => {
    try {
      settingsService.updateSettings(settings);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Settings - Select folder dialog
  ipcMain.handle("settings:selectFolder", async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, data: null };
      }
      return { success: true, data: result.filePaths[0] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Backup
  ipcMain.handle("backup:create", async () => {
    try {
      const result = await backupService.createBackup();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("backup:getHistory", async () => {
    try {
      const history = backupService.getBackupHistory();
      return { success: true, data: history };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("backup:delete", async (event, backupId) => {
    try {
      backupService.deleteBackup(backupId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Backup - Select file dialog
  ipcMain.handle("backup:selectFile", async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "Database Files", extensions: ["db"] }],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, data: null };
      }
      return { success: true, data: result.filePaths[0] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Backup - Restore
  ipcMain.handle("backup:restore", async (event, backupPath) => {
    try {
      const result = backupService.restoreBackup(backupPath);
      app.relaunch();
      app.exit(0);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ==================== LEDGER MODULE IPC HANDLERS ====================

  // --- Customers ---
  ipcMain.handle("ledger:getAllCustomers", async (event, filters) => {
    try {
      return { success: true, data: ledgerService.getAllCustomers(filters) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("ledger:getCustomerById", async (event, id) => {
    try {
      return { success: true, data: ledgerService.getCustomerById(id) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("ledger:searchCustomers", async (event, query) => {
    try {
      return { success: true, data: ledgerService.searchCustomers(query) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("ledger:addCustomer", async (event, data) => {
    try {
      const result = ledgerService.addCustomer(data);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("ledger:updateCustomer", async (event, id, data) => {
    try {
      ledgerService.updateCustomer(id, data);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("ledger:deleteCustomer", async (event, id) => {
    try {
      ledgerService.deleteCustomer(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("ledger:getCustomerBalance", async (event, id) => {
    try {
      return { success: true, data: ledgerService.getCustomerBalance(id) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- Sales ---
  ipcMain.handle("ledger:createSale", async (event, data) => {
    try {
      const result = ledgerService.createSale(data);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- Sales (replaces ledgers) ---
  ipcMain.handle("sale:getAllSales", async (event, filters) => {
    try {
      return { success: true, data: ledgerService.getAllSales(filters) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("sale:getSaleById", async (event, id) => {
    try {
      return { success: true, data: ledgerService.getSaleById(id) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- Payments ---
  ipcMain.handle("sale:addPayment", async (event, data) => {
    try {
      const result = ledgerService.addPayment(data);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- Delete Sale ---
  ipcMain.handle("sale:delete", async (event, saleId) => {
    try {
      const result = ledgerService.deleteSale(saleId);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- Delete Payment ---
  ipcMain.handle("sale:deletePayment", async (event, paymentId) => {
    try {
      const result = ledgerService.deletePayment(paymentId);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- Update Sale ---
  ipcMain.handle("sale:update", async (event, saleId, data) => {
    try {
      const result = ledgerService.updateSale(saleId, data);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- Update Payment ---
  ipcMain.handle("sale:updatePayment", async (event, paymentId, data) => {
    try {
      const result = ledgerService.updatePayment(paymentId, data);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- Returns ---
  ipcMain.handle("ledger:createReturn", async (event, data) => {
    try {
      const result = ledgerService.createReturn(data);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("ledger:getAllReturns", async (event, filters) => {
    try {
      return { success: true, data: ledgerService.getAllReturns(filters) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- Damage Management ---
  ipcMain.handle("damage:record", async (event, data) => {
    try {
      const result = ledgerService.recordDamage(data);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("damage:getAll", async (event, filters) => {
    try {
      return { success: true, data: ledgerService.getAllDamages(filters) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("damage:correct", async (event, id, data) => {
    try {
      return { success: true, data: ledgerService.correctDamage(id, data) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- Customer Profile ---
  ipcMain.handle("customer:getFullProfile", async (event, customerId) => {
    try {
      const profile = ledgerService.getCustomerFullProfile(customerId);
      return { success: true, data: profile };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("customer:getStatement", async (event, customerId) => {
    try {
      const statement = ledgerService.getCustomerStatement(customerId);
      return { success: true, data: statement };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- Reports ---
  ipcMain.handle("sale:getSalesSummary", async () => {
    try {
      return { success: true, data: ledgerService.getSalesSummary() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("ledger:getSalesReport", async (event, filters) => {
    try {
      return { success: true, data: ledgerService.getSalesReport(filters) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("ledger:getOutstandingReport", async () => {
    try {
      return { success: true, data: ledgerService.getOutstandingReport() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

function validateProduct(data) {
  const errors = [];
  if (!data.product_name || data.product_name.trim() === "") {
    errors.push("Product name is required.");
  }
  if (!data.category || data.category.trim() === "") {
    errors.push("Category is required.");
  }
  if (
    data.purchase_price === undefined ||
    data.purchase_price === null ||
    data.purchase_price < 0
  ) {
    errors.push("Purchase price cannot be negative.");
  }
  // Selling price validation removed - managed from Sales module
  if (
    data.quantity === undefined ||
    data.quantity === null ||
    data.quantity < 0
  ) {
    errors.push("Quantity cannot be negative.");
  }
  return errors;
}

module.exports = { registerIpcHandlers };