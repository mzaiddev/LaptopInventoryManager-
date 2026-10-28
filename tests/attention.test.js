const test = require("node:test");
const assert = require("node:assert");
const { freshDb, addCustomer } = require("./helpers");
const attention = require("../src/services/attentionService");

function db() {
  return require("../src/database/dbInit").getDatabase();
}

const NOW = new Date("2026-10-31T12:00:00");
const fresh = new Date("2026-10-31T09:00:00");
const ids = (opts) => attention.get({ now: NOW, lastBackupAt: fresh, ...opts }).map((i) => i.id);

function setting(key, value) {
  db().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, String(value));
}

test("a quiet shop with a recent backup has nothing to show", () => {
  freshDb();
  assert.deepStrictEqual(ids(), []);
});

test("no backup at all is the most serious item; an old backup is a warning", () => {
  freshDb();
  const none = attention.get({ now: NOW, lastBackupAt: null });
  assert.strictEqual(none[0].id, "backup");
  assert.strictEqual(none[0].level, "bad");
  const old = attention.get({ now: NOW, lastBackupAt: new Date("2026-10-27T09:00:00") });
  assert.strictEqual(old[0].id, "backup");
  assert.strictEqual(old[0].level, "warn");
  assert.match(old[0].detail, /4 days/);
});

test("customers owing for more than 30 days are counted with the amount", () => {
  freshDb();
  const c = Number(db().prepare("INSERT INTO customers (customer_name) VALUES ('Ali')").run().lastInsertRowid);
  db().prepare("INSERT INTO customer_ledger (customer_id, reference_type, debit, credit, running_balance, entry_date) VALUES (?, 'Sale', 250, 0, 250, '2026-09-01')").run(c);
  const item = attention.get({ now: NOW, lastBackupAt: fresh }).find((i) => i.id === "overdue");
  assert.strictEqual(item.count, 1);
  assert.strictEqual(item.amount, 250);
  assert.strictEqual(item.page, "customers");
});

test("low stock shows only when a level is set, and counts items at or under it", () => {
  freshDb();
  db().prepare("INSERT INTO products (product_name, category, purchase_price, selling_price, quantity) VALUES ('A','Laptop',1,2,1)").run();
  db().prepare("INSERT INTO products (product_name, category, purchase_price, selling_price, quantity) VALUES ('B','Laptop',1,2,9)").run();
  assert.ok(!ids().includes("lowstock"));
  setting("low_stock_level", 2);
  const item = attention.get({ now: NOW, lastBackupAt: fresh }).find((i) => i.id === "lowstock");
  assert.strictEqual(item.count, 1);
  assert.strictEqual(item.page, "inventory");
});

test("failed, partial and interrupted background tasks from the last 3 days are flagged", () => {
  freshDb();
  const add = (status, created) => db().prepare("INSERT INTO jobs (kind, lane, title, status, created_at) VALUES ('x','whatsapp','T',?,?)").run(status, created);
  add("done", "2026-10-30 10:00:00");
  add("failed", "2026-10-30 10:00:00");
  add("partial", "2026-10-29 10:00:00");
  add("interrupted", "2026-10-01 10:00:00"); // too old
  const item = attention.get({ now: NOW, lastBackupAt: fresh }).find((i) => i.id === "tasks");
  assert.strictEqual(item.count, 2);
  assert.strictEqual(item.action, "tasks");
});

test("a negative cash or bank balance is shown only when the owner has unlocked the amounts", () => {
  freshDb();
  setting("opening_cash", -50);
  assert.ok(!ids({ costVisible: false }).includes("cash"));
  assert.ok(ids({ costVisible: true }).includes("cash"));
});

test("items are ordered most serious first", () => {
  freshDb();
  setting("low_stock_level", 5);
  db().prepare("INSERT INTO products (product_name, category, purchase_price, selling_price, quantity) VALUES ('A','Laptop',1,2,1)").run();
  const list = attention.get({ now: NOW, lastBackupAt: null });
  assert.deepStrictEqual(list.map((i) => i.level), ["bad", "warn"]);
});

test("each alert lists who or what it is about, with a target to open", () => {
  freshDb();
  const c = Number(db().prepare("INSERT INTO customers (customer_name, phone) VALUES ('Ali', '0300-1111111')").run().lastInsertRowid);
  db().prepare("INSERT INTO customer_ledger (customer_id, reference_type, debit, credit, running_balance, entry_date) VALUES (?, 'Sale', 250, 0, 250, '2026-09-01')").run(c);
  const item = attention.get({ now: NOW, lastBackupAt: fresh }).find((i) => i.id === "overdue");
  assert.strictEqual(item.entries.length, 1);
  assert.strictEqual(item.entries[0].label, "Ali");
  assert.match(item.entries[0].detail, /Unpaid for 60 days/);
  assert.match(item.entries[0].detail, /0300-1111111/);
  assert.strictEqual(item.entries[0].amount, 250);
  assert.deepStrictEqual(item.entries[0].target, { type: "customer", id: c });
});

test("low stock names the items and failed tasks name the task", () => {
  freshDb();
  setting("low_stock_level", 2);
  const p = Number(db().prepare("INSERT INTO products (product_name, category, purchase_price, selling_price, quantity, model) VALUES ('Dell 5400', 'Laptop', 1, 2, 1, 'E5400')").run().lastInsertRowid);
  db().prepare("INSERT INTO jobs (kind, lane, title, status, error, created_at) VALUES ('backup', 'cloud', 'Upload backup', 'failed', 'No internet', '2026-10-31 08:00:00')").run();
  const items = attention.get({ now: NOW, lastBackupAt: fresh });
  const low = items.find((i) => i.id === "lowstock");
  assert.deepStrictEqual(low.entries[0].target, { type: "product", id: p });
  assert.match(low.entries[0].detail, /1 left · E5400/);
  const task = items.find((i) => i.id === "tasks");
  assert.strictEqual(task.entries[0].label, "Upload backup");
  assert.strictEqual(task.entries[0].detail, "No internet");
  assert.strictEqual(task.entries[0].target.type, "task");
});

test("only the first few are listed but the count is the full number", () => {
  freshDb();
  for (let n = 0; n < 12; n++) {
    const c = Number(db().prepare("INSERT INTO customers (customer_name) VALUES (?)").run("Cust " + n).lastInsertRowid);
    db().prepare("INSERT INTO customer_ledger (customer_id, reference_type, debit, credit, running_balance, entry_date) VALUES (?, 'Sale', ?, 0, ?, '2026-09-01')").run(c, 100 + n, 100 + n);
  }
  const item = attention.get({ now: NOW, lastBackupAt: fresh }).find((i) => i.id === "overdue");
  assert.strictEqual(item.count, 12);
  assert.strictEqual(item.entries.length, 8);
});

// ---------------- more alerts ----------------

const supplier = (name) => Number(db().prepare("INSERT INTO suppliers (name) VALUES (?)").run(name).lastInsertRowid);
const bill = (s, date, charge) => db().prepare("INSERT INTO supplier_ledger (supplier_id, entry_date, entry_type, charge) VALUES (?, ?, 'Purchase', ?)").run(s, date, charge);
const pay = (s, date, paid) => db().prepare("INSERT INTO supplier_ledger (supplier_id, entry_date, entry_type, paid, payment_source) VALUES (?, ?, 'Payment', ?, 'Cash')").run(s, date, paid);
const find = (id, opts) => attention.get({ now: NOW, lastBackupAt: fresh, ...opts }).find((i) => i.id === id);

test("WhatsApp: warns only when it was linked and is not connected", () => {
  freshDb();
  assert.strictEqual(find("whatsapp"), undefined);
  assert.strictEqual(find("whatsapp", { whatsapp: { state: "linked", saved: true } }), undefined);
  assert.strictEqual(find("whatsapp", { whatsapp: { state: "connecting", saved: true } }), undefined);
  assert.strictEqual(find("whatsapp", { whatsapp: { state: "unlinked", saved: false, error: null } }), undefined);
  assert.strictEqual(find("whatsapp", { whatsapp: { state: "unlinked", saved: true } }).level, "warn");
  assert.match(find("whatsapp", { whatsapp: { state: "unlinked", saved: false, error: "WhatsApp was unlinked on the phone." } }).detail, /unlinked on the phone/);
});

test("Google Drive: not connected is a hint, a failing upload is a warning", () => {
  freshDb();
  assert.strictEqual(find("drive-off"), undefined);
  assert.strictEqual(find("drive-off", { drive: { connected: false } }).level, "info");
  assert.strictEqual(find("drive-off", { drive: { connected: true } }), undefined);
  const failing = find("drive-failing", { drive: { connected: true, error: "Google Drive request failed (403)." } });
  assert.strictEqual(failing.level, "warn");
  assert.match(failing.detail, /403/);
});

test("suppliers owed past 30 days are listed; payments clear the oldest bill first", () => {
  freshDb();
  const a = supplier("TechSource");
  bill(a, "2026-08-01", 1000);
  const b = supplier("Fresh Co");
  bill(b, "2026-10-20", 500);
  const c = supplier("Paid Up");
  bill(c, "2026-08-01", 700);
  pay(c, "2026-08-10", 700);
  const d = supplier("Part Paid");
  bill(d, "2026-08-01", 400);
  bill(d, "2026-10-25", 300);
  pay(d, "2026-09-01", 400);
  const item = find("suppliers");
  assert.strictEqual(item.count, 1);
  assert.strictEqual(item.entries[0].label, "TechSource");
  assert.strictEqual(item.entries[0].amount, 1000);
  assert.deepStrictEqual(item.entries[0].target, { type: "supplier", id: a });
  assert.match(item.entries[0].detail, /91 days/);
});

test("instalments due this week are listed before they are late", () => {
  freshDb();
  const c = addCustomer("Ali");
  const sale = Number(db().prepare("INSERT INTO sale_issues (reference_no, customer_id, issue_date, total_amount, paid_amount, remaining_amount) VALUES ('INV-1', ?, '2026-10-01', 900, 0, 900)").run(c).lastInsertRowid);
  require("../src/services/instalmentService").createPlan({ sale_issue_id: sale, count: 3, first_due_date: "2026-11-03", interval_days: 30 });
  const item = find("instalments-soon");
  assert.strictEqual(item.count, 1);
  assert.strictEqual(item.entries[0].label, "Ali");
  assert.match(item.entries[0].detail, /in 3 days/);
  assert.strictEqual(find("instalments"), undefined);
});

test("repairs that are Ready are listed with how long they have waited", () => {
  freshDb();
  const c = addCustomer("Ali");
  const service = require("../src/services/serviceJobService");
  const { id } = service.add({ customer_id: c, device: "HP 840", fault: "Screen", charge: 0, received_date: "2026-10-20" });
  assert.strictEqual(find("service-ready"), undefined);
  service.setStatus(id, "Repairing");
  service.setStatus(id, "Ready", { date: "2026-10-26" });
  const item = find("service-ready");
  assert.strictEqual(item.count, 1);
  assert.match(item.entries[0].label, /Ali · HP 840/);
  assert.match(item.entries[0].detail, /ready for 5 days/);
  assert.deepStrictEqual(item.entries[0].target, { type: "servicejob", id });
});

test("yesterday with activity but no closing is flagged; closed or quiet days are not", () => {
  freshDb();
  assert.strictEqual(find("day-not-closed"), undefined);
  const c = addCustomer("Ali");
  db().prepare("INSERT INTO sale_issues (reference_no, customer_id, issue_date, total_amount, paid_amount, remaining_amount) VALUES ('INV-9', ?, '2026-10-30', 100, 100, 0)").run(c);
  const item = find("day-not-closed");
  assert.match(item.detail, /2026-10-30/);
  db().prepare("INSERT INTO day_closings (closing_date, expected_cash, counted_cash, difference) VALUES ('2026-10-30', 0, 0, 0)").run();
  assert.strictEqual(find("day-not-closed"), undefined);
});
