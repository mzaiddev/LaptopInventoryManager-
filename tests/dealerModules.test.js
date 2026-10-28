const test = require("node:test");
const assert = require("node:assert");
const { freshDb, addCustomer } = require("./helpers");
const service = require("../src/services/serviceJobService");
const tradeIns = require("../src/services/tradeInService");
const instalments = require("../src/services/instalmentService");
const cashBook = require("../src/services/cashBookService");

function db() {
  return require("../src/database/dbInit").getDatabase();
}

const balance = (customer) => (db().prepare("SELECT running_balance b FROM customer_ledger WHERE customer_id = ? ORDER BY id DESC LIMIT 1").get(customer) || { b: 0 }).b;

// ---------------- service jobs ----------------

test("a service job gets a number, starts as Received, and walks forward to Delivered", () => {
  freshDb();
  const c = addCustomer("Ali");
  const { id, job_no } = service.add({ customer_id: c, device: "Dell 5420", fault: "No display", charge: 3000, received_date: "2026-10-20" });
  assert.match(job_no, /^SRV-20261020-0001$/);
  assert.strictEqual(service.get(id).status, "Received");
  service.setStatus(id, "Repairing");
  service.setStatus(id, "Ready", { date: "2026-10-22" });
  assert.strictEqual(service.get(id).ready_date, "2026-10-22");
  service.setStatus(id, "Delivered", { date: "2026-10-23" });
  assert.strictEqual(service.get(id).status, "Delivered");
});

test("a job cannot skip steps or move after it is delivered", () => {
  freshDb();
  const c = addCustomer("Ali");
  const { id } = service.add({ customer_id: c, device: "HP", fault: "x", charge: 100, received_date: "2026-10-20" });
  assert.throws(() => service.setStatus(id, "Delivered"), /Ready/);
  service.setStatus(id, "Repairing");
  service.setStatus(id, "Ready");
  service.setStatus(id, "Delivered");
  assert.throws(() => service.setStatus(id, "Repairing"), /delivered/i);
});

test("delivering bills the charge once on the customer's account", () => {
  freshDb();
  const c = addCustomer("Ali");
  const { id } = service.add({ customer_id: c, device: "HP", fault: "x", charge: 3000, received_date: "2026-10-20" });
  service.setStatus(id, "Repairing");
  service.setStatus(id, "Ready");
  assert.strictEqual(balance(c), 0);
  service.setStatus(id, "Delivered", { date: "2026-10-23" });
  assert.strictEqual(balance(c), 3000);
  assert.strictEqual(service.get(id).billed, 1);
  assert.throws(() => service.update(id, { charge: 1 }), /billed|delivered/i);
});

test("a payment on a job lands in the cash book and the customer's account", () => {
  freshDb();
  const c = addCustomer("Ali");
  const { id } = service.add({ customer_id: c, device: "HP", fault: "x", charge: 3000, received_date: "2026-10-20" });
  service.addPayment(id, { amount: 1000, payment_method: "Cash", payment_date: "2026-10-20" });
  assert.strictEqual(service.get(id).paid, 1000);
  assert.strictEqual(balance(c), -1000);
  assert.strictEqual(cashBook.get({}).totals.cashIn, 1000);
  assert.throws(() => service.addPayment(id, { amount: 0, payment_method: "Cash", payment_date: "2026-10-20" }), /amount/i);
});

test("service jobs can be filtered by status and searched", () => {
  freshDb();
  const c = addCustomer("Ali");
  const a = service.add({ customer_id: c, device: "Dell XPS", fault: "Screen", charge: 1, received_date: "2026-10-20" }).id;
  service.add({ customer_id: c, device: "HP Pavilion", fault: "Fan", charge: 1, received_date: "2026-10-21" });
  service.setStatus(a, "Repairing");
  assert.strictEqual(service.list({ status: "Repairing" }).length, 1);
  assert.strictEqual(service.list({ search: "pavilion" }).length, 1);
  assert.strictEqual(service.list({}).length, 2);
});

// ---------------- trade-ins ----------------

test("a trade-in settled as credit adds the used laptop to stock and reduces what the customer owes", () => {
  freshDb();
  const c = addCustomer("Ali");
  db().prepare("INSERT INTO customer_ledger (customer_id, reference_type, debit, running_balance, entry_date) VALUES (?, 'Sale', 500, 500, '2026-10-01')").run(c);
  const r = tradeIns.add({ customer_id: c, product_name: "Old ThinkPad", category: "Laptop", serial_number: "TP-1", condition: "Fair", value: 200, settlement: "credit", trade_date: "2026-10-20" });
  const p = db().prepare("SELECT * FROM products WHERE id = ?").get(r.product_id);
  assert.strictEqual(p.purchase_price, 200);
  assert.strictEqual(p.quantity, 1);
  assert.strictEqual(p.condition, "Fair");
  assert.strictEqual(balance(c), 300);
});

test("a trade-in paid in cash records the money going out as a supplier payment", () => {
  freshDb();
  db().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('opening_cash', '1000')").run();
  const c = addCustomer("Ali");
  const r = tradeIns.add({ customer_id: c, product_name: "Old Mac", category: "Laptop", value: 400, settlement: "cash", trade_date: "2026-10-20" });
  assert.ok(r.product_id);
  assert.strictEqual(cashBook.get({}).closingCash, 600);
  assert.strictEqual(balance(c), 0);
});

test("a trade-in refuses a missing value, a duplicate serial, or a cash payout the drawer cannot cover", () => {
  freshDb();
  const c = addCustomer("Ali");
  assert.throws(() => tradeIns.add({ customer_id: c, product_name: "X", category: "Laptop", value: 0, settlement: "credit", trade_date: "2026-10-20" }), /value/i);
  tradeIns.add({ customer_id: c, product_name: "A", category: "Laptop", serial_number: "S1", value: 10, settlement: "credit", trade_date: "2026-10-20" });
  assert.throws(() => tradeIns.add({ customer_id: c, product_name: "B", category: "Laptop", serial_number: "S1", value: 10, settlement: "credit", trade_date: "2026-10-20" }), /serial/i);
  assert.throws(() => tradeIns.add({ customer_id: c, product_name: "C", category: "Laptop", value: 5000, settlement: "cash", trade_date: "2026-10-20" }), /cash/i);
});

// ---------------- instalments ----------------

function loanSale(customer, total, paid, date = "2026-10-01") {
  return Number(db().prepare("INSERT INTO sale_issues (customer_id, reference_no, issue_date, total_amount, paid_amount, remaining_amount, ledger_type) VALUES (?, ?, ?, ?, ?, ?, 'Loan')")
    .run(customer, "S-" + Math.random(), date, total, paid, total - paid).lastInsertRowid);
}

test("a plan splits what is left into equal parts on regular dates, the last part absorbing rounding", () => {
  freshDb();
  const c = addCustomer("Ali");
  const sale = loanSale(c, 1000, 100);
  const plan = instalments.createPlan({ sale_issue_id: sale, count: 3, first_due_date: "2026-11-01", interval_days: 30 });
  assert.deepStrictEqual(plan.items.map((i) => i.amount), [300, 300, 300]);
  assert.deepStrictEqual(plan.items.map((i) => i.due_date), ["2026-11-01", "2026-12-01", "2026-12-31"]);
  const odd = loanSale(c, 100, 0);
  const p2 = instalments.createPlan({ sale_issue_id: odd, count: 3, first_due_date: "2026-11-01" });
  assert.strictEqual(p2.items.reduce((s, i) => s + i.amount, 0), 100);
  assert.strictEqual(p2.items[2].amount, 33.34);
});

test("a plan needs an unpaid sale, a sensible count, and only one plan per sale", () => {
  freshDb();
  const c = addCustomer("Ali");
  const paid = loanSale(c, 100, 100);
  assert.throws(() => instalments.createPlan({ sale_issue_id: paid, count: 2, first_due_date: "2026-11-01" }), /nothing|remaining/i);
  const sale = loanSale(c, 100, 0);
  assert.throws(() => instalments.createPlan({ sale_issue_id: sale, count: 0, first_due_date: "2026-11-01" }), /count/i);
  assert.throws(() => instalments.createPlan({ sale_issue_id: sale, count: 2, first_due_date: "bad" }), /date/i);
  instalments.createPlan({ sale_issue_id: sale, count: 2, first_due_date: "2026-11-01" });
  assert.throws(() => instalments.createPlan({ sale_issue_id: sale, count: 2, first_due_date: "2026-11-01" }), /already/i);
});

test("payments after the plan was made mark instalments paid in order, and late ones are overdue", () => {
  freshDb();
  const c = addCustomer("Ali");
  const sale = loanSale(c, 900, 0);
  instalments.createPlan({ sale_issue_id: sale, count: 3, first_due_date: "2026-10-10", interval_days: 10 });
  db().prepare("UPDATE sale_issues SET paid_amount = 450, remaining_amount = 450 WHERE id = ?").run(sale);
  const early = instalments.getPlan(sale, { asOf: "2026-10-15" }).items;
  assert.deepStrictEqual(early.map((i) => i.status), ["Paid", "Partial", "Pending"]);
  const late = instalments.getPlan(sale, { asOf: "2026-11-05" }).items;
  assert.deepStrictEqual(late.map((i) => i.status), ["Paid", "Overdue", "Overdue"]);
  assert.strictEqual(late[1].balance, 150);
});

test("due lists overdue instalments and those coming up, skipping paid ones", () => {
  freshDb();
  const c = addCustomer("Ali");
  const sale = loanSale(c, 600, 0);
  instalments.createPlan({ sale_issue_id: sale, count: 3, first_due_date: "2026-10-01", interval_days: 10 });
  const d = instalments.due({ asOf: "2026-10-12", withinDays: 10 });
  assert.deepStrictEqual(d.map((i) => i.status), ["Overdue", "Overdue", "Due soon"]);
  assert.strictEqual(d[0].customer_name, "Ali");
  assert.strictEqual(instalments.overdueCount({ asOf: "2026-10-12" }), 2);
});
