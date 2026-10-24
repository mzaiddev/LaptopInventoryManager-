const test = require("node:test");
const assert = require("node:assert");
const { computeSaleTotals } = require("../src/shared/saleMath");

test("no discount: total is the sum of lines", () => {
  const t = computeSaleTotals([{ quantity: 2, unit_price: 1000 }, { quantity: 1, unit_price: 500 }]);
  assert.deepStrictEqual([t.gross, t.itemDiscount, t.subtotal, t.saleDiscount, t.total], [2500, 0, 2500, 0, 2500]);
});

test("item discount then percent sale discount", () => {
  const t = computeSaleTotals([{ quantity: 2, unit_price: 1000, discount_amount: 200 }], "percent", 10);
  assert.deepStrictEqual([t.gross, t.itemDiscount, t.subtotal, t.saleDiscount, t.total], [2000, 200, 1800, 180, 1620]);
  assert.deepStrictEqual(t.lines, [{ gross: 2000, discount: 200, net: 1800 }]);
});

test("flat amount sale discount", () => {
  assert.strictEqual(computeSaleTotals([{ quantity: 1, unit_price: 1000 }], "amount", 150).total, 850);
});

test("discount equal to the whole sale is allowed and gives 0", () => {
  assert.strictEqual(computeSaleTotals([{ quantity: 1, unit_price: 1000 }], "amount", 1000).total, 0);
  assert.strictEqual(computeSaleTotals([{ quantity: 1, unit_price: 1000 }], "percent", 100).total, 0);
});

test("rejects discounts that exceed what they apply to", () => {
  const one = [{ quantity: 1, unit_price: 1000 }];
  assert.throws(() => computeSaleTotals([{ quantity: 1, unit_price: 1000, discount_amount: 1001 }]), /item discount/i);
  assert.throws(() => computeSaleTotals(one, "percent", 101), /percent/i);
  assert.throws(() => computeSaleTotals(one, "amount", 1001), /sale discount/i);
  assert.throws(() => computeSaleTotals(one, "amount", -5), /negative/i);
  assert.throws(() => computeSaleTotals(one, "percent", -1), /percent/i);
  assert.throws(() => computeSaleTotals([{ quantity: 1, unit_price: 1000, discount_amount: -1 }]), /negative/i);
});

test("rejects bad quantity, price and discount type", () => {
  assert.throws(() => computeSaleTotals([{ quantity: 0, unit_price: 10 }]), /quantity/i);
  assert.throws(() => computeSaleTotals([{ quantity: 1, unit_price: -1 }]), /price/i);
  assert.throws(() => computeSaleTotals([{ quantity: 1, unit_price: 10 }], "weird", 1), /discount type/i);
  assert.throws(() => computeSaleTotals([]), /at least one/i);
});

test("percent discount rounds to 2 decimals", () => {
  const t = computeSaleTotals([{ quantity: 1, unit_price: 999 }], "percent", 3.33);
  assert.strictEqual(t.saleDiscount, 33.27);
  assert.strictEqual(t.total, 965.73);
});
