const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { initDatabase, closeDatabase } = require('../database/dbInit');
const { registerIpcHandlers } = require('../ipc/ipcHandlers');
const { logError } = require('../utils/logger');

// One copy at a time: two windows on the same database file would corrupt data.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

process.on('uncaughtException', (err) => logError('uncaughtException', err));
process.on('unhandledRejection', (err) => logError('unhandledRejection', err));

let mainWindow = null;

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'reload', label: 'Reload' },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools', label: 'Developer Tools' }, { type: 'separator' }]),
        { role: 'resetZoom', label: 'Reset Zoom' },
        { role: 'zoomIn', label: 'Zoom In' },
        { role: 'zoomOut', label: 'Zoom Out' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toggle Fullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About',
              message: 'Laptop Inventory Manager',
              detail: 'Version 1.0.0\n\nProfessional Laptop & Computer Wholesale Inventory Management System\n\nBuilt with Electron.js & SQLite'
            });
          }
        }
      ]
    }
  ];

  // On macOS, add app menu
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Laptop Inventory Manager',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false,
    backgroundColor: '#f0f2f5'
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  if (!gotLock) return;

  // Initialize database
  let startupBackupPath = null;
  try {
    initDatabase();
    require('../services/recycleService').purgeOld(30);
    require('../services/authService').seedDefaultOwner();
    require('../services/authService').restoreSession();
    startupBackupPath = require('../services/backupService').runAutoBackup({ upload: false });
    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize database:', err);
    const { dialog } = require('electron');
    dialog.showErrorBox('Database Error', `Failed to initialize database: ${err.message}`);
    app.quit();
    return;
  }

  // Register IPC handlers
  registerIpcHandlers();

  // Task Center is ready first so the verified daily backup can safely enter its queue.
  if (startupBackupPath) require('../services/backupService').queueCloudBackup(startupBackupPath);
  const { net } = require('electron');
  const taskService = require('../services/taskService').getTaskService();
  const cloudRetry = setInterval(() => {
    try { if (net.isOnline()) taskService.retryFailedCloudUploads(); } catch (err) { console.error('Cloud backup retry check failed:', err.message); }
  }, 30000);
  if (cloudRetry.unref) cloudRetry.unref();

  // While the app stays open, refresh today's backup and upload it every few hours (Backup page > Automatic).
  let lastPeriodic = Date.now();
  const periodic = setInterval(() => {
    try {
      const cloud = require('../services/cloudBackupService');
      const hours = cloud.autoHours();
      if (!hours || !cloud.autoUpload() || !cloud.ready() || !net.isOnline()) return;
      if (Date.now() - lastPeriodic < hours * 3600 * 1000) return;
      lastPeriodic = Date.now();
      require('../services/backupService').runAutoBackup({ upload: true });
    } catch (err) { console.error('Scheduled backup failed:', err.message); }
  }, 10 * 60 * 1000);
  if (periodic.unref) periodic.unref();

  // Create menu and window
  createMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  require('../services/backupService').runAutoBackup({ upload: false });
  closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  try { require('../services/whatsappLink').getLink().shutdown(); } catch (e) { /* not linked */ }
  closeDatabase();
});
