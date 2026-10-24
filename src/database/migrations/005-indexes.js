module.exports = {
  version: 5,
  up(db) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sale_issues_customer_date ON sale_issues(customer_id, issue_date);
      CREATE INDEX IF NOT EXISTS idx_ledger_customer_date ON customer_ledger(customer_id, entry_date, id);
      CREATE INDEX IF NOT EXISTS idx_ledger_payment_direct ON customer_ledger(reference_type, reference_id);
    `);
  },
};
