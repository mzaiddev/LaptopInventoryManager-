const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // Dashboard
  getDashboardData: () => ipcRenderer.invoke("dashboard:getData"),

  // Inventory
  getProducts: (filters) => ipcRenderer.invoke("inventory:getAll", filters),
  getProduct: (id) => ipcRenderer.invoke("inventory:getById", id),
  addProduct: (data) => ipcRenderer.invoke("inventory:add", data),
  updateProduct: (id, data) => ipcRenderer.invoke("inventory:update", id, data),
  deleteProduct: (id) => ipcRenderer.invoke("inventory:delete", id),
  changeProductStatus: (id, status) =>
    ipcRenderer.invoke("inventory:changeStatus", id, status),
  changeProductCondition: (id, condition) =>
    ipcRenderer.invoke("inventory:changeCondition", id, condition),
  addInspectionNote: (productId, note) =>
    ipcRenderer.invoke("inventory:addInspectionNote", productId, note),
  getInspectionNotes: (productId) =>
    ipcRenderer.invoke("inventory:getInspectionNotes", productId),
  deleteInspectionNote: (noteId) =>
    ipcRenderer.invoke("inventory:deleteInspectionNote", noteId),
  getCategories: () => ipcRenderer.invoke("inventory:getCategories"),
  getSuppliers: () => ipcRenderer.invoke("inventory:getSuppliers"),

  // Settings
  getSettings: () => ipcRenderer.invoke("settings:getAll"),
  updateSettings: (settings) => ipcRenderer.invoke("settings:update", settings),
  selectFolder: () => ipcRenderer.invoke("settings:selectFolder"),

  // Backup
  createBackup: () => ipcRenderer.invoke("backup:create"),
  getBackupHistory: () => ipcRenderer.invoke("backup:getHistory"),
  deleteBackup: (backupId) => ipcRenderer.invoke("backup:delete", backupId),
  selectBackupFile: () => ipcRenderer.invoke("backup:selectFile"),
  restoreBackup: (path) => ipcRenderer.invoke("backup:restore", path),

  // ============ LEDGER MODULE ============

  // Customers
  getAllCustomers: (filters) => ipcRenderer.invoke("ledger:getAllCustomers", filters),
  getCustomerById: (id) => ipcRenderer.invoke("ledger:getCustomerById", id),
  searchCustomers: (query) => ipcRenderer.invoke("ledger:searchCustomers", query),
  addCustomer: (data) => ipcRenderer.invoke("ledger:addCustomer", data),
  updateCustomer: (id, data) => ipcRenderer.invoke("ledger:updateCustomer", id, data),
  deleteCustomer: (id) => ipcRenderer.invoke("ledger:deleteCustomer", id),
  getCustomerBalance: (id) => ipcRenderer.invoke("ledger:getCustomerBalance", id),

  // Sales
  createSale: (data) => ipcRenderer.invoke("ledger:createSale", data),

  // Sales (replaces ledgers)
  getAllSales: (filters) => ipcRenderer.invoke("sale:getAllSales", filters),
  getSaleById: (id) => ipcRenderer.invoke("sale:getSaleById", id),

  // Payments
  addPayment: (data) => ipcRenderer.invoke("sale:addPayment", data),

  // Returns
  createReturn: (data) => ipcRenderer.invoke("ledger:createReturn", data),
  getAllReturns: (filters) => ipcRenderer.invoke("ledger:getAllReturns", filters),

  // Damage Management
  recordDamage: (data) => ipcRenderer.invoke("damage:record", data),
  getAllDamages: (filters) => ipcRenderer.invoke("damage:getAll", filters),
  correctDamage: (id, data) => ipcRenderer.invoke("damage:correct", id, data),

  // Customer Profile
  getCustomerFullProfile: (customerId) => ipcRenderer.invoke("customer:getFullProfile", customerId),
  getCustomerStatement: (customerId) => ipcRenderer.invoke("customer:getStatement", customerId),

  // Reports
  getSalesSummary: () => ipcRenderer.invoke("sale:getSalesSummary"),
  getSalesReport: (filters) => ipcRenderer.invoke("ledger:getSalesReport", filters),
  getOutstandingReport: () => ipcRenderer.invoke("ledger:getOutstandingReport"),
});