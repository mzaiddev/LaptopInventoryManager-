const test = require("node:test");
const assert = require("node:assert");
const { freshDb } = require("./helpers");
const inventory = require("../src/services/inventoryService");

function product(name, status, quantity) {
  require("../src/database/dbInit").getDatabase()
    .prepare("INSERT INTO products (product_name, category, purchase_price, selling_price, quantity, status) VALUES (?, 'Laptop', 1, 2, ?, ?)")
    .run(name, quantity, status);
}

test("the 'available' status filter shows what can be sold and hides sold, damaged and empty rows", () => {
  freshDb();
  product("In stock", "In Stock", 3);
  product("Reserved", "Reserved", 1);
  product("Sold out", "Sold", 0);
  product("Empty but marked in stock", "In Stock", 0);
  product("Damaged", "Damaged", 2);

  const names = (filters) => inventory.getAllProducts(filters).products.map((p) => p.product_name).sort();
  assert.deepStrictEqual(names({ status: "available" }), ["In stock", "Reserved"]);
  assert.strictEqual(inventory.getAllProducts({ status: "available" }).total, 2);
  // An empty filter and a real status keep their old meaning.
  assert.strictEqual(names({}).length, 5);
  assert.deepStrictEqual(names({ status: "Damaged" }), ["Damaged"]);
});
