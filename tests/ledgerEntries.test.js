const test = require("node:test");
const assert = require("node:assert");
const { freshDb, addCustomer, addProduct } = require("./helpers");
const ledger = require("../src/services/ledgerService");

function seed() {
  freshDb();
  const ali = addCustomer("Ali Traders");
  const bob = addCustomer("Bob Laptops");
  const p = addProduct({ qty: 50 });
  const sale = (cid, date, qty, extra = {}) =>
    ledger.createSale({ customer_id: cid, issue_date: date, items: [{ product_id: p, quantity: qty, unit_price: 1000 }], ledger_type: "Cash", payment_method: "Cash", ...extra });
  sale(ali, "2026-08-01", 1);
  sale(bob, "2026-09-10", 2);
  sale(ali, "2026-10-24", 3, { ledger_type: "Loan", paid_amount: 1000 });
  ledger.addLedgerPayment({ customer_id: bob, amount: 50, payment_date: "2026-10-25", payment_method: "Bank Transfer" });
  return { ali, bob };
}

test("all customers, newest first, with the customer name on every row", () => {
  seed();
  const r = ledger.getLedgerEntries({});
  assert.strictEqual(r.total, 7); // 3 sales, 3 payments on them, 1 direct payment
  assert.strictEqual(r.rows[0].entry_date, "2026-10-25");
  assert.ok(r.rows.every((x) => x.customer_name));
  const dates = r.rows.map((x) => x.entry_date);
  assert.deepStrictEqual(dates, [...dates].sort().reverse());
});

test("one customer only", () => {
  const { ali } = seed();
  const r = ledger.getLedgerEntries({ customer_id: ali });
  assert.ok(r.rows.length > 0 && r.rows.every((x) => x.customer_id === ali));
});

test("date range is inclusive", () => {
  seed();
  const r = ledger.getLedgerEntries({ date_from: "2026-09-10", date_to: "2026-10-24" });
  assert.ok(r.rows.every((x) => x.entry_date >= "2026-09-10" && x.entry_date <= "2026-10-24"));
  assert.strictEqual(r.total, 4);
});

test("type filter and text search (customer name or description)", () => {
  seed();
  assert.ok(ledger.getLedgerEntries({ reference_type: "Payment" }).rows.every((x) => x.reference_type === "Payment"));
  assert.ok(ledger.getLedgerEntries({ search: "Bob" }).rows.every((x) => x.customer_name === "Bob Laptops"));
  assert.ok(ledger.getLedgerEntries({ search: "SALE-20261024" }).total >= 1);
  assert.strictEqual(ledger.getLedgerEntries({ search: "nobody-at-all" }).total, 0);
});

test("pagination returns pages of the newest-first list and the full count", () => {
  seed();
  const p1 = ledger.getLedgerEntries({ page: 1, pageSize: 3 });
  const p2 = ledger.getLedgerEntries({ page: 2, pageSize: 3 });
  assert.strictEqual(p1.rows.length, 3);
  assert.strictEqual(p1.total, 7);
  assert.ok(p1.rows[2].id !== p2.rows[0].id);
  assert.strictEqual(ledger.getLedgerEntries({ page: 3, pageSize: 3 }).rows.length, 1);
});

test("search text with % or quotes does not break the query", () => {
  seed();
  assert.doesNotThrow(() => ledger.getLedgerEntries({ search: "50%' OR 1=1 --" }));
  assert.strictEqual(ledger.getLedgerEntries({ search: "50%' OR 1=1 --" }).total, 0);
});
