module.exports = {
  version: 7,
  up(db) {
    // A bill made automatically when a product is added carries the product it came from and the quantity billed.
    db.exec(`
      ALTER TABLE supplier_ledger ADD COLUMN product_id INTEGER;
      ALTER TABLE supplier_ledger ADD COLUMN product_qty INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_supplier_ledger_product ON supplier_ledger(product_id);
    `);
  },
};
