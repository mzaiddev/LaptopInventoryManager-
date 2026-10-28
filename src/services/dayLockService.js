const { getDatabase } = require("../database/dbInit");

// The lock itself is enforced by database triggers (migration 012); this only reads and moves the date.
class DayLockService {
  get() {
    const row = getDatabase().prepare("SELECT value FROM settings WHERE key = 'lock_before'").get();
    return row && row.value ? row.value : null;
  }

  // date = last locked day (YYYY-MM-DD), or null to unlock everything.
  set(date) {
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error("Lock date must be a valid date (YYYY-MM-DD)");
    getDatabase().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('lock_before', ?)").run(date || "");
    return { lockedBefore: date || null };
  }
}

module.exports = new DayLockService();
