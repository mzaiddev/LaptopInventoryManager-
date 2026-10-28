// Day lock: once the owner locks a day, entries dated on or before it cannot be added, changed or deleted.
// Enforced in the database so no screen or import can get around it. The lock date is the setting lock_before.
const MESSAGE = "This day is locked. Unlock it in Settings (super-password) to change it.";

// table, its date column, columns whose change counts as editing the entry, guard UPDATEs at all?
const GUARDS = [
  ["expenses", "expense_date", ["expense_date", "amount", "payment_source", "category"]],
  ["sale_issues", "issue_date", ["issue_date"]],
  ["payments", "payment_date", ["payment_date", "amount"]],
  ["customer_ledger", "entry_date", ["entry_date", "debit", "credit", "customer_id"]],
  ["supplier_ledger", "entry_date", ["entry_date", "charge", "paid", "supplier_id"]],
  ["returns", "return_date", ["return_date"]],
];

module.exports = {
  version: 12,
  up(db) {
    const locked = (expr) => `COALESCE((SELECT value FROM settings WHERE key = 'lock_before'), '') <> '' AND substr(${expr}, 1, 10) <= (SELECT value FROM settings WHERE key = 'lock_before')`;
    for (const [table, col, editCols] of GUARDS) {
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS lock_${table}_insert BEFORE INSERT ON ${table}
        WHEN ${locked("NEW." + col)} BEGIN SELECT RAISE(ABORT, '${MESSAGE}'); END;

        CREATE TRIGGER IF NOT EXISTS lock_${table}_delete BEFORE DELETE ON ${table}
        WHEN ${locked("OLD." + col)} BEGIN SELECT RAISE(ABORT, '${MESSAGE}'); END;

        CREATE TRIGGER IF NOT EXISTS lock_${table}_update_old BEFORE UPDATE OF ${editCols.join(", ")} ON ${table}
        WHEN ${locked("OLD." + col)} BEGIN SELECT RAISE(ABORT, '${MESSAGE}'); END;

        CREATE TRIGGER IF NOT EXISTS lock_${table}_update_new BEFORE UPDATE OF ${editCols.join(", ")} ON ${table}
        WHEN ${locked("NEW." + col)} BEGIN SELECT RAISE(ABORT, '${MESSAGE}'); END;
      `);
    }
  },
};
