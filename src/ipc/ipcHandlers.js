const { ipcMain: rawIpcMain, dialog, app, BrowserWindow } = require("electron");
const authService = require("../services/authService");
const { guardIpc, requireSuper, requireCostVisible, AUDITED } = require("./guard");
const auditService = require("../services/auditService");
const { stripCost } = require("../services/costMask");
const inventoryService = require("../services/inventoryService");
const dashboardService = require("../services/dashboardService");
const backupService = require("../services/backupService");
const settingsService = require("../services/settingsService");
const ledgerService = require("../services/ledgerService");
const oldBalanceService = require("../services/oldBalanceService");
const fs = require("fs");

function registerIpcHandlers() {
  const ipcMain = guardIpc(rawIpcMain, authService, (channel, args) => {
    const [action, entity] = AUDITED[channel];
    // Money movements keep their details (amount, account) in the log; other channels may carry passwords, so they do not.
    const detail = channel.startsWith("supplier:") ? args.find((a) => a && typeof a === "object") || null : null;
    auditService.log(action, entity, typeof args[0] === "number" ? args[0] : null, detail);
  });

  ipcMain.handle("ledger:getEntries", async (event, filters) => {
    try {
      return { success: true, data: ledgerService.getLedgerEntries(filters || {}) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("integrity:check", async () => {
    try {
      return { success: true, data: require("../services/integrityService").check() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("audit:list", async (event, opts) => {
    try {
      return { success: true, data: auditService.list(opts || {}) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Auth
  ipcMain.handle("auth:status", async () => ({
    success: true,
    data: {
      loggedIn: authService.isLoggedIn(),
      hasOwner: authService.hasOwner(),
      costVisible: authService.isCostVisible(),
      installId: authService.getInstallId(),
    },
  }));
  ipcMain.handle("auth:login", async (event, username, password) => {
    const r = authService.login(username, password);
    return r.ok ? { success: true } : { success: false, error: "Wrong username or password" };
  });
  ipcMain.handle("vendor:provision", async (event, data) => {
    try {
      require("../services/vendorService").provision(data);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  const expenseService = require("../services/expenseService");
  const wrap = (fn) => async (event, ...args) => {
    try {
      return { success: true, data: await fn(...args) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };
  ipcMain.handle("reports:ageing", wrap((opts) => require("../services/ageingService").report(opts || {})));

  const importService = require("../services/importService");
  ipcMain.handle("import:customers", wrap((rows, dryRun) => importService.customers(rows, { dryRun: !!dryRun })));
  ipcMain.handle("import:suppliers", wrap((rows, dryRun) => importService.suppliers(rows, { dryRun: !!dryRun })));

  // Profit by product exposes purchase prices, so it needs the super-password unlock like profit on the dashboard.
  ipcMain.handle("reports:profitByProduct", requireCostVisible(authService, wrap((range) => require("../services/profitService").byProduct(range || {}))));

  // Dealer modules: service jobs, trade-ins, instalment plans
  const serviceJobs = require("../services/serviceJobService");
  const tradeInService = require("../services/tradeInService");
  const instalmentService = require("../services/instalmentService");
  ipcMain.handle("service:list", wrap((f) => serviceJobs.list(f || {})));
  ipcMain.handle("service:add", wrap((d) => serviceJobs.add(d || {})));
  ipcMain.handle("service:update", wrap((id, d) => serviceJobs.update(id, d || {})));
  ipcMain.handle("service:setStatus", wrap((id, status, o) => serviceJobs.setStatus(id, status, o || {})));
  ipcMain.handle("service:addPayment", wrap((id, d) => serviceJobs.addPayment(id, d || {})));
  ipcMain.handle("tradein:list", wrap(() => tradeInService.list()));
  ipcMain.handle("tradein:add", wrap((d) => tradeInService.add(d || {})));
  ipcMain.handle("instalment:due", wrap((o) => instalmentService.due(o || {})));
  ipcMain.handle("instalment:plans", wrap(() => instalmentService.plans()));
  ipcMain.handle("instalment:getPlan", wrap((saleId) => instalmentService.getPlan(saleId)));
  ipcMain.handle("instalment:candidates", wrap(() => instalmentService.candidates()));
  ipcMain.handle("instalment:create", wrap((d) => instalmentService.createPlan(d || {})));
  ipcMain.handle("instalment:cancel", wrap((saleId) => instalmentService.cancelPlan(saleId)));

  // Recycle Bin and day lock
  const recycleService = require("../services/recycleService");
  const dayLockService = require("../services/dayLockService");
  ipcMain.handle("recycle:list", wrap(() => recycleService.list()));
  ipcMain.handle("recycle:restore", wrap((id) => recycleService.restore(id)));
  ipcMain.handle("recycle:purge", wrap((id) => recycleService.purge(id)));
  ipcMain.handle("lock:get", wrap(() => ({ lockedBefore: dayLockService.get() })));
  ipcMain.handle("lock:set", requireSuper(authService, wrap((date) => dayLockService.set(date || null))));

  // Attention bell and system health
  const backupFiles = require("../services/backupFiles");
  const lastBackupAt = () => backupFiles.newestBackupTime(backupService.resolveBackupDir());
  ipcMain.handle("attention:get", wrap(() => require("../services/attentionService").get({
    lastBackupAt: lastBackupAt(), costVisible: authService.isCostVisible(),
    whatsapp: require("../services/whatsappLink").getLink().getStatus(),
    drive: require("../services/googleDriveService").getGoogleDriveService().status(),
  })));
  ipcMain.handle("health:get", wrap(() => require("../services/healthService").report({ version: app.getVersion(), dbPath: require("../config/appConfig").getDbPath(), lastBackupAt: lastBackupAt() })));

  // Lists & Setup: categories and locations the owner manages in Settings
  const listService = require("../services/listService");
  ipcMain.handle("lists:get", wrap((key, opts) => listService.list(key, opts || {})));
  ipcMain.handle("lists:add", wrap((key, name) => listService.add(key, name)));
  ipcMain.handle("lists:rename", wrap((id, name) => listService.rename(id, name)));
  ipcMain.handle("lists:merge", wrap((fromId, intoId) => listService.merge(fromId, intoId)));
  ipcMain.handle("lists:setActive", wrap((id, active) => listService.setActive(id, active)));
  ipcMain.handle("lists:remove", wrap((id) => listService.remove(id)));
  ipcMain.handle("lists:reorder", wrap((key, ids) => listService.reorder(key, ids)));
  ipcMain.handle("expense:add", wrap((d) => expenseService.add(d)));
  ipcMain.handle("expense:update", wrap((id, d) => expenseService.update(id, d)));
  ipcMain.handle("expense:delete", wrap((id) => expenseService.remove(id)));
  ipcMain.handle("expense:list", wrap((f) => expenseService.list(f)));
  ipcMain.handle("expense:totals", wrap((f) => expenseService.totals(f)));

  const supplierService = require("../services/supplierService");
  const cashBookService = require("../services/cashBookService");
  ipcMain.handle("supplier:list", wrap((f) => supplierService.list(f || {})));
  ipcMain.handle("supplier:get", wrap((id) => supplierService.get(id)));
  ipcMain.handle("supplier:add", wrap((d) => supplierService.add(d)));
  ipcMain.handle("supplier:update", wrap((id, d) => supplierService.update(id, d)));
  ipcMain.handle("supplier:delete", requireSuper(authService, wrap((id) => supplierService.remove(id))));
  ipcMain.handle("supplier:totals", wrap(() => supplierService.totals()));
  ipcMain.handle("supplier:statement", wrap((id, f) => supplierService.statement(id, f || {})));
  ipcMain.handle("supplier:addPurchase", wrap((d) => supplierService.addPurchase(d)));
  ipcMain.handle("supplier:addPayment", wrap((d) => supplierService.addPayment(d)));
  ipcMain.handle("supplier:updateEntry", requireSuper(authService, wrap((id, d) => supplierService.updateEntry(id, d))));
  ipcMain.handle("supplier:deleteEntry", requireSuper(authService, wrap((id) => supplierService.removeEntry(id))));
  ipcMain.handle("cashbook:get", requireCostVisible(authService, wrap((f) => cashBookService.get(f || {}))));
  const closingService = require("../services/dailyClosingService");
  ipcMain.handle("closing:preview", requireCostVisible(authService, wrap((date) => closingService.preview(date))));
  ipcMain.handle("closing:save", requireCostVisible(authService, wrap((d) => closingService.save(d || {}))));
  ipcMain.handle("closing:list", requireCostVisible(authService, wrap(() => closingService.list())));

  // Linked WhatsApp: status is pushed to every window, so nothing has to poll.
  const waLink = require("../services/whatsappLink").getLink();
  let tasks = null;
  waLink.onChange((status) => {
    const windows = BrowserWindow && BrowserWindow.getAllWindows ? BrowserWindow.getAllWindows() : [];
    windows.forEach((w) => { if (!w.isDestroyed()) w.webContents.send("wa:changed", status); });
    if (status.state === 'linked' && tasks) tasks.resumeAfterWhatsAppReconnect();
  });
  ipcMain.handle("wa:status", wrap(() => waLink.getStatus()));
  ipcMain.handle("wa:connect", async () => {
    try {
      return { success: true, data: await waLink.connect() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("wa:reconnect", async () => {
    try {
      return { success: true, data: await waLink.reconnect() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("wa:unlink", async () => {
    try {
      await waLink.unlink();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Persistent Task Center. Renderer submits prepared work; the main process
  // owns execution so navigation or closing a modal does not cancel it.
  tasks = require('../services/taskService').getTaskService();
  tasks.onChange((snapshot, jobId) => {
    const windows = BrowserWindow && BrowserWindow.getAllWindows ? BrowserWindow.getAllWindows() : [];
    windows.forEach((w) => { if (!w.isDestroyed()) w.webContents.send('tasks:changed', { jobId, task: jobId ? snapshot : null }); });
  });
  ipcMain.handle('tasks:list', wrap(() => tasks.list()));
  ipcMain.handle('tasks:get', wrap((id) => tasks.getJob(id)));
  ipcMain.handle('tasks:enqueueWhatsapp', wrap((title, items) => {
    if (!Array.isArray(items) || items.length === 0) throw new Error('There are no prepared messages to queue.');
    const prepared = items.map((item, i) => {
      const p = item && item.payload;
      if (!p || typeof p.html !== 'string' || p.html.length > 5_000_000) throw new Error(`Message ${i + 1} has invalid or oversized statement content.`);
      return {
        key: String(item.key ?? i),
        label: String(item.label || p.customerName || `Message ${i + 1}`),
        payload: {
          html: p.html,
          customerName: String(p.customerName || '').slice(0, 200),
          phone: String(p.phone || '').slice(0, 80),
          message: String(p.message || '').slice(0, 5000),
        },
      };
    });
    return tasks.enqueue({ kind: 'whatsapp.statement', lane: 'whatsapp', title: title || 'WhatsApp statements', items: prepared });
  }));
  ipcMain.handle('tasks:enqueueProductImport', async (event, rows) => {
    let consumed = false;
    try {
      if (!Array.isArray(rows) || !rows.length || rows.length > 10000) throw new Error('Choose between 1 and 10,000 valid product rows.');
      const prepared = rows.map((r, i) => {
        const product = {
          product_name: String(r.product_name || '').trim().slice(0, 200), category: String(r.category || 'Other').trim().slice(0, 100),
          model: String(r.model || '').trim().slice(0, 150), serial_number: String(r.serial_number || '').trim().slice(0, 150),
          supplier: String(r.supplier || '').trim().slice(0, 150), purchase_price: Number(r.purchase_price || 0), selling_price: Number(r.selling_price),
          quantity: Number(r.quantity || 1), purchase_date: String(r.purchase_date || '').slice(0, 20), warranty: String(r.warranty || '').slice(0, 100),
          storage_location: String(r.storage_location || '').slice(0, 150), notes: String(r.notes || '').slice(0, 1000), condition: String(r.condition || 'Excellent'), status: 'In Stock',
        };
        const errors = validateProduct(product);
        if (!Number.isFinite(product.purchase_price) || product.purchase_price < 0) errors.push('Purchase price must be zero or greater.');
        if (!Number.isFinite(product.selling_price) || product.selling_price < 0) errors.push('Sale price must be zero or greater.');
        if (!Number.isInteger(product.quantity) || product.quantity < 1) errors.push('Quantity must be a positive whole number.');
        if (product.purchase_date && !/^\d{4}-\d{2}-\d{2}$/.test(product.purchase_date)) errors.push('Purchase date must use YYYY-MM-DD.');
        if (errors.length) throw new Error(`Row ${i + 2}: ${errors.join('; ')}`);
        return { key: String(i + 2), label: `Row ${i + 2}: ${product.product_name}`, payload: product };
      });
      if (prepared.some((item) => item.payload.purchase_price > 0)) {
        if (!authService.consumeSuper()) return { success: false, error: 'SUPER_REQUIRED' };
        consumed = true;
      }
      const job = tasks.enqueue({ kind: 'product.import', lane: 'data', title: `Import ${prepared.length} products`, items: prepared });
      return { success: true, data: job };
    } catch (err) { if (consumed) authService.restoreSuper(); return { success: false, error: err.message }; }
  });
  ipcMain.handle('tasks:stop', wrap((id) => tasks.stop(id)));
  ipcMain.handle('tasks:resume', wrap((id) => tasks.resume(id)));
  ipcMain.handle('tasks:retryFailed', wrap((id) => tasks.retryFailed(id)));
  tasks.initialize();

  // Google Drive belongs to the logged-in owner. Credentials never cross IPC.
  const driveService = require('../services/googleDriveService').getGoogleDriveService();
  ipcMain.handle('drive:status', wrap(() => driveService.status()));
  ipcMain.handle('drive:connect', wrap(() => backupService.connectDrive()));
  ipcMain.handle('drive:disconnect', wrap(() => driveService.disconnect()));
  ipcMain.handle('drive:listBackups', wrap(() => driveService.listBackups()));
  ipcMain.handle('drive:downloadBackup', wrap((fileId) => driveService.downloadBackup(String(fileId || ''))));
  ipcMain.handle('drive:saveSettings', wrap((data) => {
    const clientId = String(data?.clientId || '').trim().slice(0, 300);
    const retention = Math.max(1, Math.min(365, Number(data?.retention) || 30));
    if (clientId && !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('Enter a valid Google OAuth desktop client ID.');
    if (driveService.status().connected && clientId !== driveService.clientId) throw new Error('Disconnect Google Drive before changing the OAuth client ID.');
    // An empty secret box means "keep the saved one"; the secret is never sent back to the screen.
    driveService.saveClientSecret(data?.clientSecret);
    settingsService.updateSettings({ google_drive_client_id: clientId, drive_backup_retention: String(retention) });
    return driveService.status();
  }));
  ipcMain.handle('drive:retryFailed', wrap(() => {
    return { retried: tasks.retryFailedCloudUploads({ force: true }) };
  }));

  ipcMain.handle("statement:autoSend", async (event, payload) => {
    try {
      return { success: true, data: await require("../services/statementShare").autoSend(payload) };
    } catch (err) {
      return { success: false, error: err.message, code: err.code || null };
    }
  });
  waLink.autoStart();

  ipcMain.handle("statement:share", async (event, payload) => {
    try {
      return { success: true, data: await require("../services/statementShare").exportAndShare(payload) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("auth:logout", async () => {
    authService.logout();
    return { success: true };
  });
  ipcMain.handle("auth:changePassword", async (event, current, next) => {
    try {
      authService.changePassword(current, next);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("auth:changeSuperPassword", async (event, current, next) => {
    try {
      authService.changeSuperPassword(current, next);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("auth:grantSuper", async (event, pw) =>
    authService.grantSuperOnce(pw)
      ? { success: true }
      : { success: false, error: "Wrong super-password" },
  );
  ipcMain.handle("auth:revealCost", async (event, pw) =>
    authService.revealCost(pw)
      ? { success: true }
      : { success: false, error: "Wrong super-password" },
  );
  ipcMain.handle("auth:revokeSuper", async () => {
    authService.revokeSuper();
    return { success: true };
  });
  ipcMain.handle("auth:hideCost", async () => {
    authService.hideCost();
    return { success: true };
  });

  // Dashboard
  ipcMain.handle("dashboard:getData", async (event, range) => {
    try {
      return {
        success: true,
        data: dashboardService.getDashboardData(range || {}, { costVisible: authService.isCostVisible() }),
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Inventory - List Products
  ipcMain.handle("inventory:getAll", async (event, filters) => {
    try {
      const result = inventoryService.getAllProducts(filters);
      return { success: true, data: stripCost(result, authService.isCostVisible()) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Inventory - Get Single Product
  ipcMain.handle("inventory:getById", async (event, id) => {
    try {
      const product = inventoryService.getProductById(id);
      // Editing needs the cost, and the owner just gave the super-password for it.
      const visible = authService.isCostVisible() || authService.isSuperPending();
      return { success: true, data: stripCost(product, visible) };
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
  ipcMain.handle("inventory:update", requireSuper(authService, async (event, id, productData) => {
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
  }));

  // Inventory - Delete Product
  ipcMain.handle("inventory:delete", requireSuper(authService, async (event, id) => {
    try {
      inventoryService.deleteProduct(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }));

  ipcMain.handle('inventory:bulkUpdate', requireSuper(authService, async (event, ids, change) => {
    try {
      const result = inventoryService.bulkUpdateProducts(ids, change);
      auditService.log('product.bulk_edit', 'product_batch', null, { count: result.updated, field: result.field });
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }));

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

  ipcMain.handle('backup:getAutomatic', wrap(() => backupService.getAutomaticBackups()));
  ipcMain.handle('backup:restoreAutomatic', async (event, filename) => {
    try {
      const result = backupService.restoreAutomaticBackup(filename);
      app.relaunch(); app.exit(0);
      return { success: true, data: result };
    } catch (err) { return { success: false, error: err.message }; }
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
      return { success: true, data: stripCost(ledgerService.getAllDamages(filters), authService.isCostVisible()) };
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

  // --- Delete Ledger Entry ---
  ipcMain.handle("ledger:deleteEntry", async (event, entryId) => {
    try {
      const result = ledgerService.deleteLedgerEntry(entryId);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ==================== NEW LEDGER SYSTEM IPC HANDLERS ====================

  // Customer Ledger
  ipcMain.handle("ledger:getCustomerLedger", async (event, customerId, filters) => {
    try {
      return { success: true, data: ledgerService.getCustomerLedger(customerId, filters) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("ledger:getCustomerLedgerSummary", async (event, customerId) => {
    try {
      return { success: true, data: ledgerService.getCustomerLedgerSummary(customerId) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("ledger:getCustomerLedgerReport", async () => {
    try {
      return { success: true, data: ledgerService.getCustomerLedgerReport() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Direct Ledger Payment (not tied to a specific sale)
  ipcMain.handle("ledger:addLedgerPayment", async (event, data) => {
    try {
      const result = ledgerService.addLedgerPayment(data);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Ledger Old Balance Entry
  ipcMain.handle("ledger:addLedgerOldBalance", async (event, data) => {
    try {
      const result = ledgerService.addLedgerOldBalance(data);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ==================== OLD BALANCE MODULE IPC HANDLERS ====================

  ipcMain.handle("oldBalance:getAll", async (event, filters) => {
    try {
      return { success: true, data: oldBalanceService.getAllOldBalances(filters) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("oldBalance:getById", async (event, id) => {
    try {
      return { success: true, data: oldBalanceService.getOldBalanceById(id) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("oldBalance:getByCustomer", async (event, customerId) => {
    try {
      return { success: true, data: oldBalanceService.getCustomerOldBalances(customerId) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("oldBalance:getCustomerTotal", async (event, customerId) => {
    try {
      return { success: true, data: oldBalanceService.getCustomerOldBalanceTotal(customerId) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("oldBalance:getSummary", async () => {
    try {
      return { success: true, data: oldBalanceService.getAllOldBalancesSummary() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("oldBalance:add", async (event, data) => {
    try {
      const result = oldBalanceService.addOldBalance(data);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("oldBalance:update", async (event, id, data) => {
    try {
      oldBalanceService.updateOldBalance(id, data);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("oldBalance:delete", async (event, id) => {
    try {
      oldBalanceService.deleteOldBalance(id);
      return { success: true };
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
    data.quantity === undefined ||
    data.quantity === null ||
    data.quantity < 0
  ) {
    errors.push("Quantity cannot be negative.");
  }
  return errors;
}

module.exports = { registerIpcHandlers };
