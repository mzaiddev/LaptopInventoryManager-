const path = require('path');
const { app } = require('electron');

const APP_NAME = 'LaptopInventoryManager';
const DB_NAME = 'inventory.db';
const BACKUP_DIR = 'backups';

function getUserDataPath() {
  return path.join(app.getPath('appData'), APP_NAME);
}

function getDbPath() {
  return path.join(getUserDataPath(), 'data', DB_NAME);
}

function getBackupDir() {
  return path.join(getUserDataPath(), BACKUP_DIR);
}

function getDataDir() {
  return path.join(getUserDataPath(), 'data');
}

module.exports = {
  APP_NAME,
  DB_NAME,
  BACKUP_DIR,
  getUserDataPath,
  getDbPath,
  getBackupDir,
  getDataDir
};