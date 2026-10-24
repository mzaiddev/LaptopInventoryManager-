module.exports = {
  version: 3,
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expense_date TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount > 0),
        payment_source TEXT NOT NULL CHECK(payment_source IN ('Cash','Bank')),
        note TEXT NOT NULL DEFAULT '',
        created_at DATETIME DEFAULT (datetime('now','localtime'))
      );
      CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
    `);
  },
};
