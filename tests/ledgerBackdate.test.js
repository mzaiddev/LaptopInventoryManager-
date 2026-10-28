const test = require("node:test");
const assert = require("node:assert");
const { freshDb, addCustomer } = require("./helpers");
const ledger = require("../src/services/ledgerService");
const service = require("../src/services/serviceJobService");
const tradeIns = require("../src/services/tradeInService");
const integrity = require("../src/services/integrityService");

function db() {
  return require("../src/database/dbInit").getDatabase();
}

function sale(customer, amount, date) {
  db().prepare("INSERT INTO customer_ledger (customer_id, reference_type, debit, running_balance, entry_date) VALUES (?, 'Sale', ?, ?, ?)")
    .run(customer, amount, amount, date);
}

test("a payment dated before the latest entry still leaves the ledger balanced", () => {
  freshDb();
  const c = addCustomer("Ali");
  sale(c, 1000, "2026-10-29");
  ledger.addLedgerPayment({ customer_id: c, amount: 300, payment_method: "Cash", payment_date: "2026-10-28" });
  assert.deepStrictEqual(integrity.check().problems, []);
  const rows = db().prepare("SELECT running_balance b FROM customer_ledger WHERE customer_id = ? ORDER BY entry_date, id").all(c).map((r) => r.b);
  assert.deepStrictEqual(rows, [-300, 700]);
});

test("a service job delivered after a payment on an earlier date keeps the ledger balanced", () => {
  freshDb();
  const c = addCustomer("Ali");
  const { id } = service.add({ customer_id: c, device: "HP", fault: "x", charge: 1500, received_date: "2026-10-20" });
  service.setStatus(id, "Repairing");
  service.setStatus(id, "Ready");
  service.setStatus(id, "Delivered", { date: "2026-10-29" });
  service.addPayment(id, { amount: 500, payment_method: "Cash", payment_date: "2026-10-28" });
  assert.deepStrictEqual(integrity.check().problems, []);
});

test("a back-dated trade-in credit keeps the ledger balanced", () => {
  freshDb();
  const c = addCustomer("Ali");
  sale(c, 500, "2026-10-29");
  tradeIns.add({ customer_id: c, product_name: "Old", category: "Laptop", value: 100, settlement: "credit", trade_date: "2026-10-28" });
  assert.deepStrictEqual(integrity.check().problems, []);
});
