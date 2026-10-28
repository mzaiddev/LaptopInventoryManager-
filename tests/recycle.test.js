const test = require("node:test");
const assert = require("node:assert");
const { freshDb, addCustomer } = require("./helpers");
const recycle = require("../src/services/recycleService");
const inventory = require("../src/services/inventoryService");
const expenses = require("../src/services/expenseService");

function db() {
  return require("../src/database/dbInit").getDatabase();
}

function productWithHistory() {
  const id = Number(db().prepare("INSERT INTO products (product_name, category, purchase_price, selling_price, quantity, supplier) VALUES ('Dell 5420','Laptop',280,340,5,'TechSource')").run().lastInsertRowid);
  db().prepare("INSERT INTO inspection_notes (product_id, note) VALUES (?, 'Battery 87%')").run(id);
  db().prepare("INSERT INTO damage_records (product_id, quantity, reference_no, recorded_date) VALUES (?, 1, 'DMG-1', '2026-10-01')").run(id);
  const supplier = Number(db().prepare("INSERT INTO suppliers (name) VALUES ('TechSource')").run().lastInsertRowid);
  db().prepare("INSERT INTO supplier_ledger (supplier_id, entry_date, entry_type, charge, note, product_id, product_qty) VALUES (?, '2026-10-01', 'Purchase', 1400, 'Dell x 5', ?, 5)").run(supplier, id);
  const customer = addCustomer("Ali");
  const sale = Number(db().prepare("INSERT INTO sale_issues (customer_id, reference_no, issue_date, total_amount, paid_amount, remaining_amount) VALUES (?, 'S-1', '2026-10-02', 340, 340, 0)").run(customer).lastInsertRowid);
  db().prepare("INSERT INTO sale_issue_items (sale_issue_id, product_id, product_name, quantity, unit_price, subtotal) VALUES (?, ?, 'Dell 5420', 1, 340, 340)").run(sale, id);
  return { id, sale };
}

const count = (sql, ...a) => db().prepare(sql).get(...a).n;

test("deleting a product puts it, its notes, damages and sale lines in the recycle bin", () => {
  freshDb();
  const { id, sale } = productWithHistory();
  inventory.deleteProduct(id);
  assert.strictEqual(count("SELECT COUNT(*) n FROM products WHERE id = ?", id), 0);
  assert.strictEqual(count("SELECT COUNT(*) n FROM sale_issue_items WHERE sale_issue_id = ?", sale), 0);
  const items = recycle.list();
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].entity, "product");
  assert.match(items[0].label, /Dell 5420/);
});

test("restoring a product brings back the same id with notes, damages, sale lines and supplier bill", () => {
  freshDb();
  const { id, sale } = productWithHistory();
  inventory.deleteProduct(id);
  assert.strictEqual(count("SELECT COUNT(*) n FROM supplier_ledger WHERE product_id = ?", id), 0);
  recycle.restore(recycle.list()[0].id);
  assert.strictEqual(db().prepare("SELECT quantity FROM products WHERE id = ?").get(id).quantity, 5);
  assert.strictEqual(count("SELECT COUNT(*) n FROM inspection_notes WHERE product_id = ?", id), 1);
  assert.strictEqual(count("SELECT COUNT(*) n FROM damage_records WHERE product_id = ?", id), 1);
  assert.strictEqual(count("SELECT COUNT(*) n FROM sale_issue_items WHERE sale_issue_id = ? AND product_id = ?", sale, id), 1);
  assert.strictEqual(count("SELECT COUNT(*) n FROM supplier_ledger WHERE product_id = ?", id), 1);
  assert.strictEqual(recycle.list().length, 0);
});

test("a deleted expense can be restored", () => {
  freshDb();
  const { id } = expenses.add({ expense_date: "2026-10-05", category: "Rent", amount: 500, payment_source: "Cash", note: "Oct" });
  expenses.remove(id);
  assert.strictEqual(recycle.list()[0].entity, "expense");
  recycle.restore(recycle.list()[0].id);
  const row = db().prepare("SELECT * FROM expenses WHERE id = ?").get(id);
  assert.strictEqual(row.amount, 500);
  assert.strictEqual(row.note, "Oct");
});

test("restoring refuses when the record is already back", () => {
  freshDb();
  const { id } = expenses.add({ expense_date: "2026-10-05", category: "Rent", amount: 500, payment_source: "Cash" });
  expenses.remove(id);
  const bin = recycle.list()[0].id;
  recycle.restore(bin);
  recycle.archive({ entity: "expense", entityId: id, label: "again", tables: { expenses: [db().prepare("SELECT * FROM expenses WHERE id = ?").get(id)] } });
  assert.throws(() => recycle.restore(recycle.list()[0].id), /already/i);
});

test("purge removes one entry for good and purgeOld clears entries older than the keep days", () => {
  freshDb();
  const a = expenses.add({ expense_date: "2026-10-05", category: "A", amount: 1, payment_source: "Cash" }).id;
  const b = expenses.add({ expense_date: "2026-10-05", category: "B", amount: 1, payment_source: "Cash" }).id;
  expenses.remove(a);
  expenses.remove(b);
  const [x, y] = recycle.list();
  db().prepare("UPDATE recycle_bin SET deleted_at = datetime('now','localtime','-40 days') WHERE id = ?").run(x.id);
  assert.strictEqual(recycle.purgeOld(30), 1);
  assert.deepStrictEqual(recycle.list().map((i) => i.id), [y.id]);
  recycle.purge(y.id);
  assert.strictEqual(recycle.list().length, 0);
});
