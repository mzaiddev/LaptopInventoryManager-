const test = require("node:test");
const assert = require("node:assert");
const { freshDb } = require("./helpers");
const importer = require("../src/services/importService");

function db() {
  return require("../src/database/dbInit").getDatabase();
}

const count = (sql, ...a) => db().prepare(sql).get(...a).n;

test("customers import creates customers and turns an opening balance into an old balance", () => {
  freshDb();
  const r = importer.customers([
    { customer_name: "Ali Computers", phone: "0300-111", address: "Lahore", opening_balance: "1200", balance_type: "Debit" },
    { customer_name: "Bilal Traders", phone: "0321-222", opening_balance: "150", balance_type: "Credit" },
    { customer_name: "Walk-in" },
  ]);
  assert.strictEqual(r.created, 3);
  assert.strictEqual(r.skipped.length, 0);
  assert.strictEqual(count("SELECT COUNT(*) n FROM customers"), 3);
  const ali = db().prepare("SELECT id FROM customers WHERE customer_name = 'Ali Computers'").get().id;
  const ledger = db().prepare("SELECT debit, credit, running_balance FROM customer_ledger WHERE customer_id = ?").all(ali);
  assert.deepStrictEqual(ledger.map((l) => [l.debit, l.credit, l.running_balance]), [[1200, 0, 1200]]);
  const bilal = db().prepare("SELECT id FROM customers WHERE customer_name = 'Bilal Traders'").get().id;
  assert.strictEqual(db().prepare("SELECT running_balance b FROM customer_ledger WHERE customer_id = ?").get(bilal).b, -150);
});

test("a dry run reports what would happen and writes nothing", () => {
  freshDb();
  const r = importer.customers([{ customer_name: "Ali" }, { customer_name: "" }], { dryRun: true });
  assert.strictEqual(r.valid, 1);
  assert.strictEqual(r.created, 0);
  assert.strictEqual(r.skipped.length, 1);
  assert.strictEqual(count("SELECT COUNT(*) n FROM customers"), 0);
});

test("customers that cannot be imported are skipped with the row number and a reason", () => {
  freshDb();
  db().prepare("INSERT INTO customers (customer_name, phone) VALUES ('Existing', '0300')").run();
  const r = importer.customers([
    { customer_name: "" },
    { customer_name: "Bad Amount", opening_balance: "abc" },
    { customer_name: "Negative", opening_balance: "-5" },
    { customer_name: "Bad Type", opening_balance: "5", balance_type: "Maybe" },
    { customer_name: "existing", phone: "0300" },
    { customer_name: "Twice", phone: "1" },
    { customer_name: "Twice", phone: "1" },
    { customer_name: "Good" },
  ]);
  assert.strictEqual(r.created, 2);
  assert.deepStrictEqual(r.skipped.map((s) => s.row), [2, 3, 4, 5, 6, 8]);
  assert.match(r.skipped[0].reason, /name/i);
  assert.match(r.skipped[1].reason, /number/i);
  assert.match(r.skipped[4].reason, /already/i);
  assert.match(r.skipped[5].reason, /file/i);
});

test("the same name with a different phone is a different customer", () => {
  freshDb();
  db().prepare("INSERT INTO customers (customer_name, phone) VALUES ('Ali', '0300')").run();
  const r = importer.customers([{ customer_name: "Ali", phone: "0333" }]);
  assert.strictEqual(r.created, 1);
});

test("suppliers import creates suppliers with an opening balance and skips duplicates", () => {
  freshDb();
  const r = importer.suppliers([
    { name: "TechSource", phone: "0300", opening_balance: "1500" },
    { name: "PowerPlus" },
    { name: "techsource" },
    { name: "" },
    { name: "Bad", opening_balance: "x" },
  ]);
  assert.strictEqual(r.created, 2);
  assert.deepStrictEqual(r.skipped.map((s) => s.row), [4, 5, 6]);
  const id = db().prepare("SELECT id FROM suppliers WHERE name = 'TechSource'").get().id;
  assert.strictEqual(db().prepare("SELECT charge FROM supplier_ledger WHERE supplier_id = ? AND entry_type = 'Opening'").get(id).charge, 1500);
});

test("a very large import is refused", () => {
  freshDb();
  assert.throws(() => importer.customers(new Array(5001).fill({ customer_name: "x" })), /5,000/);
});
