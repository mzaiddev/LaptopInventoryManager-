const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { initDatabase, closeDatabase } = require("../src/database/dbInit");
const { tempDir } = require("./helpers");
const backup = require("../src/services/backupFiles");

const tmp = () => tempDir("lim-bk-");

function makeDb(file, productName = "A") {
  closeDatabase();
  const db = initDatabase(file);
  db.prepare("INSERT INTO products (product_name, category) VALUES (?, 'Laptop')").run(productName);
  db.pragma("wal_checkpoint(TRUNCATE)");
  closeDatabase();
}

test("verify accepts a real database copy", () => {
  const f = path.join(tmp(), "ok.db");
  makeDb(f);
  assert.deepStrictEqual(backup.verify(f), { ok: true });
});

test("verify rejects a text file renamed .db, a missing file, and a database without the app tables", () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, "fake.db"), "this is not sqlite");
  assert.strictEqual(backup.verify(path.join(d, "fake.db")).ok, false);
  assert.strictEqual(backup.verify(path.join(d, "missing.db")).ok, false);
  const Database = require("better-sqlite3");
  const other = new Database(path.join(d, "other.db"));
  other.exec("CREATE TABLE x(a)");
  other.close();
  assert.match(backup.verify(path.join(d, "other.db")).error, /not a Laptop Inventory/i);
});

test("restoring a bad file is refused and the current database is byte-identical", () => {
  const d = tmp();
  const live = path.join(d, "live.db");
  makeDb(live, "Current");
  const before = fs.readFileSync(live);
  fs.writeFileSync(path.join(d, "bad.db"), "garbage");
  assert.throws(() => backup.restoreFile(path.join(d, "bad.db"), live, path.join(d, "safety")), /not a valid/i);
  assert.deepStrictEqual(fs.readFileSync(live), before);
});

test("restore replaces the database, drops stale -wal/-shm files and keeps a safety copy", () => {
  const d = tmp();
  const live = path.join(d, "live.db");
  const old = path.join(d, "old.db");
  makeDb(live, "Current");
  makeDb(old, "FromBackup");
  fs.writeFileSync(live + "-wal", "stale");
  fs.writeFileSync(live + "-shm", "stale");
  const { safetyPath } = backup.restoreFile(old, live, path.join(d, "safety"));
  assert.ok(fs.existsSync(safetyPath));
  assert.ok(!fs.existsSync(live + "-wal") && !fs.existsSync(live + "-shm"));
  const db = initDatabase(live);
  assert.strictEqual(db.prepare("SELECT product_name n FROM products").get().n, "FromBackup");
  closeDatabase();
  const safe = initDatabase(safetyPath);
  assert.strictEqual(safe.prepare("SELECT product_name n FROM products").get().n, "Current");
  closeDatabase();
});

test("pruneOld keeps the newest N automatic backups and never touches other files", () => {
  const d = tmp();
  for (const day of ["01", "02", "03", "04"]) fs.writeFileSync(path.join(d, `auto-2026-10-${day}.db`), "x");
  fs.writeFileSync(path.join(d, "2026-07-10_23-27-41.db"), "manual");
  fs.writeFileSync(path.join(d, "pre-migration-v2-x.db"), "pre");
  assert.strictEqual(backup.pruneOld(d, 2), 2);
  assert.deepStrictEqual(fs.readdirSync(d).sort(), ["2026-07-10_23-27-41.db", "auto-2026-10-03.db", "auto-2026-10-04.db", "pre-migration-v2-x.db"]);
});

test("autoBackup writes one consistent file per day and can be repeated", () => {
  const d = tmp();
  const live = path.join(d, "live.db");
  closeDatabase();
  const db = initDatabase(live);
  db.prepare("INSERT INTO products (product_name, category) VALUES ('A','Laptop')").run();
  const out = path.join(d, "backups");
  const p1 = backup.autoBackup(db, out, new Date("2026-10-24T10:00:00"));
  db.prepare("INSERT INTO products (product_name, category) VALUES ('B','Laptop')").run();
  const p2 = backup.autoBackup(db, out, new Date("2026-10-24T18:00:00"));
  assert.strictEqual(p1, p2);
  assert.strictEqual(path.basename(p1), "auto-2026-10-24.db");
  assert.deepStrictEqual(backup.verify(p1), { ok: true });
  closeDatabase();
  const copy = initDatabase(p1);
  assert.strictEqual(copy.prepare("SELECT COUNT(*) c FROM products").get().c, 2);
  closeDatabase();
});
