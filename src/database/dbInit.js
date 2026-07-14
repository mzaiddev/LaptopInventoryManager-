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

  // Migrate returns table to add reference_no if missing
  migrateReturnsAddReferenceNo();

  // Remove damaged_quantity column (moved to damage_records table only)
  migrateRemoveDamagedQuantity();

  // Remove credit_limit and opening_balance from customers
  migrateRemoveCustomerFields();

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

    -- Customers table
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      email TEXT DEFAULT '',
      status TEXT DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      updated_at DATETIME DEFAULT (datetime('now','localtime'))
    );

    -- Ledgers table
    CREATE TABLE IF NOT EXISTS ledgers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      ledger_type TEXT NOT NULL CHECK(ledger_type IN ('Cash','Loan')),
      reference_no TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      description TEXT DEFAULT '',
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'Outstanding' CHECK(status IN ('Paid','Partial','Outstanding')),
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      updated_at DATETIME DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
    );

    -- Sale Issues table
    CREATE TABLE IF NOT EXISTS sale_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      ledger_id INTEGER,
      reference_no TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      transaction_type TEXT DEFAULT 'Sale' CHECK(transaction_type IN ('Sale','Issue')),
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      payment_status TEXT DEFAULT 'Outstanding' CHECK(payment_status IN ('Paid','Partial','Outstanding')),
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      updated_at DATETIME DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE SET NULL
    );

    -- Sale Issue Items table
    CREATE TABLE IF NOT EXISTS sale_issue_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_issue_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (sale_issue_id) REFERENCES sale_issues(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    );

    -- Ledger Payments table
    CREATE TABLE IF NOT EXISTS ledger_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledger_id INTEGER NOT NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT DEFAULT 'Cash' CHECK(payment_method IN ('Cash','Bank','Online','Other')),
      note TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE
    );

    -- Returns table
    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      sale_issue_id INTEGER,
      ledger_id INTEGER,
      reference_no TEXT NOT NULL,
      return_date TEXT NOT NULL,
      reason TEXT DEFAULT '',
      total_return_amount REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'Completed' CHECK(status IN ('Completed','Pending','Cancelled')),
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      updated_at DATETIME DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
      FOREIGN KEY (sale_issue_id) REFERENCES sale_issues(id) ON DELETE SET NULL,
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE SET NULL
    );

    -- Return Items table
    CREATE TABLE IF NOT EXISTS return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    );

    -- Damage Records table
    CREATE TABLE IF NOT EXISTS damage_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      damage_type TEXT DEFAULT 'Damaged' CHECK(damage_type IN ('Damaged','Disposed','Repaired','Corrected')),
      reason TEXT DEFAULT '',
      reference_no TEXT NOT NULL DEFAULT '',
      recorded_by TEXT DEFAULT '',
      recorded_date TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      updated_at DATETIME DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    );
  `);
}

function migrateReturnsAddReferenceNo() {
  try {
    const row = db.prepare("PRAGMA table_info(returns)").all();
    const hasRefNo = row.some((r) => r && r.name === "reference_no");
    if (hasRefNo) return;

    console.log('Migrating database: adding "reference_no" column to returns table');

    db.transaction(() => {
      db.pragma("foreign_keys = OFF");

      db.exec(`
        CREATE TABLE IF NOT EXISTS returns_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL,
          sale_issue_id INTEGER,
          ledger_id INTEGER,
          reference_no TEXT NOT NULL DEFAULT '',
          return_date TEXT NOT NULL,
          reason TEXT DEFAULT '',
          total_return_amount REAL NOT NULL DEFAULT 0,
          status TEXT DEFAULT 'Completed' CHECK(status IN ('Completed','Pending','Cancelled')),
          created_at DATETIME DEFAULT (datetime('now','localtime')),
          updated_at DATETIME DEFAULT (datetime('now','localtime')),
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
          FOREIGN KEY (sale_issue_id) REFERENCES sale_issues(id) ON DELETE SET NULL,
          FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE SET NULL
        );
      `);

      db.exec(`
        INSERT INTO returns_new (id, customer_id, sale_issue_id, ledger_id, reference_no, return_date, reason, total_return_amount, status, created_at, updated_at)
        SELECT id, customer_id, sale_issue_id, ledger_id, 'RET-MIGRATED-' || id, return_date, reason, total_return_amount, status, created_at, updated_at FROM returns;
      `);

      db.exec("DROP TABLE returns;");
      db.exec("ALTER TABLE returns_new RENAME TO returns;");

      db.pragma("foreign_keys = ON");
    })();

    console.log("Migration completed: reference_no added to returns table");
  } catch (err) {
    console.error("Error migrating returns table:", err);
  }
}
function migrateRemoveDamagedQuantity() {
  try {
    const row = db.prepare("PRAGMA table_info(products)").all();
    const hasColumn = row.some((r) => r && r.name === "damaged_quantity");
    if (!hasColumn) return;

    console.log('Migrating database: removing "damaged_quantity" column from products table');

    db.transaction(() => {
      db.pragma("foreign_keys = OFF");

      // Create new table without damaged_quantity
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

      // Copy data (skip damaged_quantity column)
      db.exec(`
        INSERT INTO products_new (id, product_name, category, model, serial_number, supplier, purchase_price, selling_price, quantity, purchase_date, warranty, storage_location, notes, status, condition, created_at, updated_at)
        SELECT id, product_name, category, model, serial_number, supplier, purchase_price, selling_price, quantity, purchase_date, warranty, storage_location, notes, status, condition, created_at, updated_at FROM products;
      `);

      db.exec("DROP TABLE products;");
      db.exec("ALTER TABLE products_new RENAME TO products;");

      db.pragma("foreign_keys = ON");
    })();

    console.log("Migration completed: damaged_quantity column removed from products");
  } catch (err) {
    console.error("Error migrating products table to remove damaged_quantity:", err);
  }
}

function migrateRemoveCustomerFields() {
  try {
    const row = db.prepare("PRAGMA table_info(customers)").all();
    const hasCreditLimit = row.some((r) => r && r.name === "credit_limit");
    const hasOpeningBalance = row.some((r) => r && r.name === "opening_balance");
    if (!hasCreditLimit && !hasOpeningBalance) return;

    console.log('Migrating database: removing credit_limit and opening_balance from customers table');

    db.transaction(() => {
      db.pragma("foreign_keys = OFF");

      db.exec(`
        CREATE TABLE IF NOT EXISTS customers_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_name TEXT NOT NULL,
          phone TEXT DEFAULT '',
          address TEXT DEFAULT '',
          email TEXT DEFAULT '',
          status TEXT DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
          notes TEXT DEFAULT '',
          created_at DATETIME DEFAULT (datetime('now','localtime')),
          updated_at DATETIME DEFAULT (datetime('now','localtime'))
        );
      `);

      db.exec(`
        INSERT INTO customers_new (id, customer_name, phone, address, email, status, notes, created_at, updated_at)
        SELECT id, customer_name, phone, address, email, status, notes, created_at, updated_at FROM customers;
      `);

      db.exec("DROP TABLE customers;");
      db.exec("ALTER TABLE customers_new RENAME TO customers;");

      db.pragma("foreign_keys = ON");
    })();

    console.log("Migration completed: credit_limit and opening_balance removed from customers");
  } catch (err) {
    console.error("Error migrating customers table:", err);
  }
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
    CREATE INDEX IF NOT EXISTS idx_products_serial ON products(serial_number);
    CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
    CREATE INDEX IF NOT EXISTS idx_products_condition ON products(condition);
    CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier);
    CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at);
    CREATE INDEX IF NOT EXISTS idx_inspection_product ON inspection_notes(product_id);
    CREATE INDEX IF NOT EXISTS idx_backup_created ON backup_history(created_at);

    -- Customer indexes
    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(customer_name);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);

    -- Ledger indexes
    CREATE INDEX IF NOT EXISTS idx_ledgers_customer ON ledgers(customer_id);
    CREATE INDEX IF NOT EXISTS idx_ledgers_reference ON ledgers(reference_no);
    CREATE INDEX IF NOT EXISTS idx_ledgers_status ON ledgers(status);
    CREATE INDEX IF NOT EXISTS idx_ledgers_date ON ledgers(transaction_date);

    -- Sale issue indexes
    CREATE INDEX IF NOT EXISTS idx_sale_issues_customer ON sale_issues(customer_id);
    CREATE INDEX IF NOT EXISTS idx_sale_issues_ledger ON sale_issues(ledger_id);
    CREATE INDEX IF NOT EXISTS idx_sale_issues_reference ON sale_issues(reference_no);
    CREATE INDEX IF NOT EXISTS idx_sale_issues_date ON sale_issues(issue_date);
    CREATE INDEX IF NOT EXISTS idx_sale_issues_status ON sale_issues(payment_status);

    -- Sale issue items indexes
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_issue_items(sale_issue_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_issue_items(product_id);

    -- Payment indexes
    CREATE INDEX IF NOT EXISTS idx_payments_ledger ON ledger_payments(ledger_id);
    CREATE INDEX IF NOT EXISTS idx_payments_date ON ledger_payments(payment_date);

    -- Return indexes
    CREATE INDEX IF NOT EXISTS idx_returns_customer ON returns(customer_id);
    CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns(sale_issue_id);
    CREATE INDEX IF NOT EXISTS idx_returns_date ON returns(return_date);

    -- Return items indexes
    CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);
    CREATE INDEX IF NOT EXISTS idx_return_items_product ON return_items(product_id);

    -- Damage record indexes
    CREATE INDEX IF NOT EXISTS idx_damage_records_product ON damage_records(product_id);
    CREATE INDEX IF NOT EXISTS idx_damage_records_date ON damage_records(recorded_date);
    CREATE INDEX IF NOT EXISTS idx_damage_records_type ON damage_records(damage_type);
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