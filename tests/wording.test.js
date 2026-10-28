const test = require("node:test");
const assert = require("node:assert");
const wording = require("../src/shared/wording");

test("a general store sees Item where a laptop dealer sees Product", () => {
  assert.strictEqual(wording.rewrite("Add Product", "general_store"), "Add Item");
  assert.strictEqual(wording.rewrite("Products", "general_store"), "Items");
  assert.strictEqual(wording.rewrite("No products yet", "general_store"), "No items yet");
  assert.strictEqual(wording.rewrite("Search by product name", "general_store"), "Search by item name");
});

test("other business types keep the original wording", () => {
  assert.strictEqual(wording.rewrite("Add Product", "laptop_dealer"), "Add Product");
  assert.strictEqual(wording.rewrite("Add Product", "custom"), "Add Product");
  assert.strictEqual(wording.rewrite("Add Product", undefined), "Add Product");
});

test("only whole words change, so other words that contain product are left alone", () => {
  assert.strictEqual(wording.rewrite("Production", "general_store"), "Production");
  assert.strictEqual(wording.rewrite("Byproduct", "general_store"), "Byproduct");
});

test("text without the word is returned as it came", () => {
  assert.strictEqual(wording.rewrite("Customers", "general_store"), "Customers");
  assert.strictEqual(wording.rewrite("", "general_store"), "");
});
