// One row per closed day: what the drawer should hold, what was counted, and the difference.
module.exports = {
  version: 10,
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS day_closings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        closing_date TEXT NOT NULL UNIQUE,
        expected_cash REAL NOT NULL DEFAULT 0,
        counted_cash REAL NOT NULL DEFAULT 0,
        difference REAL NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        created_at DATETIME DEFAULT (datetime('now','localtime')),
        updated_at DATETIME DEFAULT (datetime('now','localtime'))
      );
    `);
  },
};
