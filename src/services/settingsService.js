const { getDatabase } = require("../database/dbInit");

class SettingsService {
  getAllSettings() {
    const db = getDatabase();
    const rows = db.prepare("SELECT * FROM settings").all();
    const settings = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  getSetting(key) {
    const db = getDatabase();
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : null;
  }

  updateSetting(key, value) {
    const db = getDatabase();
    db.prepare(
      "UPDATE settings SET value = ?, updated_at = datetime('now','localtime') WHERE key = ?",
    ).run(value, key);
    return { success: true };
  }

  updateSettings(settings) {
    const db = getDatabase();
    const stmt = db.prepare(
      "UPDATE settings SET value = ?, updated_at = datetime('now','localtime') WHERE key = ?",
    );

    const updateAll = db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        stmt.run(String(value), key);
      }
    });

    updateAll();
    return { success: true };
  }
}

module.exports = new SettingsService();
