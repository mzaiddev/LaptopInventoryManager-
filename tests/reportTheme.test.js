const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// The renderer utilities only need a tiny DOM stand-in (an HTML escaper).
function load() {
  const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sandbox = { window: {}, document: { createElement: () => ({ set textContent(v) { this.v = esc(v); }, get innerHTML() { return this.v; } }) } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of ["shopInfo.js", "reportTheme.js"]) {
    const code = fs.readFileSync(path.join(__dirname, "../src/renderer/utils", f), "utf8").replace(/^const (ShopInfo|ReportTheme) =/m, "var $1 =");
    vm.runInContext(code, sandbox);
  }
  return sandbox.ReportTheme;
}

const T = load();

test("every payment status is a word plus a distinct style, so it reads without colour", () => {
  const paid = T.paymentBadge("Paid");
  const partial = T.paymentBadge("Partial");
  const due = T.paymentBadge("Outstanding");
  assert.match(paid, /class="badge ok">Paid</);
  assert.match(partial, /class="badge warn">Partial</);
  assert.match(due, /class="badge bad">Due</);
  assert.strictEqual(T.paymentBadge("unpaid"), T.paymentBadge("Outstanding"));
  const css = T.css();
  assert.match(css, /\.badge\.bad \{[^}]*background: var\(--bad\)/); // solid dark fill
  assert.match(css, /\.badge\.warn \{[^}]*border-style: dashed/); // dashed outline
});

test("stock statuses map to ok / warn / bad and always keep their text", () => {
  assert.match(T.stockBadge("In Stock"), /badge ok">In Stock</);
  assert.match(T.stockBadge("Reserved"), /badge warn">Reserved</);
  assert.match(T.stockBadge("Damaged"), /badge bad">Damaged</);
});

test("the amount due sits in a labelled box; a settled account uses the ok style", () => {
  const due = T.dueBox({ label: "Total amount due", amount: "PKR 150,000", tone: "bad" });
  assert.ok(due.includes("Total amount due") && due.includes("PKR 150,000") && !due.includes("duebox ok"));
  assert.ok(T.dueBox({ label: "Account settled", amount: "PKR 0", tone: "ok" }).includes("duebox ok"));
});

test("the how-to-pay box needs payment details and shows every number the shop entered", () => {
  assert.strictEqual(T.paymentBox({ shop_name: "Zia" }), "");
  const box = T.paymentBox({ easypaisa_number: "0345-3333333", bank_name: "HBL", bank_account_number: "1234-5678" });
  assert.ok(box.includes("How to pay") && box.includes("0345-3333333") && box.includes("HBL - 1234-5678"));
});

test("the header shows the shop name, both phone numbers, address and map link", () => {
  const html = T.header({
    shop: { shop_name: "Zia Laptop Dealer", shop_address: "Hall Road", phone_number: "0300-1", phone_number_2: "0321-2", google_map_link: "https://maps.app/x" },
    title: "Customer Statement",
    meta: [["Date", "Oct 28, 2026"]],
  });
  for (const part of ["Zia Laptop Dealer", "Hall Road", "0300-1 | 0321-2", "https://maps.app/x", "Customer Statement", "Oct 28, 2026"]) assert.ok(html.includes(part), part);
});

test("untrusted text is escaped, and colours are kept when printing", () => {
  assert.ok(T.badge("ok", "<b>x</b>").includes("&lt;b&gt;"));
  assert.match(T.css(), /print-color-adjust: exact/);
  assert.match(T.wrap({ title: "T", body: "<p>x</p>", landscape: true }), /size: A4 landscape/);
});

test("a discount is shown as a percent of the price it came off", () => {
  assert.strictEqual(T.pct(7800, 78000), "10%");
  assert.strictEqual(T.pct(380, 2000), "19%");
  assert.strictEqual(T.pct(100, 3000), "3.33%");
  assert.strictEqual(T.pct(0, 3000), "");
  assert.strictEqual(T.pct(50, 0), "");
});
