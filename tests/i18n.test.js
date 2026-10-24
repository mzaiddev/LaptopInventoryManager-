const test = require("node:test");
const assert = require("node:assert");
const { createTranslator } = require("../src/shared/i18n");
const ur = require("../src/shared/ur");

const t = createTranslator(ur);

test("exact phrases translate and keep surrounding whitespace", () => {
  assert.strictEqual(t("Dashboard"), "ڈیش بورڈ");
  assert.strictEqual(t("  Dashboard \n"), "  ڈیش بورڈ \n");
  assert.strictEqual(t("Sales   History"), "فروخت کی تاریخ"); // inner spaces collapse
});

test("unknown text, numbers and empty text pass through unchanged", () => {
  assert.strictEqual(t("Zia Laptop"), "Zia Laptop");
  assert.strictEqual(t("PKR 175,500"), "PKR 175,500");
  assert.strictEqual(t(""), "");
  assert.strictEqual(t("   "), "   ");
  assert.strictEqual(t("12345"), "12345");
});

test("a label that ends in a colon translates and keeps the value after it", () => {
  assert.strictEqual(t("Phone: 0300-1234567"), "فون: 0300-1234567");
  assert.strictEqual(t("Total Sales: PKR 90,000"), "کل فروخت: PKR 90,000");
});

test("an error prefix translates and the server text after it is translated when known", () => {
  assert.strictEqual(t("Failed to add product: Customer not found"), "پروڈکٹ شامل نہیں ہو سکی: گاہک نہیں ملا");
  assert.strictEqual(t("Failed to add product: weird unknown text"), "پروڈکٹ شامل نہیں ہو سکی: weird unknown text");
});

test("a label followed by an amount translates the label only", () => {
  assert.strictEqual(t("Cash PKR 20,000"), "نقد PKR 20,000");
});

test("dates are written day, Urdu month, year", () => {
  assert.strictEqual(t("Oct 24, 2026"), "24 اکتوبر 2026");
  assert.strictEqual(t("Aug 1, 2026"), "1 اگست 2026");
});

test("K, M and B suffixes become Urdu words", () => {
  assert.strictEqual(t("PKR 175.5K"), "PKR 175.5 ہزار");
  assert.strictEqual(t("PKR 3.2M"), "PKR 3.2 ملین");
  assert.strictEqual(t("-PKR 12K"), "-PKR 12 ہزار");
  assert.strictEqual(t("1.5B"), "1.5 ارب");
});

test("counts with a word are translated", () => {
  assert.strictEqual(t("2 sales"), "2 فروخت");
  assert.strictEqual(t("1 customers"), "1 گاہک");
  assert.strictEqual(t("3 returns"), "3 واپسیاں");
  assert.strictEqual(t("Page 2 of 5"), "صفحہ 2 از 5");
  assert.strictEqual(t("7 entries"), "7 اندراجات");
});

test("segments joined by a dot are translated one by one", () => {
  assert.strictEqual(t("Cash PKR 0 · Bank PKR 50K"), "نقد PKR 0 · بینک PKR 50 ہزار");
});

test("a word that merely starts like a phrase is not mangled", () => {
  assert.strictEqual(t("Salesman Ali"), "Salesman Ali");
  assert.strictEqual(t("Cashew"), "Cashew");
});

test("translating twice gives the same result", () => {
  const once = t("Total Sales: PKR 1K");
  assert.strictEqual(t(once), once);
});

test("sort arrows, ledger descriptions, and counts in other shapes", () => {
  assert.strictEqual(t("Created ▼"), "بنایا گیا ▼");
  assert.strictEqual(t("Sale SALE-20261024-0001"), "فروخت SALE-20261024-0001");
  assert.strictEqual(t("Payment for SALE-1 - Bank"), "SALE-1 کی ادائیگی - بینک");
  assert.strictEqual(t("$50,000 received"), "$50,000 وصول ہوئے");
  assert.strictEqual(t("1 item(s)"), "1 آئٹم");
  assert.strictEqual(t("Rent: $20,000"), "کرایہ: $20,000");
  assert.strictEqual(t("Cash: $20,000 Bank: $0"), "نقد: $20,000 بینک: $0");
  assert.strictEqual(t("Bob Laptops - SALE-1 (Cash)"), "Bob Laptops - SALE-1 (نقد)");
});

test("dialogs and toasts with names or counts inside", () => {
  assert.strictEqual(t('Are you sure you want to delete "Ali"? This action cannot be undone.'), 'کیا آپ واقعی "Ali" حذف کرنا چاہتے ہیں؟ یہ عمل واپس نہیں ہو سکتا۔');
  assert.strictEqual(t("Sale saved! Reference: SALE-1"), "فروخت محفوظ ہو گئی! حوالہ: SALE-1");
  assert.strictEqual(t("Status updated to Sold"), "حالت اپ ڈیٹ ہو کر فروخت شدہ");
  assert.strictEqual(t("Condition updated to Good"), "کنڈیشن اپ ڈیٹ ہو کر اچھا");
  assert.strictEqual(t("Printing 3 record(s)..."), "3 ریکارڈ پرنٹ ہو رہے ہیں...");
  assert.match(t('Are you sure you want to delete "Ali"? This will permanently delete the customer and ALL their data (sales, returns, old balances, payments, ledger entries). Stock will be restored. This action cannot be undone.'), /مستقل طور پر حذف/);
});
