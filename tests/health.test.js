const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { freshDb, tempDir } = require("./helpers");
const health = require("../src/services/healthService");
const backupFiles = require("../src/services/backupFiles");

function db() {
  return require("../src/database/dbInit").getDatabase();
}

test("health report gives counts, integrity result and the app version", () => {
  freshDb();
  db().prepare("INSERT INTO customers (customer_name) VALUES ('A')").run();
  db().prepare("INSERT INTO products (product_name, category, purchase_price, selling_price, quantity) VALUES ('P','Laptop',1,2,1)").run();
  const r = health.report({ version: "9.9.9" });
  assert.strictEqual(r.version, "9.9.9");
  assert.strictEqual(r.counts.customers, 1);
  assert.strictEqual(r.counts.products, 1);
  assert.strictEqual(r.integrity.ok, true);
  assert.strictEqual(r.integrity.problems, 0);
  assert.deepStrictEqual(r.tasks, { running: 0, failed: 0 });
});

test("health report shows the database file size and the last backup time it is given", () => {
  freshDb();
  const dir = tempDir();
  const file = path.join(dir, "inventory.db");
  fs.writeFileSync(file, Buffer.alloc(2048));
  const when = new Date("2026-10-30T08:00:00");
  const r = health.report({ dbPath: file, lastBackupAt: when });
  assert.strictEqual(r.dbSizeBytes, 2048);
  assert.strictEqual(new Date(r.lastBackupAt).getTime(), when.getTime());
});

test("newestBackupTime finds the most recent backup file, including the auto folder", () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, "auto"));
  const old = path.join(dir, "2026-10-01_10-00-00.db");
  const recent = path.join(dir, "auto", "auto-2026-10-30.db");
  fs.writeFileSync(old, "x");
  fs.writeFileSync(recent, "x");
  fs.utimesSync(old, new Date("2026-10-01T10:00:00"), new Date("2026-10-01T10:00:00"));
  fs.utimesSync(recent, new Date("2026-10-30T07:00:00"), new Date("2026-10-30T07:00:00"));
  fs.writeFileSync(path.join(dir, "notes.txt"), "ignore me");
  assert.strictEqual(backupFiles.newestBackupTime(dir).getTime(), new Date("2026-10-30T07:00:00").getTime());
  assert.strictEqual(backupFiles.newestBackupTime(path.join(dir, "missing")), null);
});
