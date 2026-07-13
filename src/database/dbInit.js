const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { getDbPath, getDataDir } = require("../config/appConfig");

let db = null;

function initDatabase() {
  const dbPath = getDbPath();
  const dataDir = getDataDir();

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // If the old schema had a 'brand' column, migrate to remove it
  migrateRemoveBrandIfNeeded();

  createTables();
  createIndexes();
  seedDefaults();

  return db;
}

function getDatabase() {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT NOT NULL,
      category TEXT NOT NULL,
      model TEXT DEFAULT '',
      serial_number TEXT DEFAULT '',
      supplier TEXT DEFAULT '',
      purchase_price REAL NOT NULL DEFAULT 0,
      selling_price REAL NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 1,
      purchase_date TEXT DEFAULT '',
      warranty TEXT DEFAULT '',
      storage_location TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'In Stock' CHECK(status IN ('In Stock','Reserved','Sold','Returned','Damaged','Lost')),
      condition TEXT DEFAULT 'Excellent' CHECK(condition IN ('Excellent','Good','Fair','Damaged','For Parts')),
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      updated_at DATETIME DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS inspection_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      note TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at DATETIME DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS backup_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now','localtime'))
    );
  `);
}

function migrateRemoveBrandIfNeeded() {
  try {
    const row = db.prepare("PRAGMA table_info(products)").all();
    const hasBrand = row.some((r) => r && r.name === "brand");
    if (!hasBrand) return;

    console.log(
      'Migrating database: removing deprecated "brand" column from products table',
    );

    db.transaction(() => {
      // Disable foreign keys during migration
      db.pragma("foreign_keys = OFF");

      // Create new table without brand
      db.exec(`
        CREATE TABLE IF NOT EXISTS products_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_name TEXT NOT NULL,
          category TEXT NOT NULL,
          model TEXT DEFAULT '',
          serial_number TEXT DEFAULT '',
          supplier TEXT DEFAULT '',
          purchase_price REAL NOT NULL DEFAULT 0,
          selling_price REAL NOT NULL DEFAULT 0,
          quantity INTEGER NOT NULL DEFAULT 1,
          purchase_date TEXT DEFAULT '',
          warranty TEXT DEFAULT '',
          storage_location TEXT DEFAULT '',
          notes TEXT DEFAULT '',
          status TEXT DEFAULT 'In Stock' CHECK(status IN ('In Stock','Reserved','Sold','Returned','Damaged','Lost')),
          condition TEXT DEFAULT 'Excellent' CHECK(condition IN ('Excellent','Good','Fair','Damaged','For Parts')),
          created_at DATETIME DEFAULT (datetime('now','localtime')),
          updated_at DATETIME DEFAULT (datetime('now','localtime'))
        );
      `);

      // Copy data from old table to new table (skip brand)
      db.exec(`
        INSERT INTO products_new (id, product_name, category, model, serial_number, supplier, purchase_price, selling_price, quantity, purchase_date, warranty, storage_location, notes, status, condition, created_at, updated_at)
        SELECT id, product_name, category, model, serial_number, supplier, purchase_price, selling_price, quantity, purchase_date, warranty, storage_location, notes, status, condition, created_at, updated_at FROM products;
      `);

      // Drop old table and rename
      db.exec("DROP TABLE products;");
      db.exec("ALTER TABLE products_new RENAME TO products;");

      // Re-enable foreign keys
      db.pragma("foreign_keys = ON");
    })();

    console.log("Migration completed: brand column removed");
  } catch (err) {
    console.error("Error migrating database to remove brand column:", err);
    // If migration fails, continue without throwing to avoid blocking app start
  }
}

function createIndexes() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(product_name);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    -- brand index removed
    CREATE INDEX IF NOT EXISTS idx_products_serial ON products(serial_number);
    CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
    CREATE INDEX IF NOT EXISTS idx_products_condition ON products(condition);
    CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier);
    CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at);
    CREATE INDEX IF NOT EXISTS idx_inspection_product ON inspection_notes(product_id);
    CREATE INDEX IF NOT EXISTS idx_backup_created ON backup_history(created_at);
  `);
}

function seedDefaults() {
  const defaultSettings = {
    shop_name: "My Laptop Shop",
    shop_address: "",
    phone_number: "",
    email: "",
    currency: "USD",
    backup_folder: "",
    theme: "light",
  };

  // brands removed from default settings

  const insertSetting = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  );

  const seedAll = db.transaction(() => {
    for (const [key, value] of Object.entries(defaultSettings)) {
      insertSetting.run(key, value);
    }
  });

  seedAll();
}

module.exports = {
  initDatabase,
  getDatabase,
  closeDatabase,
};
