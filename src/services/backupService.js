const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { getDatabase } = require('../database/dbInit');
const { getDbPath, getBackupDir } = require('../config/appConfig');

class BackupService {
  async createBackup() {
    const db = getDatabase();
    const backupDir = getBackupDir();

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `${timestamp}.db`;
    const backupPath = path.join(backupDir, filename);

    try {
      await db.backup(backupPath);
      const stats = fs.statSync(backupPath);

      const stmt = db.prepare(
        'INSERT INTO backup_history (filename, filepath, file_size) VALUES (?, ?, ?)'
      );
      stmt.run(filename, backupPath, stats.size);

      return { success: true, filename, filepath: backupPath, fileSize: stats.size };
    } catch (err) {
      throw new Error(`Backup failed: ${err.message}`);
    }
  }

  restoreBackup(backupPath) {
    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found.');
    }

    const db = getDatabase();
    db.close();

    const dbPath = getDbPath();
    const tempDbPath = dbPath + '.tmp';

    try {
      fs.copyFileSync(backupPath, tempDbPath);
      fs.copyFileSync(tempDbPath, dbPath);
      fs.unlinkSync(tempDbPath);

      return { success: true, message: 'Database restored successfully. Restarting application...' };
    } catch (err) {
      if (fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
      throw new Error(`Restore failed: ${err.message}`);
    }
  }

  getBackupHistory() {
    const db = getDatabase();
    return db.prepare(
      'SELECT * FROM backup_history ORDER BY created_at DESC LIMIT 50'
    ).all();
  }

  deleteBackup(backupId) {
    const db = getDatabase();
    const backup = db.prepare('SELECT * FROM backup_history WHERE id = ?').get(backupId);
    if (backup) {
      try {
        if (fs.existsSync(backup.filepath)) {
          fs.unlinkSync(backup.filepath);
        }
      } catch (err) {
        // File may have been deleted externally, ignore
      }
      db.prepare('DELETE FROM backup_history WHERE id = ?').run(backupId);
    }
    return { success: true };
  }
}

module.exports = new BackupService();