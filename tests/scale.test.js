const test = require("node:test");
const assert = require("node:assert");
const { freshDb } = require("./helpers");
const ledger = require("../src/services/ledgerService");
const inventory = require("../src/services/inventoryService");

// A shop with 3,000 customers and 1,000 products must stay snappy (spec: < 100 ms per search).
test("search over 3000 customers and 1000 products is fast", () => {
  const db = freshDb();
  db.transaction(() => {
    const c = db.prepare("INSERT INTO customers (customer_name, phone, address) VALUES (?, ?, ?)");
    for (let i = 0; i < 3000; i++) c.run(`Customer ${i} Traders`, `0300${String(i).padStart(7, "0")}`, `Street ${i}`);
    const p = db.prepare("INSERT INTO products (product_name, category, model, serial_number, quantity) VALUES (?, 'Laptop', ?, ?, 5)");
    for (let i = 0; i < 1000; i++) p.run(`Dell Latitude ${i}`, `E${i}`, `SN${i}`);
  })();

  let t = process.hrtime.bigint();
  const found = ledger.searchCustomers("Customer 29");
  let ms = Number(process.hrtime.bigint() - t) / 1e6;
  assert.ok(found.length > 0);
  assert.ok(ms < 100, `customer search took ${ms.toFixed(1)} ms`);

  t = process.hrtime.bigint();
  const prods = inventory.getAllProducts({ search: "Latitude 99", limit: 50 });
  ms = Number(process.hrtime.bigint() - t) / 1e6;
  assert.ok(prods.products.length > 0);
  assert.ok(ms < 100, `product search took ${ms.toFixed(1)} ms`);
});
