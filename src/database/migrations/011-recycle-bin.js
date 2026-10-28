// Deleted records wait here for 30 days so a mistake can be undone.
module.exports = {
  version: 11,
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS recycle_bin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,
        entity_id INTEGER,
        label TEXT NOT NULL DEFAULT '',
        data_json TEXT NOT NULL,
        deleted_at DATETIME NOT NULL DEFAULT (datetime('now','localtime'))
      );
      CREATE INDEX IF NOT EXISTS idx_recycle_bin_deleted ON recycle_bin(deleted_at);
    `);
  },
};
