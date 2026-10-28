// Managed lists (categories, locations) that used to be hardcoded or free text.
const PRODUCT_CATEGORIES = [
  "Laptop", "Charger", "Adapter", "Mouse", "Keyboard", "SSD", "HDD", "RAM", "Monitor",
  "Printer", "Router", "UPS", "Networking Equipment", "Accessories", "Other",
];
const EXPENSE_CATEGORIES = ["Rent", "Salary", "Electricity", "Transport", "Tea / Food", "Repairs", "Other"];

module.exports = {
  version: 9,
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS list_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        list_key TEXT NOT NULL,
        name TEXT NOT NULL COLLATE NOCASE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        created_at DATETIME DEFAULT (datetime('now','localtime')),
        UNIQUE(list_key, name)
      );
      CREATE INDEX IF NOT EXISTS idx_list_items_key ON list_items(list_key, sort_order);
    `);

    const insert = db.prepare("INSERT OR IGNORE INTO list_items (list_key, name, sort_order) VALUES (?, ?, ?)");
    PRODUCT_CATEGORIES.forEach((n, i) => insert.run("product_category", n, i));
    EXPENSE_CATEGORIES.forEach((n, i) => insert.run("expense_category", n, i));

    // Whatever the shop already typed becomes a list item, so nothing disappears from the pickers.
    db.exec(`
      INSERT OR IGNORE INTO list_items (list_key, name, sort_order)
        SELECT 'product_category', TRIM(category), 1000 FROM products WHERE TRIM(COALESCE(category,'')) <> '' GROUP BY LOWER(TRIM(category));
      INSERT OR IGNORE INTO list_items (list_key, name, sort_order)
        SELECT 'expense_category', TRIM(category), 1000 FROM expenses WHERE TRIM(COALESCE(category,'')) <> '' GROUP BY LOWER(TRIM(category));
      INSERT OR IGNORE INTO list_items (list_key, name, sort_order)
        SELECT 'storage_location', TRIM(storage_location), 1000 FROM products WHERE TRIM(COALESCE(storage_location,'')) <> '' GROUP BY LOWER(TRIM(storage_location));
    `);
  },
};
