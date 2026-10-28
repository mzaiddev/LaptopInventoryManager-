module.exports = {
  version: 6,
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        phone TEXT NOT NULL DEFAULT '',
        phone2 TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
        created_at DATETIME DEFAULT (datetime('now','localtime'))
      );

      -- What the shop owes each supplier. charge = we owe more, paid = we owe less.
      -- Balance = SUM(charge) - SUM(paid). A negative balance is an advance paid to the supplier.
      CREATE TABLE IF NOT EXISTS supplier_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        entry_date TEXT NOT NULL,
        entry_type TEXT NOT NULL CHECK(entry_type IN ('Opening','Purchase','Payment')),
        charge REAL NOT NULL DEFAULT 0 CHECK(charge >= 0),
        paid REAL NOT NULL DEFAULT 0 CHECK(paid >= 0),
        payment_source TEXT CHECK(payment_source IN ('Cash','Bank')),
        reference_no TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_at DATETIME DEFAULT (datetime('now','localtime')),
        CHECK(charge + paid > 0),
        CHECK(entry_type <> 'Payment' OR (paid > 0 AND payment_source IS NOT NULL)),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
      );
      CREATE INDEX IF NOT EXISTS idx_supplier_ledger_supplier ON supplier_ledger(supplier_id, entry_date, id);
      CREATE INDEX IF NOT EXISTS idx_supplier_ledger_payment ON supplier_ledger(entry_type, entry_date);

      -- Names already typed on products become supplier records (balance 0 until an opening amount is entered).
      INSERT OR IGNORE INTO suppliers (name)
        SELECT DISTINCT TRIM(supplier) FROM products WHERE TRIM(COALESCE(supplier,'')) <> '';
    `);
  },
};
