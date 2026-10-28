// Service jobs, trade-ins and instalment plans (the dealer modules).
module.exports = {
  version: 13,
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS service_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_no TEXT NOT NULL UNIQUE,
        customer_id INTEGER NOT NULL,
        device TEXT NOT NULL,
        serial_number TEXT NOT NULL DEFAULT '',
        fault TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Received' CHECK(status IN ('Received','Repairing','Ready','Delivered','Cancelled')),
        charge REAL NOT NULL DEFAULT 0 CHECK(charge >= 0),
        paid REAL NOT NULL DEFAULT 0,
        billed INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        received_date TEXT NOT NULL,
        ready_date TEXT,
        delivered_date TEXT,
        created_at DATETIME DEFAULT (datetime('now','localtime')),
        updated_at DATETIME DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_service_jobs_status ON service_jobs(status);

      CREATE TABLE IF NOT EXISTS trade_ins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        product_id INTEGER,
        product_name TEXT NOT NULL,
        value REAL NOT NULL CHECK(value > 0),
        settlement TEXT NOT NULL CHECK(settlement IN ('credit','cash','bank')),
        trade_date TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at DATETIME DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS instalment_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_issue_id INTEGER NOT NULL UNIQUE,
        base_paid REAL NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (sale_issue_id) REFERENCES sale_issues(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS instalments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        due_date TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount > 0),
        FOREIGN KEY (plan_id) REFERENCES instalment_plans(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_instalments_due ON instalments(due_date);
    `);
  },
};
