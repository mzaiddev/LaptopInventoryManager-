const { initDatabase, closeDatabase } = require("../src/database/dbInit");

// Fresh in-memory DB with the full production schema.
function freshDb() {
  closeDatabase();
  return initDatabase(":memory:");
}

module.exports = { freshDb, closeDatabase };

function addCustomer(name = "Ali") {
  const { getDatabase } = require("../src/database/dbInit");
  return Number(getDatabase().prepare("INSERT INTO customers (customer_name) VALUES (?)").run(name).lastInsertRowid);
}

function addProduct({ name = "Dell 5400", qty = 10, purchase = 800, selling = 1000 } = {}) {
  const { getDatabase } = require("../src/database/dbInit");
  return Number(
    getDatabase()
      .prepare("INSERT INTO products (product_name, category, purchase_price, selling_price, quantity) VALUES (?, 'Laptop', ?, ?, ?)")
      .run(name, purchase, selling, qty).lastInsertRowid,
  );
}

Object.assign(module.exports, { addCustomer, addProduct });
