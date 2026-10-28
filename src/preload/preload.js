const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // Dashboard
  getDashboardData: (range) => ipcRenderer.invoke("dashboard:getData", range),

  // Inventory
  getProducts: (filters) => ipcRenderer.invoke("inventory:getAll", filters),
  getProduct: (id) => ipcRenderer.invoke("inventory:getById", id),
  addProduct: (data) => ipcRenderer.invoke("inventory:add", data),
  updateProduct: (id, data) => ipcRenderer.invoke("inventory:update", id, data),
  deleteProduct: (id) => ipcRenderer.invoke("inventory:delete", id),
  bulkUpdateProducts: (ids, change) => ipcRenderer.invoke("inventory:bulkUpdate", ids, change),
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

  // Lists & Setup
  getList: (key, opts) => ipcRenderer.invoke("lists:get", key, opts),
  addListItem: (key, name) => ipcRenderer.invoke("lists:add", key, name),
  renameListItem: (id, name) => ipcRenderer.invoke("lists:rename", id, name),
  mergeListItems: (fromId, intoId) => ipcRenderer.invoke("lists:merge", fromId, intoId),
  setListItemActive: (id, active) => ipcRenderer.invoke("lists:setActive", id, active),
  removeListItem: (id) => ipcRenderer.invoke("lists:remove", id),
  reorderList: (key, ids) => ipcRenderer.invoke("lists:reorder", key, ids),

  // Settings
  getSettings: () => ipcRenderer.invoke("settings:getAll"),
  updateSettings: (settings) => ipcRenderer.invoke("settings:update", settings),
  selectFolder: () => ipcRenderer.invoke("settings:selectFolder"),

  // Backup
  createBackup: () => ipcRenderer.invoke("backup:create"),
  getBackupHistory: () => ipcRenderer.invoke("backup:getHistory"),
  getAutomaticBackups: () => ipcRenderer.invoke("backup:getAutomatic"),
  restoreAutomaticBackup: (name) => ipcRenderer.invoke("backup:restoreAutomatic", name),
  deleteBackup: (backupId) => ipcRenderer.invoke("backup:delete", backupId),
  selectBackupFile: () => ipcRenderer.invoke("backup:selectFile"),
  restoreBackup: (path) => ipcRenderer.invoke("backup:restore", path),
  driveStatus: () => ipcRenderer.invoke("drive:status"),
  connectDrive: () => ipcRenderer.invoke("drive:connect"),
  disconnectDrive: () => ipcRenderer.invoke("drive:disconnect"),
  listDriveBackups: () => ipcRenderer.invoke("drive:listBackups"),
  downloadDriveBackup: (id) => ipcRenderer.invoke("drive:downloadBackup", id),
  saveDriveSettings: (settings) => ipcRenderer.invoke("drive:saveSettings", settings),
  retryDriveBackups: () => ipcRenderer.invoke("drive:retryFailed"),

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
   deletePayment: (id) => ipcRenderer.invoke("sale:deletePayment", id),
   updatePayment: (id, data) => ipcRenderer.invoke("sale:updatePayment", id, data),

   // Delete/Update Sale
   deleteSale: (id) => ipcRenderer.invoke("sale:delete", id),
   updateSale: (id, data) => ipcRenderer.invoke("sale:update", id, data),

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

  // Old Balance Management
  getAllOldBalances: (filters) => ipcRenderer.invoke("oldBalance:getAll", filters),
  getOldBalanceById: (id) => ipcRenderer.invoke("oldBalance:getById", id),
  getOldBalancesByCustomer: (customerId) => ipcRenderer.invoke("oldBalance:getByCustomer", customerId),
  getCustomerOldBalanceTotal: (customerId) => ipcRenderer.invoke("oldBalance:getCustomerTotal", customerId),
  getOldBalanceSummary: () => ipcRenderer.invoke("oldBalance:getSummary"),
  addOldBalance: (data) => ipcRenderer.invoke("oldBalance:add", data),
  updateOldBalance: (id, data) => ipcRenderer.invoke("oldBalance:update", id, data),
  deleteOldBalance: (id) => ipcRenderer.invoke("oldBalance:delete", id),

  getLedgerEntries: (filters) => ipcRenderer.invoke("ledger:getEntries", filters),
  checkIntegrity: () => ipcRenderer.invoke("integrity:check"),

  // Activity log
  listAudit: (opts) => ipcRenderer.invoke("audit:list", opts),

  // Statements
  shareStatement: (payload) => ipcRenderer.invoke("statement:share", payload),
  autoSendStatement: (payload) => ipcRenderer.invoke("statement:autoSend", payload),
  waStatus: () => ipcRenderer.invoke("wa:status"),
  waConnect: () => ipcRenderer.invoke("wa:connect"),
  waReconnect: () => ipcRenderer.invoke("wa:reconnect"),
  waUnlink: () => ipcRenderer.invoke("wa:unlink"),
  // Background tasks
  listTasks: () => ipcRenderer.invoke("tasks:list"),
  getTask: (id) => ipcRenderer.invoke("tasks:get", id),
  enqueueWhatsappTask: (title, items) => ipcRenderer.invoke("tasks:enqueueWhatsapp", title, items),
  enqueueProductImport: (rows) => ipcRenderer.invoke("tasks:enqueueProductImport", rows),
  stopTask: (id) => ipcRenderer.invoke("tasks:stop", id),
  resumeTask: (id) => ipcRenderer.invoke("tasks:resume", id),
  retryFailedTaskItems: (id) => ipcRenderer.invoke("tasks:retryFailed", id),
  onTaskChanged: (cb) => {
    const handler = (event, data) => cb(data);
    ipcRenderer.on("tasks:changed", handler);
    return () => ipcRenderer.removeListener("tasks:changed", handler);
  },
  // Pushed by the main process whenever the WhatsApp link changes. Returns a function that stops listening.
  onWaChanged: (cb) => {
    const handler = (event, status) => cb(status);
    ipcRenderer.on("wa:changed", handler);
    return () => ipcRenderer.removeListener("wa:changed", handler);
  },

  // Expenses
  addExpense: (d) => ipcRenderer.invoke("expense:add", d),
  updateExpense: (id, d) => ipcRenderer.invoke("expense:update", id, d),
  deleteExpense: (id) => ipcRenderer.invoke("expense:delete", id),
  listExpenses: (f) => ipcRenderer.invoke("expense:list", f),
  expenseTotals: (f) => ipcRenderer.invoke("expense:totals", f),
  listSuppliers: (f) => ipcRenderer.invoke("supplier:list", f),
  getSupplier: (id) => ipcRenderer.invoke("supplier:get", id),
  addSupplier: (d) => ipcRenderer.invoke("supplier:add", d),
  updateSupplier: (id, d) => ipcRenderer.invoke("supplier:update", id, d),
  deleteSupplier: (id) => ipcRenderer.invoke("supplier:delete", id),
  supplierTotals: () => ipcRenderer.invoke("supplier:totals"),
  supplierStatement: (id, f) => ipcRenderer.invoke("supplier:statement", id, f),
  addSupplierPurchase: (d) => ipcRenderer.invoke("supplier:addPurchase", d),
  addSupplierPayment: (d) => ipcRenderer.invoke("supplier:addPayment", d),
  updateSupplierEntry: (id, d) => ipcRenderer.invoke("supplier:updateEntry", id, d),
  deleteSupplierEntry: (id) => ipcRenderer.invoke("supplier:deleteEntry", id),
  getCashBook: (f) => ipcRenderer.invoke("cashbook:get", f),

  // Auth
  authStatus: () => ipcRenderer.invoke("auth:status"),
  login: (username, password) => ipcRenderer.invoke("auth:login", username, password),
  logout: () => ipcRenderer.invoke("auth:logout"),
  vendorProvision: (data) => ipcRenderer.invoke("vendor:provision", data),
  changePassword: (current, next) => ipcRenderer.invoke("auth:changePassword", current, next),
  changeSuperPassword: (current, next) => ipcRenderer.invoke("auth:changeSuperPassword", current, next),
  grantSuper: (password) => ipcRenderer.invoke("auth:grantSuper", password),
  revealCost: (password) => ipcRenderer.invoke("auth:revealCost", password),
  hideCost: () => ipcRenderer.invoke("auth:hideCost"),
  revokeSuper: () => ipcRenderer.invoke("auth:revokeSuper"),

  // ============ NEW LEDGER SYSTEM ============
  getCustomerLedger: (customerId, filters) => ipcRenderer.invoke("ledger:getCustomerLedger", customerId, filters),
  getCustomerLedgerSummary: (customerId) => ipcRenderer.invoke("ledger:getCustomerLedgerSummary", customerId),
  getCustomerLedgerReport: () => ipcRenderer.invoke("ledger:getCustomerLedgerReport"),
  addLedgerPayment: (data) => ipcRenderer.invoke("ledger:addLedgerPayment", data),
  addLedgerOldBalance: (data) => ipcRenderer.invoke("ledger:addLedgerOldBalance", data),
});
