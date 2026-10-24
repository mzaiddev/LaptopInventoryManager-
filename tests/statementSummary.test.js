const test = require("node:test");
const assert = require("node:assert");
const { freshDb, addCustomer, addProduct } = require("./helpers");
const ledger = require("../src/services/ledgerService");

// Mirrors a real shop case: old balance, a part-paid sale, a direct payment, a paid sale, then a return.
function zia() {
  freshDb();
  const cid = addCustomer("Zia Laptop");
  const pid = addProduct({ qty: 100 });
  ledger.createSale({ customer_id: cid, issue_date: "2026-08-01", items: [{ product_id: pid, quantity: 2, unit_price: 25000 }], ledger_type: "Loan", paid_amount: 10000, payment_method: "Cash" });
  ledger.addLedgerOldBalance({ customer_id: cid, amount: 100000, balance_type: "Debit", entry_date: "2026-08-01" });
  ledger.addLedgerPayment({ customer_id: cid, amount: 20000, payment_date: "2026-08-01", payment_method: "Cash" });
  const s2 = ledger.createSale({ customer_id: cid, issue_date: "2026-08-01", items: [{ product_id: pid, quantity: 3, unit_price: 24000 }], ledger_type: "Cash", payment_method: "Cash" });
  ledger.createReturn({ customer_id: cid, sale_issue_id: s2.saleId, return_date: "2026-08-01", items: [{ product_id: pid, quantity: 1, unit_price: 24000 }] });
  return cid;
}

test("statement breakdown adds up: old + sales - returns - payments = balance", () => {
  const cid = zia();
  const s = ledger.getCustomerLedgerSummary(cid).statement;
  assert.deepStrictEqual(
    [s.old_balance, s.sales, s.returns, s.payments, s.other, s.balance],
    [100000, 122000, 24000, 102000, 0, 96000],
  );
  assert.strictEqual(s.old_balance + s.sales - s.returns - s.payments + s.other, s.balance);
});

test("the full profile carries the same breakdown", () => {
  const cid = zia();
  assert.strictEqual(ledger.getCustomerFullProfile(cid).balance.statement.balance, 96000);
});

test("a customer who is in credit gets a negative balance, not zero", () => {
  const cid = zia();
  ledger.addLedgerPayment({ customer_id: cid, amount: 100000, payment_date: "2026-08-02", payment_method: "Cash" });
  const s = ledger.getCustomerLedgerSummary(cid).statement;
  assert.strictEqual(s.balance, -4000);
});

test("a customer with no history has an all-zero breakdown", () => {
  freshDb();
  const cid = addCustomer("New");
  assert.deepStrictEqual(ledger.getCustomerLedgerSummary(cid).statement, { old_balance: 0, sales: 0, returns: 0, payments: 0, other: 0, balance: 0 });
});
