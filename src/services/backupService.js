const fs = require('fs');
const path = require('path');
const { getDatabase, closeDatabase, initDatabase } = require('../database/dbInit');
const { getDbPath, getBackupDir } = require('../config/appConfig');
const backupFiles = require('./backupFiles');
const settingsService = require('./settingsService');

class BackupService {
  queueDriveBackup(backupPath) {
    const drive = require('./googleDriveService').getGoogleDriveService();
    if (!drive.status().connected) return null;
    const task = require('./taskService').getTaskService().enqueue({
      kind: 'drive.upload', lane: 'cloud', title: `Upload backup: ${path.basename(backupPath)}`,
      items: [{ key: path.basename(backupPath), label: path.basename(backupPath), payload: { filePath: backupPath } }],
    });
    return { taskId: task.id, status: task.status };
  }

  async connectDrive() {
    const result = await require('./googleDriveService').getGoogleDriveService().connect();
    const filePath = this.runAutoBackup({ upload: false });
    const task = filePath ? this.queueDriveBackup(filePath) : null;
    return { ...result, task };
  }
  // Settings > Backup Folder wins when set and usable; otherwise the default folder.
  resolveBackupDir() {
    const custom = (settingsService.getSetting('backup_folder') || '').trim();
    if (custom) {
      try {
        fs.mkdirSync(custom, { recursive: true });
        return custom;
      } catch (err) {
        console.error('Backup folder unusable, using default:', err.message);
      }
    }
    return getBackupDir();
  }

  async createBackup() {
    const db = getDatabase();
    const backupDir = this.resolveBackupDir();

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
      const verification = backupFiles.verify(backupPath);
      if (!verification.ok) throw new Error(`Backup verification failed: ${verification.error}`);
      const stats = fs.statSync(backupPath);

      const stmt = db.prepare(
        'INSERT INTO backup_history (filename, filepath, file_size) VALUES (?, ?, ?)'
      );
      stmt.run(filename, backupPath, stats.size);

      const cloud = this.queueDriveBackup(backupPath);
      return { success: true, filename, filepath: backupPath, fileSize: stats.size, cloud };
    } catch (err) {
      throw new Error(`Backup failed: ${err.message}`);
    }
  }

  // Daily file refreshed at start-up and on exit; the shop never depends on remembering to back up.
  runAutoBackup({ upload = true } = {}) {
    try {
      const filePath = backupFiles.autoBackup(getDatabase(), path.join(this.resolveBackupDir(), 'auto'));
      if (upload) this.queueDriveBackup(filePath);
      return filePath;
    } catch (err) {
      console.error('Automatic backup failed:', err.message);
      return null;
    }
  }

  // Checks the file BEFORE touching the live database, keeps a safety copy, and reopens the
  // old database if anything fails after it was closed.
  restoreBackup(backupPath) {
    const check = backupFiles.verify(backupPath);
    if (!check.ok) throw new Error(check.error);

    const dbPath = getDbPath();
    closeDatabase();
    try {
      const { safetyPath } = backupFiles.restoreFile(backupPath, dbPath, path.join(this.resolveBackupDir(), 'safety'));
      return { success: true, safetyPath, message: 'Database restored successfully. Restarting application...' };
    } catch (err) {
      initDatabase();
      throw new Error(`Restore failed: ${err.message}`);
    }
  }

  getBackupHistory() {
    const db = getDatabase();
    return db.prepare(
      'SELECT * FROM backup_history ORDER BY created_at DESC LIMIT 50'
    ).all().map((backup) => {
      const check = backupFiles.verify(backup.filepath);
      return { ...backup, verified: check.ok, verification_error: check.error || '' };
    });
  }

  getAutomaticBackups() {
    const dir = path.join(this.resolveBackupDir(), 'auto');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((name) => /^auto-\d{4}-\d{2}-\d{2}\.db$/.test(name)).sort().reverse().map((filename) => {
      const filepath = path.join(dir, filename);
      const stats = fs.statSync(filepath);
      const verification = backupFiles.verify(filepath);
      return { filename, file_size: stats.size, modified_at: stats.mtime.toISOString(), verified: verification.ok, error: verification.error || '' };
    });
  }

  restoreAutomaticBackup(filename) {
    if (!/^auto-\d{4}-\d{2}-\d{2}\.db$/.test(String(filename || ''))) throw new Error('Invalid automatic backup name.');
    return this.restoreBackup(path.join(this.resolveBackupDir(), 'auto', filename));
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
