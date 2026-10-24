const test = require("node:test");
const assert = require("node:assert");
const { roundMoney } = require("../src/utils/money");

test("roundMoney rounds half away from zero to 2 decimals", () => {
  assert.strictEqual(roundMoney(1.005), 1.01);
  assert.strictEqual(roundMoney(-2.345), -2.35);
  assert.strictEqual(roundMoney(0.1 + 0.2), 0.3);
});

test("roundMoney treats null/NaN as 0", () => {
  assert.strictEqual(roundMoney(null), 0);
  assert.strictEqual(roundMoney(NaN), 0);
});
