// Text translation engine (pure). Used by the renderer's DOM layer and by the tests.
(function (root) {
  const MONTHS = {
    Jan: "جنوری", Feb: "فروری", Mar: "مارچ", Apr: "اپریل", May: "مئی", Jun: "جون",
    Jul: "جولائی", Aug: "اگست", Sep: "ستمبر", Oct: "اکتوبر", Nov: "نومبر", Dec: "دسمبر",
  };
  const UNITS = { K: "ہزار", M: "ملین", B: "ارب" };

  const INLINE = [
    [/\((\d+) items?\)/g, "($1 آئٹمز)"],
    [/\((Sale)\)/g, "(فروخت)"],
    [/\((Issue)\)/g, "(اجراء)"],
    [/\b(AM)\b/g, "صبح"],
    [/\b(PM)\b/g, "شام"],
    [/\((Cash)\)/g, "(نقد)"],
    [/\((Bank)\)/g, "(بینک)"],
    [/\bCash:/g, "نقد:"],
    [/\bBank:/g, "بینک:"],
    [/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s+(\d{4})\b/g, (m, mo, d, y) => `${d} ${MONTHS[mo]} ${y}`],
    [/(\d(?:\.\d+)?)([KMB])\b/g, (m, n, u) => `${n} ${UNITS[u]}`],
  ];

  const FULL = [
    [/^(\d+) transactions?$/, "$1 لین دین"],
    [/^Selected: (\d+)\/(\d+)$/, "منتخب: $1/$2"],
    [/^This is a computer-generated statement from (.+)$/, "یہ $1 کی طرف سے کمپیوٹر سے تیار کردہ اسٹیٹمنٹ ہے"],
    [/^(\d+) item\(s\)$/, "$1 آئٹم"],
    [/^Sale (SALE-\S+)$/, "فروخت $1"],
    [/^Return (RET-\S+)$/, "واپسی $1"],
    [/^Payment for (\S+) - Cash$/, "$1 کی ادائیگی - نقد"],
    [/^Payment for (\S+) - Bank$/, "$1 کی ادائیگی - بینک"],
    [/^(.+) received$/, "$1 وصول ہوئے"],
    [/^(\d+) sales$/, "$1 فروخت"],
    [/^(\d+) customers$/, "$1 گاہک"],
    [/^(\d+) suppliers$/, "$1 سپلائرز"],
    [/^messages? will be sent automatically on WhatsApp(?: from (\+\d+))?\.$/, (m, p) => "پیغامات واٹس ایپ پر خود بخود بھیجے جائیں گے" + (p ? " (" + p + " سے)" : "") + "۔"],
    [/^They go out a few seconds apart to keep your number safe, so this takes about (a|\d+) minutes?\. Keep this window open until it says All done\.$/, (m, n) => "یہ چند سیکنڈ کے وقفے سے جاتے ہیں تاکہ آپ کا نمبر محفوظ رہے، اس لیے تقریباً " + (n === "a" ? "ایک" : n) + " منٹ لگیں گے۔ سب مکمل ہونے تک یہ ونڈو کھلی رکھیں۔"],
    [/^Sending (\d+) of (\d+)$/, "بھیجا جا رہا ہے $1 از $2"],
    [/^Sent (\d+) of (\d+) messages\.$/, "$2 میں سے $1 پیغام بھیجے گئے۔"],
    [/^Opened (\d+) of (\d+) chats\.$/, "$2 میں سے $1 چیٹ کھولی گئیں۔"],
    [/^Not sent \((\d+)\):$/, "نہیں بھیجے گئے ($1):"],
    [/^(\d+) returns$/, "$1 واپسیاں"],
    [/^(\d+) entries$/, "$1 اندراجات"],
    [/^(\d+) (?:problem\(s\)|problems?)$/, "$1 مسائل"],
    [/^Page (\d+) of (\d+)$/, "صفحہ $1 از $2"],
    [/^Found (\d+) problem\(s\):$/, "$1 مسائل ملے:"],
    [/^Dear (.+),$/, "محترم $1،"],
    [/^Here is your account statement from (.+) \((.+)\)\.$/, "یہ $1 کی طرف سے آپ کا اکاؤنٹ اسٹیٹمنٹ ہے ($2)۔"],
    [/^Printing (\d+) record\(s\)\.\.\.$/, "$1 ریکارڈ پرنٹ ہو رہے ہیں..."],
    [/^Sale saved! Reference: (.+)$/, "فروخت محفوظ ہو گئی! حوالہ: $1"],
    [/^Damage recorded\. Reference: (.+)$/, "نقصان درج ہو گیا۔ حوالہ: $1"],
    [/^Are you sure you want to delete "(.+)"\? This action cannot be undone\.$/, "کیا آپ واقعی \"$1\" حذف کرنا چاہتے ہیں؟ یہ عمل واپس نہیں ہو سکتا۔"],
    [/^Are you sure you want to delete "(.+)"\? This will permanently delete the customer and ALL their data \(sales, returns, old balances, payments, ledger entries\)\. Stock will be restored\. This action cannot be undone\.$/, "کیا آپ واقعی \"$1\" حذف کرنا چاہتے ہیں؟ گاہک اور اس کا تمام ڈیٹا (فروخت، واپسیاں، پرانے بیلنس، ادائیگیاں، کھاتے کے اندراجات) مستقل طور پر حذف ہو جائے گا۔ اسٹاک بحال ہو جائے گا۔ یہ عمل واپس نہیں ہو سکتا۔"],
    [/^Are you sure you want to restore "(.+)"\? This will replace your current database and restart the application\.$/, "کیا آپ واقعی \"$1\" بحال کرنا چاہتے ہیں؟ یہ آپ کا موجودہ ڈیٹا بیس بدل دے گا اور ایپلیکیشن دوبارہ شروع ہوگی۔"],
    [/^Are you sure you want to restore from "(.+)"\? This will replace your current database and restart the application\. Make sure you have a current backup before proceeding\.$/, "کیا آپ واقعی \"$1\" سے بحال کرنا چاہتے ہیں؟ یہ آپ کا موجودہ ڈیٹا بیس بدل دے گا اور ایپلیکیشن دوبارہ شروع ہوگی۔ آگے بڑھنے سے پہلے یقینی بنائیں کہ آپ کے پاس تازہ بیک اپ ہے۔"],
    [/^Are you sure you want to restore (\d+) unit\(s\) back to stock\? This will: - Add (\d+) back to the product quantity - Mark this damage record as "Restored" - The product becomes available for sale again$/, "کیا آپ واقعی $1 یونٹ اسٹاک میں واپس لانا چاہتے ہیں؟ اس سے: - پروڈکٹ کی مقدار میں $2 واپس شامل ہوں گے - یہ نقصان کا ریکارڈ \"بحال شدہ\" ہو جائے گا - پروڈکٹ دوبارہ فروخت کے لیے دستیاب ہو جائے گی"],
  ];

  // These need to translate a part of the sentence (a status, a condition).
  const PARTS = [
    [/^(.+) - (Sale|Issue)$/, (m, lookup) => lookup(m[1]) + " - " + lookup(m[2])],
    [/^Generated on (.+)$/, (m, lookup) => "تیاری کی تاریخ: " + lookup(m[1])],
    [/^Invoice (\S+) \((.+)\)$/, (m, lookup) => `انوائس ${m[1]} (${lookup(m[2])})`],
    [/^Status updated to (.+)$/, (m, lookup) => "حالت اپ ڈیٹ ہو کر " + lookup(m[1])],
    [/^Condition updated to (.+)$/, (m, lookup) => "کنڈیشن اپ ڈیٹ ہو کر " + lookup(m[1])],
  ];

  const norm = (s) => s.replace(/\s+/g, " ").trim();

  function createTranslator(dict) {
    const has = (k) => Object.prototype.hasOwnProperty.call(dict, k);
    const prefixKeys = Object.keys(dict).filter((k) => k.length >= 3).sort((a, b) => b.length - a.length);
    const cache = new Map();

    function inline(s) {
      return INLINE.reduce((acc, [re, fn]) => acc.replace(re, fn), s);
    }

    function lookup(core) {
      if (has(core)) return dict[core];
      for (const [re, rep] of FULL) if (re.test(core)) return core.replace(re, rep);
      for (const [re, fn] of PARTS) {
        const m = core.match(re);
        if (m) return fn(m, lookup);
      }
      if (core.includes(" · ")) return core.split(" · ").map(lookup).join(" · ");
      if (core.includes(" | ")) return core.split(" | ").map(lookup).join(" | ");
      const arrow = core.match(/^(.+?) ([▲▼])$/);
      if (arrow) return lookup(arrow[1]) + " " + arrow[2];
      for (const key of prefixKeys) {
        if (!core.startsWith(key) || core.length === key.length) continue;
        const rest = core.slice(key.length);
        const labelled = key.endsWith(":");
        const beforeAmount = /^:?\s+(?:[\d$(\-–]|[A-Z]{3}\s?[\d-])/.test(rest);
        if (!labelled && !beforeAmount) continue;
        const colon = rest.startsWith(":") ? ":" : "";
        const tail = rest.slice(colon.length);
        return dict[key] + colon + (tail.startsWith(" ") ? " " : "") + lookup(tail.trim());
      }
      return inline(core);
    }

    return function translate(text) {
      if (typeof text !== "string") return text;
      const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
      const core = norm(m[2]);
      if (!core) return text;
      let out = cache.get(core);
      if (out === undefined) {
        out = lookup(core);
        cache.set(core, out);
      }
      return out === core ? text : m[1] + out + m[3];
    };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { createTranslator };
  else root.createTranslator = createTranslator;
})(typeof window !== "undefined" ? window : globalThis);
