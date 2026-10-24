const test = require("node:test");
const assert = require("node:assert");
const { normalizePhone, whatsappLinks, safeFileName } = require("../src/services/whatsapp");

const n = (raw) => normalizePhone(raw, "92");

test("normalizePhone: local, international and already-prefixed numbers", () => {
  assert.strictEqual(n("0300-123 4567"), "923001234567");
  assert.strictEqual(n("+92 300 1234567"), "923001234567");
  assert.strictEqual(n("923001234567"), "923001234567");
  assert.strictEqual(n("00923001234567"), "923001234567");
  assert.strictEqual(n("3001234567"), "923001234567");
  assert.strictEqual(n("+971 50 123 4567"), "971501234567");
});

test("normalizePhone: empty, letters and too-short input give null", () => {
  for (const bad of ["", "   ", "abc", "123", null, undefined]) assert.strictEqual(n(bad), null, String(bad));
});

test("whatsappLinks encodes newlines and spaces for both the app and the web link", () => {
  const [app, web] = whatsappLinks("923001234567", "Dear Ali,\nTotal: PKR 12.5K");
  assert.strictEqual(app, "whatsapp://send?phone=923001234567&text=Dear%20Ali%2C%0ATotal%3A%20PKR%2012.5K");
  assert.strictEqual(web, "https://wa.me/923001234567?text=Dear%20Ali%2C%0ATotal%3A%20PKR%2012.5K");
});

test("safeFileName strips path characters and keeps names usable", () => {
  assert.strictEqual(safeFileName('Ali / Sons: "Co"?'), "Ali _ Sons_ _Co__");
  assert.strictEqual(safeFileName("  "), "statement");
  assert.strictEqual(safeFileName("..\\..\\evil"), ".._.._evil");
});
