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

test("opening cash and bank amounts from Settings are added to the balances", () => {
  const db = fixture();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('opening_cash', '5000'), ('opening_bank', '20000')").run();
  const d = dashboard.getDashboardData(OCT, { costVisible: true });
  assert.strictEqual(d.cashInHand, 6100);
  assert.strictEqual(d.bankBalance, 20400);
});

test("a junk opening balance setting is treated as zero", () => {
  const db = fixture();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('opening_cash', 'abc')").run();
  assert.strictEqual(dashboard.getDashboardData(OCT, { costVisible: true }).cashInHand, 1100);
  assert.strictEqual(dashboard.getDashboardData(OCT, {}).cashInHand, null);
});

test("details give the lines behind each card, and they add up", () => {
  fixture();
  const d = dashboard.getDashboardData(OCT, { costVisible: true }).details;
  assert.deepStrictEqual(d.sales, { discounts: 100, returns: 950 });
  assert.deepStrictEqual(d.received, { onSales: 500, onLedger: 300 });
  assert.deepStrictEqual(d.profit, { sales: 950, cogs: 800, expenses: 300 });
  assert.deepStrictEqual(d.cash, { opening: 0, received: 1300, expenses: 200, suppliers: 0 });
  assert.deepStrictEqual(d.bank, { opening: 0, received: 500, expenses: 100, suppliers: 0 });
  assert.deepStrictEqual(d.owe, { old_balance: 0, sales: 2900, returns: 950, payments: 1800, other: 0, balance: 150 });
  assert.strictEqual(d.owe.old_balance + d.owe.sales - d.owe.returns - d.owe.payments + d.owe.other, d.owe.balance);
});

test("profit details are hidden while purchase prices are hidden", () => {
  fixture();
  const d = dashboard.getDashboardData(OCT, { costVisible: false }).details;
  assert.strictEqual(d.profit, null);
});

test("details on an empty database are all zero", () => {
  freshDb();
  const d = dashboard.getDashboardData(OCT, { costVisible: true }).details;
  assert.deepStrictEqual(d.owe, { old_balance: 0, sales: 0, returns: 0, payments: 0, other: 0, balance: 0 });
  assert.deepStrictEqual(d.received, { onSales: 0, onLedger: 0 });
});

test("old balances are shown on their own, with how many customers have one", () => {
  freshDb();
  const a = addCustomer("A");
  const b = addCustomer("B");
  ledger.addLedgerOldBalance({ customer_id: a, amount: 100000, balance_type: "Debit", entry_date: "2026-08-01" });
  ledger.addLedgerOldBalance({ customer_id: b, amount: 30000, balance_type: "Debit", entry_date: "2026-08-01" });
  ledger.addLedgerOldBalance({ customer_id: b, amount: 5000, balance_type: "Credit", entry_date: "2026-08-02" });
  const d = dashboard.getDashboardData({}, { costVisible: true });
  assert.deepStrictEqual(d.oldBalance, { amount: 125000, customers: 2 });
  assert.strictEqual(d.netProfit, 0); // an old balance is not profit
});

test("no old balances gives zero", () => {
  freshDb();
  assert.deepStrictEqual(dashboard.getDashboardData({}, {}).oldBalance, { amount: 0, customers: 0 });
});
