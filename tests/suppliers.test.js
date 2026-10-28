const test = require("node:test");
const assert = require("node:assert");
const { freshDb, addCustomer, addProduct } = require("./helpers");
const suppliers = require("../src/services/supplierService");
const dashboard = require("../src/services/dashboardService");
const cashBook = require("../src/services/cashBookService");
const expenses = require("../src/services/expenseService");
const ledger = require("../src/services/ledgerService");
const integrity = require("../src/services/integrityService");

function setSetting(key, value) {
  const { getDatabase } = require("../src/database/dbInit");
  getDatabase().prepare("UPDATE settings SET value = ? WHERE key = ?").run(String(value), key);
}

function shop({ cash = 200000, bank = 100000 } = {}) {
  const db = freshDb();
  setSetting("opening_cash", cash);
  setSetting("opening_bank", bank);
  return db;
}

const pay = (id, amount, source = "Cash", date = "2026-10-10") =>
  suppliers.addPayment({ supplier_id: id, entry_date: date, amount, payment_source: source });

test("a supplier payment lowers cash or bank and the supplier balance", () => {
  shop();
  const { id } = suppliers.add({ name: "Ali Traders", opening: 50000 });
  pay(id, 15000, "Cash");
  pay(id, 5000, "Bank");
  const b = dashboard.getBalances(require("../src/database/dbInit").getDatabase());
  assert.strictEqual(b.cashInHand, 185000);
  assert.strictEqual(b.bankBalance, 95000);
  assert.strictEqual(suppliers.get(id).balance, 30000);
});

test("a payment bigger than cash or bank is blocked and nothing is saved", () => {
  shop({ cash: 1000, bank: 0 });
  const { id } = suppliers.add({ name: "Ali" });
  assert.throws(() => pay(id, 1000.01, "Cash"), /Cash in hand is 1,000/);
  assert.throws(() => pay(id, 1, "Bank"), /Bank balance is 0/);
  assert.strictEqual(suppliers.statement(id).rows.length, 0);
  pay(id, 1000, "Cash"); // exactly the balance is fine
});

test("an advance (payment before any bill) makes the balance negative, then the bill nets it", () => {
  shop();
  const { id } = suppliers.add({ name: "Ali" });
  pay(id, 30000, "Bank");
  assert.strictEqual(suppliers.get(id).balance, -30000);
  assert.deepStrictEqual(
    { advance: suppliers.totals().advance, payable: suppliers.totals().payable },
    { advance: 30000, payable: 0 },
  );
  suppliers.addPurchase({ supplier_id: id, entry_date: "2026-10-11", amount: 100000 });
  assert.strictEqual(suppliers.get(id).balance, 70000);
});

test("a bill with money paid now books both the bill and the payment, atomically", () => {
  shop({ cash: 50000, bank: 0 });
  const { id } = suppliers.add({ name: "Ali" });
  assert.throws(
    () => suppliers.addPurchase({ supplier_id: id, entry_date: "2026-10-11", amount: 90000, paid_now: 60000, payment_source: "Cash" }),
    /Cash in hand/,
  );
  assert.strictEqual(suppliers.statement(id).rows.length, 0); // bill not saved either
  suppliers.addPurchase({ supplier_id: id, entry_date: "2026-10-11", amount: 90000, paid_now: 40000, payment_source: "Cash", reference_no: "B-1" });
  assert.strictEqual(suppliers.get(id).balance, 50000);
  assert.throws(() => suppliers.addPurchase({ supplier_id: id, entry_date: "2026-10-11", amount: 100, paid_now: 200, payment_source: "Cash" }), /more than the bill/);
});

test("deleting a payment gives the money back to cash; editing re-checks funds", () => {
  const db = shop({ cash: 10000, bank: 0 });
  const { id } = suppliers.add({ name: "Ali" });
  const { id: payId } = pay(id, 10000, "Cash");
  assert.strictEqual(dashboard.getBalances(db).cashInHand, 0);
  assert.throws(() => suppliers.updateEntry(payId, { entry_date: "2026-10-10", amount: 10001, payment_source: "Cash" }), /Cash in hand/);
  suppliers.updateEntry(payId, { entry_date: "2026-10-10", amount: 4000, payment_source: "Cash" });
  assert.strictEqual(dashboard.getBalances(db).cashInHand, 6000);
  suppliers.removeEntry(payId);
  assert.strictEqual(dashboard.getBalances(db).cashInHand, 10000);
  assert.strictEqual(suppliers.get(id).balance, 0);
});

test("supplier payments never change profit", () => {
  const db = shop();
  const customer = addCustomer();
  const product = addProduct({ qty: 5, purchase: 800, selling: 1000 });
  ledger.createSale({ customer_id: customer, issue_date: "2026-10-05", items: [{ product_id: product, quantity: 2, unit_price: 1000 }], ledger_type: "Cash", payment_method: "Cash" });
  const range = { from: "2026-10-01", to: "2026-10-31" };
  const before = dashboard.getDashboardData(range, { costVisible: true });
  const { id } = suppliers.add({ name: "Ali" });
  pay(id, 50000, "Cash");
  const after = dashboard.getDashboardData(range, { costVisible: true });
  assert.strictEqual(after.netProfit, before.netProfit);
  assert.strictEqual(after.cashInHand, before.cashInHand - 50000);
  assert.deepStrictEqual(after.supplierPaid, { cash: 50000, bank: 0, total: 50000 });
  assert.strictEqual(after.details.cash.suppliers, 50000);
  void db;
});

test("statement carries a running balance and a balance brought forward", () => {
  shop();
  const { id } = suppliers.add({ name: "Ali", opening: 1000 });
  suppliers.addPurchase({ supplier_id: id, entry_date: "2026-09-01", amount: 5000 });
  pay(id, 2000, "Cash", "2026-10-02");
  const all = suppliers.statement(id);
  assert.deepStrictEqual(all.rows.map((r) => r.balance), [1000, 6000, 4000]);
  const oct = suppliers.statement(id, { from: "2026-10-01", to: "2026-10-31" });
  assert.strictEqual(oct.broughtForward, 6000);
  assert.deepStrictEqual(oct.rows.map((r) => r.balance), [4000]);
  assert.deepStrictEqual(oct.totals, { charged: 0, paid: 2000 });
});

test("supplier rules: unique name, opening edit, inactive blocks entries, delete only when unused", () => {
  shop();
  const { id } = suppliers.add({ name: "Ali", opening: 100 });
  assert.throws(() => suppliers.add({ name: "ali" }), /already exists/);
  assert.throws(() => suppliers.add({ name: " " }), /name is required/);
  suppliers.update(id, { name: "Ali", opening: 250 });
  assert.strictEqual(suppliers.get(id).balance, 250);
  suppliers.update(id, { name: "Ali", status: "Inactive" }); // opening untouched when not sent
  assert.strictEqual(suppliers.get(id).balance, 250);
  assert.throws(() => pay(id, 10), /Inactive/);
  suppliers.update(id, { name: "Ali", status: "Active" });
  pay(id, 10);
  assert.throws(() => suppliers.remove(id), /Inactive instead/);
  const { id: other } = suppliers.add({ name: "Unused", opening: 5 });
  suppliers.remove(other);
  assert.throws(() => suppliers.get(other), /not found/);
});

test("amounts must be positive and dates present", () => {
  shop();
  const { id } = suppliers.add({ name: "Ali" });
  assert.throws(() => pay(id, 0), /greater than 0/);
  assert.throws(() => pay(id, -5), /greater than 0/);
  assert.throws(() => suppliers.addPayment({ supplier_id: id, entry_date: "", amount: 5, payment_source: "Cash" }), /Date/);
  assert.throws(() => suppliers.addPayment({ supplier_id: id, entry_date: "2026-10-10", amount: 5, payment_source: "Cheque" }), /Cash or Bank/);
});

test("existing supplier names on products become suppliers in the migration", () => {
  const db = freshDb();
  db.prepare("INSERT INTO products (product_name, category, supplier) VALUES ('A','Laptop','Ali'), ('B','Laptop',' Ali '), ('C','Laptop','Bilal'), ('D','Laptop','')").run();
  db.exec("DELETE FROM suppliers");
  require("../src/database/migrations/006-suppliers").up(db);
  assert.deepStrictEqual(db.prepare("SELECT name FROM suppliers ORDER BY name").all().map((r) => r.name), ["Ali", "Bilal"]);
});

test("cash & bank book: every movement in order, closing equals the dashboard balances", () => {
  const db = shop({ cash: 1000, bank: 500 });
  const customer = addCustomer();
  const product = addProduct({ qty: 5, purchase: 800, selling: 1000 });
  ledger.createSale({ customer_id: customer, issue_date: "2026-10-05", items: [{ product_id: product, quantity: 1, unit_price: 1000 }], ledger_type: "Cash", payment_method: "Cash" });
  ledger.addLedgerPayment({ customer_id: customer, amount: 300, payment_date: "2026-10-06", payment_method: "Bank Transfer" });
  expenses.add({ expense_date: "2026-10-07", category: "Rent", amount: 200, payment_source: "Cash" });
  const { id } = suppliers.add({ name: "Ali" });
  pay(id, 400, "Bank", "2026-10-08");

  const book = cashBook.get({});
  assert.deepStrictEqual(book.rows.map((r) => r.kind), ["Customer payment", "Customer payment", "Expense", "Supplier payment"]);
  const bal = dashboard.getBalances(db);
  assert.strictEqual(book.closingCash, bal.cashInHand);
  assert.strictEqual(book.closingBank, bal.bankBalance);
  assert.strictEqual(book.closingCash, 1000 + 1000 - 200);
  assert.strictEqual(book.closingBank, 500 + 300 - 400);

  const later = cashBook.get({ from: "2026-10-07" });
  assert.strictEqual(later.openingCash, 2000); // 1000 + 1000 sale cash
  assert.strictEqual(later.openingBank, 800);
  assert.deepStrictEqual(later.rows.map((r) => r.kind), ["Expense", "Supplier payment"]);
  assert.strictEqual(cashBook.get({ account: "Bank" }).rows.length, 2);
});

test("data check flags a negative cash or bank balance", () => {
  const db = shop({ cash: 100, bank: 0 });
  assert.strictEqual(integrity.check().ok, true);
  expenses.add({ expense_date: "2026-10-07", category: "Rent", amount: 500, payment_source: "Cash" }); // expenses are not guarded
  const r = integrity.check();
  assert.ok(r.problems.some((p) => p.type === "cash_negative"));
  void db;
});
