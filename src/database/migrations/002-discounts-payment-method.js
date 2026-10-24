const hasColumn = (db, table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
const addColumn = (db, table, col, ddl) => {
  if (!hasColumn(db, table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
};

module.exports = {
  version: 2,
  up(db) {
    addColumn(db, "sale_issues", "discount_type", "TEXT NOT NULL DEFAULT 'none'");
    addColumn(db, "sale_issues", "discount_value", "REAL NOT NULL DEFAULT 0");
    addColumn(db, "sale_issues", "discount_amount", "REAL NOT NULL DEFAULT 0");
    addColumn(db, "sale_issue_items", "discount_amount", "REAL NOT NULL DEFAULT 0");
    // Direct (not tied to a sale) payments need Cash/Bank for the cash-in-hand figure.
    addColumn(db, "customer_ledger", "payment_method", "TEXT");
    db.exec(`
      UPDATE customer_ledger
      SET payment_method = CASE WHEN description LIKE '%- Bank%' THEN 'Bank' ELSE 'Cash' END
      WHERE reference_type = 'Payment' AND reference_id IS NULL AND payment_method IS NULL
    `);
    // Existing update code writes payments.updated_at; the column never existed.
    addColumn(db, "payments", "updated_at", "DATETIME");
  },
};
