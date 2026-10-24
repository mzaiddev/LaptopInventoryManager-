const test = require("node:test");
const assert = require("node:assert");
const { freshDb, addCustomer, addProduct } = require("./helpers");
const ledger = require("../src/services/ledgerService");

function setup() {
  const db = freshDb();
  const customerId = addCustomer();
  const productId = addProduct({ qty: 10 });
  return { db, customerId, productId };
}

const ledgerBalance = (db, cid) =>
  db.prepare("SELECT COALESCE(SUM(debit - credit),0) b FROM customer_ledger WHERE customer_id = ?").get(cid).b;

function discountedSale(s, extra = {}) {
  return ledger.createSale({
    customer_id: s.customerId,
    issue_date: "2026-10-01",
    items: [{ product_id: s.productId, quantity: 2, unit_price: 1000, discount_amount: 200 }],
    discount_type: "percent",
    discount_value: 10,
    ledger_type: "Loan",
    paid_amount: 500,
    payment_method: "Bank",
    ...extra,
  });
}

test("createSale stores net total, discounts, payment method and keeps ledger in step", () => {
  const s = setup();
  const { saleId } = discountedSale(s);
  const sale = s.db.prepare("SELECT * FROM sale_issues WHERE id = ?").get(saleId);
  assert.deepStrictEqual(
    [sale.total_amount, sale.discount_type, sale.discount_value, sale.discount_amount, sale.paid_amount, sale.remaining_amount],
    [1620, "percent", 10, 180, 500, 1120],
  );
  const item = s.db.prepare("SELECT * FROM sale_issue_items WHERE sale_issue_id = ?").get(saleId);
  assert.deepStrictEqual([item.subtotal, item.discount_amount], [1800, 200]);
  assert.strictEqual(s.db.prepare("SELECT payment_method m FROM payments WHERE sale_issue_id = ?").get(saleId).m, "Bank");
  assert.strictEqual(ledgerBalance(s.db, s.customerId), 1120);
  assert.strictEqual(s.db.prepare("SELECT quantity q FROM products WHERE id = ?").get(s.productId).q, 8);
});

test("a discount larger than the sale is rejected and stock is untouched", () => {
  const s = setup();
  assert.throws(() => discountedSale(s, { discount_type: "amount", discount_value: 5000 }), /sale discount/i);
  assert.strictEqual(s.db.prepare("SELECT quantity q FROM products WHERE id = ?").get(s.productId).q, 10);
  assert.strictEqual(s.db.prepare("SELECT COUNT(*) c FROM sale_issues").get().c, 0);
});

test("payment method: 'Bank Transfer' is stored as Bank; unknown methods are rejected", () => {
  const s = setup();
  const { saleId } = discountedSale(s, { payment_method: "Bank Transfer" });
  assert.strictEqual(s.db.prepare("SELECT payment_method m FROM payments WHERE sale_issue_id = ?").get(saleId).m, "Bank");
  assert.throws(() => discountedSale(s, { payment_method: "Cheque" }), /payment method/i);
});

test("return after a discounted sale refunds the net price, not the list price", () => {
  const s = setup();
  const { saleId } = discountedSale(s, { paid_amount: 0 });
  const r = ledger.createReturn({
    customer_id: s.customerId,
    sale_issue_id: saleId,
    return_date: "2026-10-02",
    items: [{ product_id: s.productId, quantity: 1, unit_price: 1000 }],
  });
  const ret = s.db.prepare("SELECT total_return_amount t FROM returns WHERE id = ?").get(r.returnId);
  assert.strictEqual(ret.t, 810);
  const sale = s.db.prepare("SELECT total_amount t, remaining_amount r FROM sale_issues WHERE id = ?").get(saleId);
  assert.deepStrictEqual([sale.t, sale.r], [810, 810]);
  assert.strictEqual(ledgerBalance(s.db, s.customerId), 810);
});

test("addPayment cannot exceed what is still owed", () => {
  const s = setup();
  const { saleId } = discountedSale(s);
  assert.throws(() => ledger.addPayment({ sale_issue_id: saleId, amount: 1121, payment_date: "2026-10-03", payment_method: "Cash" }), /exceeds/i);
  ledger.addPayment({ sale_issue_id: saleId, amount: 1120, payment_date: "2026-10-03", payment_method: "Cash" });
  const sale = s.db.prepare("SELECT remaining_amount r, payment_status p FROM sale_issues WHERE id = ?").get(saleId);
  assert.deepStrictEqual([sale.r, sale.p], [0, "Paid"]);
  assert.strictEqual(ledgerBalance(s.db, s.customerId), 0);
});

test("updateSale with a new discount recomputes total and ledger", () => {
  const s = setup();
  const { saleId } = discountedSale(s, { paid_amount: 0 });
  ledger.updateSale(saleId, {
    items: [{ product_id: s.productId, quantity: 2, unit_price: 1000 }],
    discount_type: "amount",
    discount_value: 100,
  });
  const sale = s.db.prepare("SELECT total_amount t, discount_amount d, remaining_amount r FROM sale_issues WHERE id = ?").get(saleId);
  assert.deepStrictEqual([sale.t, sale.d, sale.r], [1900, 100, 1900]);
  assert.strictEqual(ledgerBalance(s.db, s.customerId), 1900);
});

test("updateSale can change the payment method of a paid sale", () => {
  const s = setup();
  const { saleId } = discountedSale(s);
  ledger.updateSale(saleId, { ledger_type: "Loan", paid_amount: 500, payment_method: "Cash" });
  assert.strictEqual(s.db.prepare("SELECT payment_method m FROM payments WHERE sale_issue_id = ?").get(saleId).m, "Cash");
});

test("direct ledger payments remember Cash or Bank", () => {
  const s = setup();
  ledger.addLedgerPayment({ customer_id: s.customerId, amount: 300, payment_date: "2026-10-04", payment_method: "Bank" });
  const row = s.db.prepare("SELECT payment_method m FROM customer_ledger WHERE reference_type='Payment' AND reference_id IS NULL").get();
  assert.strictEqual(row.m, "Bank");
});
