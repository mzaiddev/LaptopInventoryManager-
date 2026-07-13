const { ipcMain, dialog, app } = require("electron");
const inventoryService = require("../services/inventoryService");
const dashboardService = require("../services/dashboardService");
const backupService = require("../services/backupService");
const settingsService = require("../services/settingsService");
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
  if (
    data.selling_price === undefined ||
    data.selling_price === null ||
    data.selling_price < 0
  ) {
    errors.push("Selling price cannot be negative.");
  }
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
