const test = require("node:test");
const assert = require("node:assert");
const { freshDb } = require("./helpers");
const ageing = require("../src/services/ageingService");

function db() {
  return require("../src/database/dbInit").getDatabase();
}

function customer(name) {
  return Number(db().prepare("INSERT INTO customers (customer_name) VALUES (?)").run(name).lastInsertRowid);
}

// daysBefore: how many days before 2026-10-31 the entry was made
function entry(customerId, type, debit, credit, daysBefore) {
  const d = new Date("2026-10-31T00:00:00");
  d.setDate(d.getDate() - daysBefore);
  const date = d.toLocaleDateString("sv-SE");
  const last = db().prepare("SELECT running_balance b FROM customer_ledger WHERE customer_id = ? ORDER BY id DESC LIMIT 1").get(customerId);
  const balance = (last ? last.b : 0) + debit - credit;
  db().prepare("INSERT INTO customer_ledger (customer_id, reference_type, debit, credit, running_balance, entry_date) VALUES (?, ?, ?, ?, ?, ?)")
    .run(customerId, type, debit, credit, balance, date);
}

const AS_OF = "2026-10-31";

test("payments clear the oldest charges first and the rest is aged by its charge date", () => {
  freshDb();
  const a = customer("Ali");
  entry(a, "Sale", 100, 0, 100);
  entry(a, "Sale", 200, 0, 40);
  entry(a, "Payment", 0, 150, 10);
  const r = ageing.report({ asOf: AS_OF });
  const row = r.rows.find((x) => x.customer_id === a);
  assert.strictEqual(row.total, 150);
  assert.deepStrictEqual(row.buckets, { current: 0, d31_60: 150, d61_90: 0, d90_plus: 0 });
});

test("recent charges land in the first bucket and old balances in the last", () => {
  freshDb();
  const a = customer("Recent");
  const b = customer("Old");
  entry(a, "Sale", 50, 0, 5);
  entry(b, "OldBalanceDebit", 300, 0, 120);
  const r = ageing.report({ asOf: AS_OF });
  assert.deepStrictEqual(r.rows.find((x) => x.customer_id === a).buckets.current, 50);
  assert.deepStrictEqual(r.rows.find((x) => x.customer_id === b).buckets.d90_plus, 300);
});

test("settled customers and customers with a credit balance are left out", () => {
  freshDb();
  const paid = customer("Paid");
  const credit = customer("Credit");
  const due = customer("Due");
  entry(paid, "Sale", 100, 0, 20);
  entry(paid, "Payment", 0, 100, 10);
  entry(credit, "Sale", 100, 0, 20);
  entry(credit, "Return", 0, 160, 5);
  entry(due, "Sale", 10, 0, 1);
  const r = ageing.report({ asOf: AS_OF });
  assert.deepStrictEqual(r.rows.map((x) => x.customer_id), [due]);
});

test("rows are sorted by what is owed, and totals add up the rows", () => {
  freshDb();
  const small = customer("Small");
  const big = customer("Big");
  entry(small, "Sale", 10, 0, 50);
  entry(big, "Sale", 500, 0, 70);
  entry(big, "Sale", 100, 0, 3);
  const r = ageing.report({ asOf: AS_OF });
  assert.deepStrictEqual(r.rows.map((x) => x.customer_id), [big, small]);
  assert.strictEqual(r.totals.total, 610);
  assert.strictEqual(r.totals.buckets.d31_60, 10);
  assert.strictEqual(r.totals.buckets.d61_90, 500);
  assert.strictEqual(r.totals.buckets.current, 100);
  assert.strictEqual(r.rows.find((x) => x.customer_id === big).oldest_days, 70);
});

test("overdue counts customers with anything older than the grace days", () => {
  freshDb();
  const a = customer("A");
  const b = customer("B");
  entry(a, "Sale", 10, 0, 45);
  entry(b, "Sale", 10, 0, 10);
  assert.strictEqual(ageing.overdue({ asOf: AS_OF, graceDays: 30 }).customers, 1);
  assert.strictEqual(ageing.overdue({ asOf: AS_OF, graceDays: 30 }).amount, 10);
});
