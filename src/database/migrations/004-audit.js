module.exports = {
  version: 4,
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at DATETIME DEFAULT (datetime('now','localtime')),
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id INTEGER,
        detail TEXT
      );
    `);
  },
};
