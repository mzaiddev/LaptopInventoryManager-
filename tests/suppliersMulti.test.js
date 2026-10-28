const test = require("node:test");
const assert = require("node:assert");
const { freshDb, addCustomer } = require("./helpers");
const suppliers = require("../src/services/supplierService");
const dashboard = require("../src/services/dashboardService");
const cashBook = require("../src/services/cashBookService");
const expenses = require("../src/services/expenseService");
const ledger = require("../src/services/ledgerService");
const integrity = require("../src/services/integrityService");

const r2 = (n) => Math.round(n * 100) / 100;

// Small repeatable random generator so a failure can be reproduced.
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function setSetting(key, value) {
  require("../src/database/dbInit").getDatabase().prepare("UPDATE settings SET value = ? WHERE key = ?").run(String(value), key);
}

const day = (n) => `2026-10-${String(1 + (n % 27)).padStart(2, "0")}`;

// Independent bookkeeping model: what the app must agree with.
function runScenario(seed) {
  const rand = rng(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const money = (lo, hi) => r2(lo + Math.floor(rand() * (hi - lo) * 100) / 100);

  freshDb();
  setSetting("opening_cash", 500000);
  setSetting("opening_bank", 300000);
  const m = { cash: 500000, bank: 300000, sup: {}, paidCash: 0, paidBank: 0, entries: [] };

  // customers pay the shop and the shop has expenses
  const customer = addCustomer("Ali");
  for (let i = 0; i < 12; i++) {
    const amount = money(1000, 40000);
    const method = i % 2 ? "Bank Transfer" : "Cash";
    ledger.addLedgerPayment({ customer_id: customer, amount, payment_date: day(i), payment_method: method });
    if (method === "Cash") m.cash = r2(m.cash + amount); else m.bank = r2(m.bank + amount);
  }
  for (let i = 0; i < 8; i++) {
    const amount = money(500, 8000);
    const src = i % 3 === 0 ? "Bank" : "Cash";
    expenses.add({ expense_date: day(i + 3), category: "Misc", amount, payment_source: src });
    if (src === "Cash") m.cash = r2(m.cash - amount); else m.bank = r2(m.bank - amount);
  }

  const openings = [0, 25000, 120000, 0, 5000.5, 0];
  const ids = openings.map((o, i) => {
    const { id } = suppliers.add({ name: `Supplier ${i + 1}`, phone: `0300-000000${i}`, opening: o });
    m.sup[id] = o;
    return id;
  });

  let blocked = 0;
  let done = 0;
  const payments = []; // { id, supplier, amount, source }

  const avail = (src) => (src === "Cash" ? m.cash : m.bank);
  const spend = (src, amt) => { if (src === "Cash") { m.cash = r2(m.cash - amt); m.paidCash = r2(m.paidCash + amt); } else { m.bank = r2(m.bank - amt); m.paidBank = r2(m.paidBank + amt); } };
  const unspend = (src, amt) => { if (src === "Cash") { m.cash = r2(m.cash + amt); m.paidCash = r2(m.paidCash - amt); } else { m.bank = r2(m.bank + amt); m.paidBank = r2(m.paidBank - amt); } };

  for (let i = 0; i < 90; i++) {
    const sid = pick(ids);
    const src = pick(["Cash", "Bank"]);
    const kind = pick(["bill", "bill", "pay", "pay", "pay", "bigpay", "edit", "delete"]);

    if (kind === "bill") {
      const total = money(2000, 90000);
      const withPay = rand() < 0.5;
      const paidNow = withPay ? money(0, total) : 0;
      const call = () => suppliers.addPurchase({ supplier_id: sid, entry_date: day(i), amount: total, paid_now: paidNow || "", payment_source: src, reference_no: `B-${i}` });
      if (paidNow > avail(src)) {
        assert.throws(call, /less than this payment/);
        blocked++;
      } else {
        const res = call();
        m.sup[sid] = r2(m.sup[sid] + total);
        if (paidNow > 0) { spend(src, paidNow); m.sup[sid] = r2(m.sup[sid] - paidNow); payments.push({ id: res.paymentId, sid, amount: paidNow, src }); }
        done++;
      }
    } else if (kind === "pay" || kind === "bigpay") {
      const amount = kind === "bigpay" ? r2(avail(src) + money(1, 5000)) : money(500, 60000);
      const call = () => suppliers.addPayment({ supplier_id: sid, entry_date: day(i), amount, payment_source: src });
      if (amount > avail(src)) {
        assert.throws(call, /less than this payment/);
        blocked++;
      } else {
        const res = call();
        spend(src, amount);
        m.sup[sid] = r2(m.sup[sid] - amount);
        payments.push({ id: res.id, sid, amount, src });
        done++;
      }
    } else if (kind === "edit" && payments.length) {
      const p = pick(payments);
      const newAmount = money(500, 50000);
      const newSrc = pick(["Cash", "Bank"]);
      // Funds available once the old payment is taken back out.
      const availableAfterUndo = avail(newSrc) + (newSrc === p.src ? p.amount : 0);
      const call = () => suppliers.updateEntry(p.id, { entry_date: day(i), amount: newAmount, payment_source: newSrc });
      if (newAmount > availableAfterUndo) {
        assert.throws(call, /less than this payment/);
        blocked++;
      } else {
        call();
        unspend(p.src, p.amount);
        spend(newSrc, newAmount);
        m.sup[p.sid] = r2(m.sup[p.sid] + p.amount - newAmount);
        p.amount = newAmount; p.src = newSrc;
        done++;
      }
    } else if (kind === "delete" && payments.length) {
      const idx = Math.floor(rand() * payments.length);
      const p = payments[idx];
      suppliers.removeEntry(p.id);
      unspend(p.src, p.amount);
      m.sup[p.sid] = r2(m.sup[p.sid] + p.amount);
      payments.splice(idx, 1);
      done++;
    }
  }
  return { m, ids, blocked, done };
}

for (const seed of [1, 7, 42, 2026]) {
  test(`90 mixed entries (seed ${seed}): every balance matches an independent bookkeeping model`, () => {
    const { m, ids, blocked, done } = runScenario(seed);
    assert.ok(done > 30 && blocked > 0, `scenario should do real work and hit blocks (done ${done}, blocked ${blocked})`);

    // supplier balances
    for (const id of ids) assert.strictEqual(suppliers.get(id).balance, m.sup[id], `supplier ${id}`);
    const expectedPayable = r2(Object.values(m.sup).filter((v) => v > 0).reduce((a, b) => a + b, 0));
    const expectedAdvance = r2(-Object.values(m.sup).filter((v) => v < 0).reduce((a, b) => a + b, 0)) || 0; // `|| 0` turns -0 into 0
    const t = suppliers.totals();
    assert.deepStrictEqual([t.payable, t.advance], [expectedPayable, expectedAdvance]);

    // cash and bank on the dashboard
    const bal = dashboard.getBalances(require("../src/database/dbInit").getDatabase());
    assert.strictEqual(bal.cashInHand, m.cash);
    assert.strictEqual(bal.bankBalance, m.bank);
    assert.ok(m.cash >= 0 && m.bank >= 0, "model itself never goes negative");
    assert.deepStrictEqual(suppliers.paymentsBySource({}), { cash: m.paidCash, bank: m.paidBank, total: r2(m.paidCash + m.paidBank) });

    // the book ends where the dashboard ends, and every row's running balance is consistent
    const book = cashBook.get({});
    assert.strictEqual(book.closingCash, m.cash);
    assert.strictEqual(book.closingBank, m.bank);
    let cash = book.openingCash, bank = book.openingBank;
    for (const row of book.rows) {
      if (row.account === "Cash") cash = r2(cash + row.in - row.out); else bank = r2(bank + row.in - row.out);
      assert.strictEqual(row.cash, cash);
      assert.strictEqual(row.bank, bank);
    }
    const supplierRows = book.rows.filter((r) => r.kind === "Supplier payment");
    assert.strictEqual(r2(supplierRows.reduce((s, r) => s + r.out, 0)), r2(m.paidCash + m.paidBank));

    // a split date range adds up to the whole
    const first = cashBook.get({ to: "2026-10-14" });
    const second = cashBook.get({ from: "2026-10-15" });
    assert.strictEqual(second.openingCash, first.closingCash);
    assert.strictEqual(second.openingBank, first.closingBank);
    assert.strictEqual(second.closingCash, m.cash);
    assert.strictEqual(second.closingBank, m.bank);
    assert.strictEqual(first.rows.length + second.rows.length, book.rows.length);

    // each statement ends on the supplier's balance
    for (const id of ids) {
      const st = suppliers.statement(id);
      const last = st.rows.length ? st.rows[st.rows.length - 1].balance : 0;
      assert.strictEqual(last, st.supplier.balance, `statement end ${id}`);
      assert.strictEqual(r2(st.totals.charged - st.totals.paid), st.supplier.balance);
    }

    // the data check is clean
    assert.deepStrictEqual(integrity.check().problems, []);
  });
}

test("one supplier with 40 small instalments ends settled, cash and bank fall by exactly the total", () => {
  freshDb();
  setSetting("opening_cash", 100000);
  setSetting("opening_bank", 100000);
  const { id } = suppliers.add({ name: "Instalments Co" });
  suppliers.addPurchase({ supplier_id: id, entry_date: "2026-10-01", amount: 100000.4 });
  for (let i = 0; i < 40; i++) {
    suppliers.addPayment({ supplier_id: id, entry_date: day(i), amount: 2500, payment_source: i % 2 ? "Bank" : "Cash" });
  }
  assert.strictEqual(suppliers.get(id).balance, 0.4);
  suppliers.addPayment({ supplier_id: id, entry_date: "2026-10-28", amount: 0.4, payment_source: "Cash" });
  assert.strictEqual(suppliers.get(id).balance, 0);
  const b = dashboard.getBalances(require("../src/database/dbInit").getDatabase());
  assert.strictEqual(b.cashInHand, 100000 - 20 * 2500 - 0.4);
  assert.strictEqual(b.bankBalance, 100000 - 20 * 2500);
  assert.strictEqual(suppliers.statement(id).rows.length, 42);
});
