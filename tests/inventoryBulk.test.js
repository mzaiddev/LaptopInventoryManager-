const test = require('node:test');
const assert = require('node:assert');
const { freshDb, closeDatabase, addProduct } = require('./helpers');
const { getDatabase } = require('../src/database/dbInit');
const inventory = require('../src/services/inventoryService');

test('bulk edit updates selected products atomically and computes price percentages', () => {
  freshDb();
  const a = addProduct({ name:'A', qty:3, selling:100 });
  const b = addProduct({ name:'B', qty:2, selling:200 });
  const result = inventory.bulkUpdateProducts([a,b], { field:'price_percent', value:'10' });
  assert.strictEqual(result.updated, 2);
  assert.deepStrictEqual(getDatabase().prepare('SELECT selling_price FROM products ORDER BY id').all().map((x) => x.selling_price), [110,220]);
  inventory.bulkUpdateProducts([a,b], { field:'category', value:'Refurbished' });
  assert.deepStrictEqual(getDatabase().prepare('SELECT category FROM products ORDER BY id').all().map((x) => x.category), ['Refurbished','Refurbished']);
  closeDatabase();
});

test('bulk edit rejects unsafe status changes and rolls the whole selection back', () => {
  freshDb();
  const a = addProduct({ name:'A', qty:3, selling:100 });
  const b = addProduct({ name:'B', qty:0, selling:200 });
  assert.throws(() => inventory.bulkUpdateProducts([a,b], { field:'status', value:'In Stock' }), /no stock/);
  assert.deepStrictEqual(getDatabase().prepare('SELECT status FROM products ORDER BY id').all().map((x) => x.status), ['In Stock','In Stock']);
  assert.throws(() => inventory.bulkUpdateProducts([a], { field:'status', value:'Sold' }), /individual sale/);
  assert.throws(() => inventory.bulkUpdateProducts([a], { field:'price_amount', value:'-200' }), /negative sale price/);
  closeDatabase();
});

test('CSV import helper creates new products and refuses duplicate serial numbers', () => {
  const db = freshDb();
  const service = require('../src/services/inventoryService');
  const base = { product_name:'Import Laptop', category:'Laptop', purchase_price:10, selling_price:20, quantity:1, serial_number:'CSV-001' };
  const result = service.importProduct(base);
  assert.ok(result.id > 0);
  assert.throws(() => service.importProduct({ ...base, product_name:'Duplicate Laptop', serial_number:' csv-001 ' }), /Serial number already exists/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM products').get().n, 1);
});
