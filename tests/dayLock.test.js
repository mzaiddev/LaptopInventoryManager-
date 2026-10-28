const test = require("node:test");
const assert = require("node:assert");
const { freshDb, addCustomer } = require("./helpers");
const lock = require("../src/services/dayLockService");

function db() {
  return require("../src/database/dbInit").getDatabase();
}

const expense = (date) => db().prepare("INSERT INTO expenses (expense_date, category, amount, payment_source) VALUES (?, 'Rent', 10, 'Cash')").run(date);

test("nothing is locked by default", () => {
  freshDb();
  assert.strictEqual(lock.get(), null);
  assert.doesNotThrow(() => expense("2020-01-01"));
});

test("a lock date refuses new entries on and before that day, and allows later days", () => {
  freshDb();
  lock.set("2026-10-20");
  assert.strictEqual(lock.get(), "2026-10-20");
  assert.throws(() => expense("2026-10-20"), /locked/i);
  assert.throws(() => expense("2026-10-01"), /locked/i);
  assert.doesNotThrow(() => expense("2026-10-21"));
});

test("a locked entry cannot be edited, moved into the locked period or deleted", () => {
  freshDb();
  const open = Number(expense("2026-10-25").lastInsertRowid);
  const old = Number(expense("2026-10-10").lastInsertRowid);
  lock.set("2026-10-20");
  assert.throws(() => db().prepare("UPDATE expenses SET amount = 99 WHERE id = ?").run(old), /locked/i);
  assert.throws(() => db().prepare("DELETE FROM expenses WHERE id = ?").run(old), /locked/i);
  assert.throws(() => db().prepare("UPDATE expenses SET expense_date = '2026-10-05' WHERE id = ?").run(open), /locked/i);
  assert.doesNotThrow(() => db().prepare("UPDATE expenses SET amount = 99 WHERE id = ?").run(open));
});

test("sales, payments, ledger entries and supplier entries in the locked period are refused too", () => {
  freshDb();
  const c = addCustomer("Ali");
  const s = Number(db().prepare("INSERT INTO suppliers (name) VALUES ('S')").run().lastInsertRowid);
  lock.set("2026-10-20");
  assert.throws(() => db().prepare("INSERT INTO sale_issues (customer_id, reference_no, issue_date, total_amount) VALUES (?, 'X', '2026-10-15', 10)").run(c), /locked/i);
  assert.throws(() => db().prepare("INSERT INTO customer_ledger (customer_id, reference_type, debit, running_balance, entry_date) VALUES (?, 'Sale', 10, 10, '2026-10-15')").run(c), /locked/i);
  assert.throws(() => db().prepare("INSERT INTO supplier_ledger (supplier_id, entry_date, entry_type, charge) VALUES (?, '2026-10-15', 'Purchase', 10)").run(s), /locked/i);
  const sale = Number(db().prepare("INSERT INTO sale_issues (customer_id, reference_no, issue_date, total_amount) VALUES (?, 'Y', '2026-10-22', 10)").run(c).lastInsertRowid);
  assert.throws(() => db().prepare("INSERT INTO payments (sale_issue_id, payment_date, amount) VALUES (?, '2026-10-18', 5)").run(sale), /locked/i);
  assert.doesNotThrow(() => db().prepare("INSERT INTO payments (sale_issue_id, payment_date, amount) VALUES (?, '2026-10-22', 5)").run(sale));
});

test("today's work on an old sale still goes through: paying it, or recomputing running balances", () => {
  freshDb();
  const c = addCustomer("Ali");
  const sale = Number(db().prepare("INSERT INTO sale_issues (customer_id, reference_no, issue_date, total_amount, remaining_amount) VALUES (?, 'Z', '2026-10-05', 100, 100)").run(c).lastInsertRowid);
  const led = Number(db().prepare("INSERT INTO customer_ledger (customer_id, reference_type, debit, running_balance, entry_date) VALUES (?, 'Sale', 100, 100, '2026-10-05')").run(c).lastInsertRowid);
  lock.set("2026-10-20");
  assert.doesNotThrow(() => db().prepare("UPDATE sale_issues SET paid_amount = 40, remaining_amount = 60, payment_status = 'Partial' WHERE id = ?").run(sale));
  assert.doesNotThrow(() => db().prepare("UPDATE customer_ledger SET running_balance = 100 WHERE id = ?").run(led));
});

test("clearing the lock allows old dates again, and a bad date is refused", () => {
  freshDb();
  lock.set("2026-10-20");
  lock.set(null);
  assert.strictEqual(lock.get(), null);
  assert.doesNotThrow(() => expense("2026-10-01"));
  assert.throws(() => lock.set("20/10/2026"), /date/i);
});
