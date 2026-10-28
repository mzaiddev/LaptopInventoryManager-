const test = require("node:test");
const assert = require("node:assert");
const { freshDb } = require("./helpers");
const suppliers = require("../src/services/supplierService");

function db() {
  return require("../src/database/dbInit").getDatabase();
}

function supplier(name) {
  return Number(db().prepare("INSERT INTO suppliers (name) VALUES (?)").run(name).lastInsertRowid);
}

function bill(id, amount) {
  db().prepare("INSERT INTO supplier_ledger (supplier_id, entry_date, entry_type, charge) VALUES (?, '2026-10-01', 'Purchase', ?)").run(id, amount);
}

function pay(id, amount) {
  db().prepare("INSERT INTO supplier_ledger (supplier_id, entry_date, entry_type, paid, payment_source) VALUES (?, '2026-10-02', 'Payment', ?, 'Cash')").run(id, amount);
}

test("hasBalance lists suppliers we owe or have paid ahead, and hides the settled and untouched", () => {
  freshDb();
  const owed = supplier("Owed");
  const untouched = supplier("Untouched");
  const settled = supplier("Settled");
  const advance = supplier("Advance");
  bill(owed, 100);
  bill(settled, 100);
  pay(settled, 100);
  bill(advance, 50);
  pay(advance, 80);

  const names = (f) => suppliers.list(f).map((s) => s.name).sort();
  assert.deepStrictEqual(names({ hasBalance: true }), ["Advance", "Owed"]);
  assert.deepStrictEqual(names({}), ["Advance", "Owed", "Settled", "Untouched"]);
  assert.ok(untouched && settled);
});

test("hasBalance still honours the search text", () => {
  freshDb();
  const a = supplier("Alpha Traders");
  const b = supplier("Beta Traders");
  bill(a, 10);
  bill(b, 10);
  assert.deepStrictEqual(suppliers.list({ hasBalance: true, search: "Alpha" }).map((s) => s.name), ["Alpha Traders"]);
});
