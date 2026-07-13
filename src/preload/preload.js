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
  // brands removed

  // Backup
  createBackup: () => ipcRenderer.invoke("backup:create"),
  getBackupHistory: () => ipcRenderer.invoke("backup:getHistory"),
  deleteBackup: (backupId) => ipcRenderer.invoke("backup:delete", backupId),
  selectBackupFile: () => ipcRenderer.invoke("backup:selectFile"),
  restoreBackup: (path) => ipcRenderer.invoke("backup:restore", path),
});
