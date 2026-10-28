const test = require("node:test");
const assert = require("node:assert");
const { freshDb } = require("./helpers");
const lists = require("../src/services/listService");

function db() {
  return require("../src/database/dbInit").getDatabase();
}

function addProduct(name, category, location = "") {
  return Number(db().prepare("INSERT INTO products (product_name, category, storage_location, purchase_price, selling_price, quantity) VALUES (?, ?, ?, 1, 2, 1)")
    .run(name, category, location).lastInsertRowid);
}

function addExpense(category) {
  return Number(db().prepare("INSERT INTO expenses (expense_date, category, amount, payment_source) VALUES ('2026-10-01', ?, 10, 'Cash')").run(category).lastInsertRowid);
}

const names = (key, opts) => lists.list(key, opts).map((i) => i.name);

test("a fresh database starts with the default product and expense categories", () => {
  freshDb();
  assert.ok(names("product_category").includes("Laptop"));
  assert.ok(names("product_category").includes("Charger"));
  assert.ok(names("expense_category").includes("Rent"));
});

test("add trims the name and refuses blanks, duplicates in any letter case, and unknown lists", () => {
  freshDb();
  lists.add("product_category", "  Tablet ");
  assert.ok(names("product_category").includes("Tablet"));
  assert.throws(() => lists.add("product_category", "   "), /name/i);
  assert.throws(() => lists.add("product_category", "tablet"), /already/i);
  assert.throws(() => lists.add("colours", "Red"), /list/i);
});

test("list shows how many records use each item", () => {
  freshDb();
  addProduct("A", "Laptop");
  addProduct("B", "Laptop");
  addProduct("C", "Charger");
  addExpense("Rent");
  const usage = Object.fromEntries(lists.list("product_category").map((i) => [i.name, i.usage]));
  assert.strictEqual(usage.Laptop, 2);
  assert.strictEqual(usage.Charger, 1);
  assert.strictEqual(usage.Mouse, 0);
  assert.strictEqual(lists.list("expense_category").find((i) => i.name === "Rent").usage, 1);
});

test("renaming an item updates every product that uses it", () => {
  freshDb();
  const id = lists.list("product_category").find((i) => i.name === "Mouse").id;
  const p = addProduct("M1", "Mouse");
  lists.rename(id, "Pointing Device");
  assert.strictEqual(db().prepare("SELECT category FROM products WHERE id = ?").get(p).category, "Pointing Device");
  assert.ok(names("product_category").includes("Pointing Device"));
  assert.ok(!names("product_category").includes("Mouse"));
});

test("renaming to a name that exists is refused and tells the owner to merge", () => {
  freshDb();
  const id = lists.list("product_category").find((i) => i.name === "Mouse").id;
  assert.throws(() => lists.rename(id, "keyboard"), /merge/i);
});

test("merge moves records to the other item and removes the merged one", () => {
  freshDb();
  const all = lists.list("product_category");
  const mouse = all.find((i) => i.name === "Mouse");
  const kb = all.find((i) => i.name === "Keyboard");
  const p = addProduct("M1", "Mouse");
  lists.merge(mouse.id, kb.id);
  assert.strictEqual(db().prepare("SELECT category FROM products WHERE id = ?").get(p).category, "Keyboard");
  assert.ok(!names("product_category", { includeArchived: true }).includes("Mouse"));
});

test("merge only works inside one list", () => {
  freshDb();
  const mouse = lists.list("product_category").find((i) => i.name === "Mouse");
  const rent = lists.list("expense_category").find((i) => i.name === "Rent");
  assert.throws(() => lists.merge(mouse.id, rent.id), /same list/i);
});

test("an archived item is hidden from new entries but old records keep it", () => {
  freshDb();
  const id = lists.list("product_category").find((i) => i.name === "Printer").id;
  const p = addProduct("P1", "Printer");
  lists.setActive(id, false);
  assert.ok(!names("product_category").includes("Printer"));
  assert.ok(names("product_category", { includeArchived: true }).includes("Printer"));
  assert.strictEqual(db().prepare("SELECT category FROM products WHERE id = ?").get(p).category, "Printer");
  lists.setActive(id, true);
  assert.ok(names("product_category").includes("Printer"));
});

test("remove works only when nothing uses the item", () => {
  freshDb();
  const all = lists.list("product_category");
  const ups = all.find((i) => i.name === "UPS");
  const laptop = all.find((i) => i.name === "Laptop");
  addProduct("L1", "Laptop");
  assert.throws(() => lists.remove(laptop.id), /in use/i);
  lists.remove(ups.id);
  assert.ok(!names("product_category", { includeArchived: true }).includes("UPS"));
});

test("ensure adds a missing name once and ignores spelling case", () => {
  freshDb();
  lists.ensure("product_category", "Smart Watch");
  lists.ensure("product_category", "smart watch");
  assert.strictEqual(names("product_category").filter((n) => n.toLowerCase() === "smart watch").length, 1);
  lists.ensure("product_category", "  ");
  assert.ok(!names("product_category").includes(""));
});

test("syncFromData brings in categories and locations already typed on records", () => {
  freshDb();
  addProduct("X", "Projector", "Shelf 9");
  addExpense("Cleaning");
  lists.syncFromData();
  assert.ok(names("product_category").includes("Projector"));
  assert.ok(names("expense_category").includes("Cleaning"));
  assert.ok(names("storage_location").includes("Shelf 9"));
});

test("reorder saves the order the owner chose", () => {
  freshDb();
  const ids = lists.list("expense_category").map((i) => i.id).reverse();
  lists.reorder("expense_category", ids);
  assert.deepStrictEqual(lists.list("expense_category").map((i) => i.id), ids);
});

test("product category choices include archived ones still used by products", () => {
  freshDb();
  const id = lists.list("product_category").find((i) => i.name === "Printer").id;
  addProduct("P1", "Printer");
  lists.setActive(id, false);
  assert.ok(lists.usedNames("product_category").includes("Printer"));
});
