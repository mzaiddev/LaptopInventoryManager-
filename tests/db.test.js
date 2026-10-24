const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { freshDb, closeDatabase } = require("./helpers");
const { initDatabase } = require("../src/database/dbInit");

test("initDatabase builds the schema in memory", () => {
  const db = freshDb();
  const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  for (const n of ["products", "customers", "sale_issues", "payments", "customer_ledger", "settings"]) {
    assert.ok(t.includes(n), n);
  }
});

test("opening an existing DB file twice keeps its rows", () => {
  closeDatabase();
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lim-")), "t.db");
  let db = initDatabase(f);
  db.prepare("INSERT INTO products (product_name, category) VALUES ('A','Laptop')").run();
  closeDatabase();
  db = initDatabase(f);
  assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM products").get().c, 1);
  closeDatabase();
});
