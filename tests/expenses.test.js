const test = require("node:test");
const assert = require("node:assert");
const { freshDb } = require("./helpers");
const expenses = require("../src/services/expenseService");

const base = { expense_date: "2026-10-05", category: "Rent", amount: 5000, payment_source: "Cash" };

test("rejects amount <= 0, NaN, bad source, missing date/category", () => {
  freshDb();
  assert.throws(() => expenses.add({ ...base, amount: 0 }), /amount/i);
  assert.throws(() => expenses.add({ ...base, amount: -5 }), /amount/i);
  assert.throws(() => expenses.add({ ...base, amount: "abc" }), /amount/i);
  assert.throws(() => expenses.add({ ...base, payment_source: "Cheque" }), /cash or bank/i);
  assert.throws(() => expenses.add({ ...base, expense_date: "" }), /date/i);
  assert.throws(() => expenses.add({ ...base, category: "  " }), /category/i);
});

test("totals over a range equal the hand sum, split by source and category", () => {
  freshDb();
  expenses.add({ ...base });                                                        // 5000 cash rent
  expenses.add({ ...base, category: "Tea", amount: 250.5, expense_date: "2026-10-06" });  // cash
  expenses.add({ ...base, category: "Rent", amount: 700, payment_source: "Bank", expense_date: "2026-10-31" });
  expenses.add({ ...base, amount: 99999, expense_date: "2026-09-30" });             // outside
  const t = expenses.totals({ from: "2026-10-01", to: "2026-10-31" });
  assert.strictEqual(t.total, 5950.5);
  assert.strictEqual(t.cash, 5250.5);
  assert.strictEqual(t.bank, 700);
  assert.deepStrictEqual(t.byCategory, [
    { category: "Rent", amount: 5700 },
    { category: "Tea", amount: 250.5 },
  ]);
});

test("list filters by inclusive dates, searches, and paginates newest first", () => {
  freshDb();
  for (let i = 1; i <= 5; i++) expenses.add({ ...base, amount: i * 10, expense_date: `2026-10-0${i}`, note: i === 3 ? "generator fuel" : "" });
  const all = expenses.list({ from: "2026-10-02", to: "2026-10-04" });
  assert.deepStrictEqual(all.rows.map((r) => r.amount), [40, 30, 20]);
  assert.strictEqual(all.sum, 90);
  assert.strictEqual(expenses.list({ search: "fuel" }).rows.length, 1);
  const p = expenses.list({ page: 2, pageSize: 2 });
  assert.strictEqual(p.total, 5);
  assert.deepStrictEqual(p.rows.map((r) => r.amount), [30, 20]);
});

test("update and remove change what totals see", () => {
  freshDb();
  const { id } = expenses.add({ ...base });
  expenses.update(id, { ...base, amount: 100 });
  assert.strictEqual(expenses.totals({}).total, 100);
  expenses.remove(id);
  assert.strictEqual(expenses.totals({}).total, 0);
  assert.throws(() => expenses.remove(id), /not found/i);
});
