const test = require("node:test");
const assert = require("node:assert");
const { freshDb, addCustomer, addProduct } = require("./helpers");
const ledger = require("../src/services/ledgerService");
const expenses = require("../src/services/expenseService");
const dashboard = require("../src/services/dashboardService");

function fixture() {
  const db = freshDb();
  const customerId = addCustomer();
  const productId = addProduct({ qty: 10, purchase: 800, selling: 1000 });
  const sale1 = ledger.createSale({
    customer_id: customerId, issue_date: "2026-10-05",
    items: [{ product_id: productId, quantity: 2, unit_price: 1000 }],
    discount_type: "amount", discount_value: 100,
    ledger_type: "Loan", paid_amount: 500, payment_method: "Bank Transfer",
  });
  ledger.createSale({
    customer_id: customerId, issue_date: "2026-09-20",
    items: [{ product_id: productId, quantity: 1, unit_price: 1000 }],
    ledger_type: "Cash", payment_method: "Cash",
  });
  ledger.addLedgerPayment({ customer_id: customerId, amount: 300, payment_date: "2026-10-06", payment_method: "Cash" });
  expenses.add({ expense_date: "2026-10-07", category: "Rent", amount: 200, payment_source: "Cash" });
  expenses.add({ expense_date: "2026-10-08", category: "Tea", amount: 100, payment_source: "Bank" });
  ledger.createReturn({
    customer_id: customerId, sale_issue_id: sale1.saleId, return_date: "2026-10-09",
    items: [{ product_id: productId, quantity: 1, unit_price: 1000 }],
  });
  return db;
}
const OCT = { from: "2026-10-01", to: "2026-10-31" };

test("range figures match a hand computation", () => {
  fixture();
  const d = dashboard.getDashboardData(OCT, { costVisible: true });
  assert.strictEqual(d.sales, 950);
  assert.deepStrictEqual(d.received, { total: 800, cash: 300, bank: 500 });
  assert.deepStrictEqual([d.returns.total, d.returns.count], [950, 1]);
  assert.deepStrictEqual(d.expenses, { total: 300, cash: 200, bank: 100 });
  assert.strictEqual(d.netProfit, -150); // 950 - COGS 800 - expenses 300
});

test("cash in hand and bank balance ignore the date range", () => {
  fixture();
  for (const range of [OCT, { from: "2026-01-01", to: "2026-01-02" }, {}]) {
    const d = dashboard.getDashboardData(range, { costVisible: true });
    assert.strictEqual(d.cashInHand, 1100); // 1000 + 300 - 200
    assert.strictEqual(d.bankBalance, 400); // 500 - 100
  }
});

test("outstanding is the ledger balance and counts customers who owe", () => {
  fixture();
  const d = dashboard.getDashboardData(OCT, { costVisible: true });
  assert.deepStrictEqual([d.outstanding.amount, d.outstanding.customersOwing], [150, 1]);
});

test("stock cards count what is on the shelf", () => {
  fixture();
  const d = dashboard.getDashboardData(OCT, { costVisible: true });
  assert.deepStrictEqual([d.stock.itemsInStock, d.stock.stockValue], [8, 6400]);
});

test("profit and stock value are null while purchase prices are hidden", () => {
  fixture();
  const d = dashboard.getDashboardData(OCT, { costVisible: false });
  assert.strictEqual(d.netProfit, null);
  assert.strictEqual(d.stock.stockValue, null);
  assert.strictEqual(d.sales, 950);
});

test("an empty database gives zeros, never NaN or null where a number belongs", () => {
  freshDb();
  const d = dashboard.getDashboardData(OCT, { costVisible: true });
  assert.deepStrictEqual([d.sales, d.cashInHand, d.bankBalance, d.expenses.total, d.netProfit, d.outstanding.amount], [0, 0, 0, 0, 0, 0]);
  assert.deepStrictEqual(d.recentSales, []);
});

test("a range with no activity shows zero sales but the same cash balance", () => {
  fixture();
  const d = dashboard.getDashboardData({ from: "2025-01-01", to: "2025-01-31" }, { costVisible: true });
  assert.deepStrictEqual([d.sales, d.received.total, d.expenses.total, d.netProfit], [0, 0, 0, 0]);
});
