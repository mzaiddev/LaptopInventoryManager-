const test = require("node:test");
const assert = require("node:assert");
const Database = require("better-sqlite3");
const { runMigrations } = require("../src/database/migrate");

const make = (version, sql) => ({ version, up: (db) => db.exec(sql) });

test("applies pending migrations in order, backing up before each", () => {
  const db = new Database(":memory:");
  const backups = [];
  const v = runMigrations(db, [make(1, "CREATE TABLE a(x)"), make(2, "CREATE TABLE b(x)")], {
    backupFn: (n) => backups.push(n),
  });
  assert.strictEqual(v, 2);
  assert.deepStrictEqual(backups, [1, 2]);
  assert.strictEqual(db.pragma("user_version", { simple: true }), 2);
});

test("second run is a no-op", () => {
  const db = new Database(":memory:");
  const migs = [make(1, "CREATE TABLE a(x)")];
  runMigrations(db, migs, { backupFn: () => {} });
  let calls = 0;
  runMigrations(db, migs, { backupFn: () => calls++ });
  assert.strictEqual(calls, 0);
});

test("failing migration rolls back and keeps the old version", () => {
  const db = new Database(":memory:");
  const bad = { version: 1, up: (d) => { d.exec("CREATE TABLE a(x)"); throw new Error("boom"); } };
  assert.throws(() => runMigrations(db, [bad], { backupFn: () => {} }), /boom/);
  assert.strictEqual(db.pragma("user_version", { simple: true }), 0);
  assert.strictEqual(db.prepare("SELECT name FROM sqlite_master WHERE name='a'").get(), undefined);
});
