const test = require("node:test");
const assert = require("node:assert");
const { freshDb, addCustomer, addProduct } = require("./helpers");
const ledger = require("../src/services/ledgerService");
const integrity = require("../src/services/integrityService");

function sold() {
  const db = freshDb();
  const customerId = addCustomer();
  const productId = addProduct();
  const { saleId } = ledger.createSale({
    customer_id: customerId, issue_date: "2026-10-01",
    items: [{ product_id: productId, quantity: 2, unit_price: 1000, discount_amount: 100 }],
    ledger_type: "Loan", paid_amount: 500, payment_method: "Cash",
  });
  ledger.addPayment({ sale_issue_id: saleId, amount: 200, payment_date: "2026-10-02", payment_method: "Bank Transfer" });
  return { db, customerId, saleId, productId };
}

test("a consistent database reports no problems", () => {
  sold();
  assert.deepStrictEqual(integrity.check(), { ok: true, problems: [] });
});

test("a tampered sale (paid no longer matches its payments) is reported by id", () => {
  const { db, saleId } = sold();
  db.prepare("UPDATE sale_issues SET paid_amount = 999, remaining_amount = 901 WHERE id = ?").run(saleId);
  const r = integrity.check();
  assert.strictEqual(r.ok, false);
  assert.ok(r.problems.some((p) => p.type === "sale_paid_mismatch" && p.id === saleId));
});

test("a ledger whose last running balance differs from its debits minus credits is reported", () => {
  const { db, customerId } = sold();
  db.prepare("UPDATE customer_ledger SET running_balance = running_balance + 50 WHERE id = (SELECT MAX(id) FROM customer_ledger WHERE customer_id = ?)").run(customerId);
  const r = integrity.check();
  assert.ok(r.problems.some((p) => p.type === "ledger_balance_mismatch" && p.id === customerId));
});

test("negative stock is reported", () => {
  const { db, productId } = sold();
  db.prepare("UPDATE products SET quantity = -1 WHERE id = ?").run(productId);
  assert.ok(integrity.check().problems.some((p) => p.type === "negative_stock" && p.id === productId));
});

test("a sale with a return does not raise false alarms", () => {
  const { customerId, saleId, productId } = sold();
  ledger.createReturn({ customer_id: customerId, sale_issue_id: saleId, return_date: "2026-10-03", items: [{ product_id: productId, quantity: 1, unit_price: 1000 }] });
  assert.deepStrictEqual(integrity.check(), { ok: true, problems: [] });
});

test("a customer who overpaid through returns does not raise false alarms", () => {
  const { customerId, saleId, productId } = sold();
  ledger.createReturn({ customer_id: customerId, sale_issue_id: saleId, return_date: "2026-10-03", items: [{ product_id: productId, quantity: 2, unit_price: 1000 }] });
  assert.deepStrictEqual(integrity.check(), { ok: true, problems: [] });
});
