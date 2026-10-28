const test = require("node:test");
const assert = require("node:assert");
const { freshDb, addCustomer } = require("./helpers");
const profit = require("../src/services/profitService");

function db() {
  return require("../src/database/dbInit").getDatabase();
}

function product(name, cost, category = "Laptop") {
  return Number(db().prepare("INSERT INTO products (product_name, category, purchase_price, selling_price, quantity) VALUES (?, ?, ?, 0, 50)").run(name, category, cost).lastInsertRowid);
}

function sale(date, discount, lines) {
  const c = addCustomer("C" + Math.random());
  const total = lines.reduce((s, l) => s + l.subtotal, 0) - discount;
  const id = Number(db().prepare("INSERT INTO sale_issues (customer_id, reference_no, issue_date, total_amount, discount_amount) VALUES (?, ?, ?, ?, ?)")
    .run(c, "S-" + Math.random(), date, total, discount).lastInsertRowid);
  for (const l of lines) {
    db().prepare("INSERT INTO sale_issue_items (sale_issue_id, product_id, product_name, quantity, unit_price, subtotal) VALUES (?, ?, 'x', ?, ?, ?)")
      .run(id, l.product, l.qty, l.subtotal / l.qty, l.subtotal);
  }
  return { id, customer: c };
}

function returned(saleId, customer, date, productId, qty, subtotal) {
  const r = Number(db().prepare("INSERT INTO returns (customer_id, sale_issue_id, reference_no, return_date, total_return_amount, status) VALUES (?, ?, ?, ?, ?, 'Completed')")
    .run(customer, saleId, "R-" + Math.random(), date, subtotal).lastInsertRowid);
  db().prepare("INSERT INTO return_items (return_id, product_id, product_name, quantity, unit_price, subtotal) VALUES (?, ?, 'x', ?, ?, ?)").run(r, productId, qty, subtotal / qty, subtotal);
}

const OCT = { from: "2026-10-01", to: "2026-10-31" };

test("revenue, cost and profit per product, with the sale discount shared out by line value", () => {
  freshDb();
  const a = product("Dell", 800);
  const b = product("Charger", 8, "Charger");
  sale("2026-10-05", 100, [{ product: a, qty: 2, subtotal: 2000 }, { product: b, qty: 10, subtotal: 100 }]);
  const r = profit.byProduct(OCT);
  const dell = r.rows.find((x) => x.product_id === a);
  const chg = r.rows.find((x) => x.product_id === b);
  // discount 100 over 2100 of lines: Dell takes 95.24, Charger 4.76
  assert.strictEqual(dell.qty, 2);
  assert.strictEqual(dell.revenue, 1904.76);
  assert.strictEqual(dell.cogs, 1600);
  assert.strictEqual(dell.profit, 304.76);
  assert.strictEqual(chg.revenue, 95.24);
  assert.strictEqual(chg.cogs, 80);
  assert.strictEqual(r.totals.revenue, 2000);
  assert.strictEqual(r.totals.profit, 2000 - 1600 - 80);
});

test("a return takes away its revenue and its cost", () => {
  freshDb();
  const a = product("Dell", 800);
  const s = sale("2026-10-05", 0, [{ product: a, qty: 2, subtotal: 2000 }]);
  returned(s.id, s.customer, "2026-10-06", a, 1, 1000);
  const dell = profit.byProduct(OCT).rows[0];
  assert.strictEqual(dell.qty, 1);
  assert.strictEqual(dell.revenue, 1000);
  assert.strictEqual(dell.cogs, 800);
  assert.strictEqual(dell.profit, 200);
});

test("only sales inside the dates count, and rows are sorted by profit", () => {
  freshDb();
  const small = product("Small", 90);
  const big = product("Big", 100);
  const old = product("Old", 1);
  sale("2026-10-05", 0, [{ product: small, qty: 1, subtotal: 100 }, { product: big, qty: 1, subtotal: 400 }]);
  sale("2026-09-30", 0, [{ product: old, qty: 1, subtotal: 999 }]);
  const r = profit.byProduct(OCT);
  assert.deepStrictEqual(r.rows.map((x) => x.product_name), ["Big", "Small"]);
  assert.strictEqual(r.rows[0].margin, 75);
});

test("a product with no sales in the period does not appear", () => {
  freshDb();
  product("Idle", 5);
  assert.deepStrictEqual(profit.byProduct(OCT).rows, []);
  assert.deepStrictEqual(profit.byProduct(OCT).totals, { qty: 0, revenue: 0, cogs: 0, profit: 0 });
});
