const test = require("node:test");
const assert = require("node:assert");
const { stripCost } = require("../src/services/costMask");
const { requireSuper } = require("../src/ipc/guard");

const p = () => ({ id: 1, product_name: "Dell", purchase_price: 800, selling_price: 1000 });

test("stripCost nulls purchase_price on a product, an array, and a {products} page when hidden", () => {
  assert.strictEqual(stripCost(p(), false).purchase_price, null);
  assert.deepStrictEqual(stripCost([p(), p()], false).map((x) => x.purchase_price), [null, null]);
  assert.deepStrictEqual(stripCost({ products: [p()], total: 1 }, false).products[0].purchase_price, null);
  assert.strictEqual(stripCost({ damages: [p()] }, false).damages[0].purchase_price, null);
});

test("stripCost leaves data alone when visible, never mutates its input, keeps other fields", () => {
  const orig = p();
  assert.strictEqual(stripCost(orig, true).purchase_price, 800);
  const out = stripCost(orig, false);
  assert.strictEqual(orig.purchase_price, 800);
  assert.strictEqual(out.selling_price, 1000);
  assert.strictEqual(stripCost(null, false), null);
});

test("requireSuper blocks without a granted super-password and does not run the handler", async () => {
  let ran = false;
  const auth = { consumeSuper: () => false };
  const h = requireSuper(auth, async () => { ran = true; return { success: true }; });
  assert.deepStrictEqual(await h({}, 1), { success: false, error: "SUPER_REQUIRED" });
  assert.strictEqual(ran, false);
});

test("requireSuper runs the handler once per grant", async () => {
  let grants = 1;
  const auth = { consumeSuper: () => grants-- > 0 };
  const h = requireSuper(auth, async (e, id) => ({ success: true, data: id }));
  assert.deepStrictEqual(await h({}, 7), { success: true, data: 7 });
  assert.strictEqual((await h({}, 7)).error, "SUPER_REQUIRED");
});

test("requireSuper gives the grant back when the handler fails, so the form can be corrected and resaved", async () => {
  let granted = true;
  const auth = { consumeSuper: () => { const g = granted; granted = false; return g; }, restoreSuper: () => { granted = true; } };
  const h = requireSuper(auth, async () => ({ success: false, error: "Name is required" }));
  assert.strictEqual((await h({})).error, "Name is required");
  assert.strictEqual(granted, true);
  const ok = requireSuper(auth, async () => ({ success: true }));
  await ok({});
  assert.strictEqual(granted, false);
});
