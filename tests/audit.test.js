const test = require("node:test");
const assert = require("node:assert");
const { freshDb } = require("./helpers");
const audit = require("../src/services/auditService");

test("log then list returns entries newest first with parsed detail", () => {
  freshDb();
  audit.log("sale.delete", "sale", 7, { ref: "SALE-1" });
  audit.log("product.edit", "product", 3);
  const rows = audit.list({ page: 1, pageSize: 10 });
  assert.deepStrictEqual(rows.map((r) => r.action), ["product.edit", "sale.delete"]);
  assert.deepStrictEqual(rows[1].detail, { ref: "SALE-1" });
  assert.strictEqual(rows[1].entity_id, 7);
});

test("audit never throws into the caller, even when the table is missing", () => {
  const db = freshDb();
  db.exec("DROP TABLE audit_log");
  assert.doesNotThrow(() => audit.log("x", "y", 1));
});
