const test = require("node:test");
const assert = require("node:assert");
const { freshDb } = require("./helpers");
const closing = require("../src/services/dailyClosingService");

function db() {
  return require("../src/database/dbInit").getDatabase();
}

const DAY = "2026-10-20";

function fixture() {
  freshDb();
  db().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('opening_cash', '1000')").run();
  const c = Number(db().prepare("INSERT INTO customers (customer_name) VALUES ('Ali')").run().lastInsertRowid);
  db().prepare("INSERT INTO expenses (expense_date, category, amount, payment_source) VALUES ('2026-10-19', 'Rent', 50, 'Cash')").run();
  db().prepare("INSERT INTO expenses (expense_date, category, amount, payment_source) VALUES (?, 'Tea', 150, 'Cash')").run(DAY);
  db().prepare("INSERT INTO expenses (expense_date, category, amount, payment_source) VALUES (?, 'Bank fee', 30, 'Bank')").run(DAY);
  db().prepare("INSERT INTO customer_ledger (customer_id, reference_type, debit, credit, running_balance, entry_date, payment_method) VALUES (?, 'Payment', 0, 400, -400, ?, 'Cash')").run(c, DAY);
  db().prepare("INSERT INTO sale_issues (customer_id, reference_no, issue_date, total_amount, paid_amount, remaining_amount) VALUES (?, 'S-1', ?, 900, 400, 500)").run(c, DAY);
}

test("preview works out what should be in the drawer at the end of the day", () => {
  fixture();
  const p = closing.preview(DAY);
  assert.strictEqual(p.openingCash, 950);
  assert.strictEqual(p.cashIn, 400);
  assert.strictEqual(p.cashOut, 150);
  assert.strictEqual(p.expectedCash, 1200);
  assert.strictEqual(p.bankOut, 30);
  assert.strictEqual(p.salesCount, 1);
  assert.strictEqual(p.salesTotal, 900);
  assert.strictEqual(p.closing, null);
});

test("closing the day records the count and the difference, and re-closing replaces it", () => {
  fixture();
  const first = closing.save({ date: DAY, countedCash: 1190, note: "Short 10" });
  assert.strictEqual(first.expectedCash, 1200);
  assert.strictEqual(first.difference, -10);
  const again = closing.save({ date: DAY, countedCash: 1200 });
  assert.strictEqual(again.difference, 0);
  assert.strictEqual(closing.list().length, 1);
  assert.strictEqual(closing.preview(DAY).closing.counted_cash, 1200);
});

test("closing refuses a bad date or a count that is not a number", () => {
  fixture();
  assert.throws(() => closing.save({ date: "20-10-2026", countedCash: 5 }), /date/i);
  assert.throws(() => closing.save({ date: DAY, countedCash: "abc" }), /count/i);
  assert.throws(() => closing.save({ date: DAY, countedCash: -1 }), /count/i);
});

test("a closing keeps the figures it was made with even if entries change later", () => {
  fixture();
  closing.save({ date: DAY, countedCash: 1200 });
  db().prepare("INSERT INTO expenses (expense_date, category, amount, payment_source) VALUES (?, 'Late', 100, 'Cash')").run(DAY);
  const saved = closing.list()[0];
  assert.strictEqual(saved.expected_cash, 1200);
  assert.strictEqual(closing.preview(DAY).expectedCash, 1100);
});
