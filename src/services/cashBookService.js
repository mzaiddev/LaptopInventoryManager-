const { getDatabase } = require("../database/dbInit");
const { roundMoney } = require("../utils/money");

const ORDER = { "Customer payment": 0, "Supplier payment": 1, "Expense": 2 };

// Every movement of cash and bank in date order with a running balance for each.
// Closing balances for an all-time book equal dashboardService.getBalances().
class CashBookService {
  _movements(db) {
    const acct = (m) => (m === "Cash" || m === null || m === undefined ? "Cash" : "Bank");
    const out = [];

    db.prepare(`
      SELECT p.id, substr(p.payment_date,1,10) d, p.amount, p.payment_method m, p.created_at,
             si.reference_no ref, c.customer_name who
      FROM payments p
      LEFT JOIN sale_issues si ON si.id = p.sale_issue_id
      LEFT JOIN customers c ON c.id = si.customer_id`).all().forEach((r) => {
      out.push({ date: r.d, at: r.created_at || "", id: r.id, kind: "Customer payment", account: acct(r.m), who: r.who || "", detail: r.ref || "", inn: r.amount, out: 0 });
    });

    db.prepare(`
      SELECT l.id, l.entry_date d, l.credit amount, l.payment_method m, l.created_at, l.description, c.customer_name who
      FROM customer_ledger l LEFT JOIN customers c ON c.id = l.customer_id
      WHERE l.reference_type = 'Payment' AND l.reference_id IS NULL`).all().forEach((r) => {
      out.push({ date: r.d, at: r.created_at || "", id: r.id, kind: "Customer payment", account: acct(r.m), who: r.who || "", detail: r.description || "Ledger payment", inn: r.amount, out: 0 });
    });

    db.prepare("SELECT id, expense_date d, amount, payment_source s, created_at, category, note FROM expenses").all().forEach((r) => {
      out.push({ date: r.d, at: r.created_at || "", id: r.id, kind: "Expense", account: r.s, who: r.category, detail: r.note || "", inn: 0, out: r.amount });
    });

    db.prepare(`
      SELECT l.id, l.entry_date d, l.paid amount, l.payment_source s, l.created_at, l.reference_no, l.note, s.name who
      FROM supplier_ledger l JOIN suppliers s ON s.id = l.supplier_id WHERE l.entry_type = 'Payment'`).all().forEach((r) => {
      out.push({ date: r.d, at: r.created_at || "", id: r.id, kind: "Supplier payment", account: r.s, who: r.who, detail: [r.reference_no, r.note].filter(Boolean).join(" - "), inn: 0, out: r.amount });
    });

    return out.sort((a, b) =>
      a.date.localeCompare(b.date) || ORDER[a.kind] - ORDER[b.kind] || a.at.localeCompare(b.at) || a.id - b.id);
  }

  // { from, to } inclusive; account: 'Cash' | 'Bank' shows only that account's rows (balances still run on both).
  get({ from, to, account } = {}) {
    const db = getDatabase();
    const setting = (k) => {
      const r = db.prepare("SELECT value FROM settings WHERE key = ?").get(k);
      return roundMoney(Number(r && r.value) || 0);
    };
    let cash = setting("opening_cash");
    let bank = setting("opening_bank");
    const rows = [];
    const totals = { cashIn: 0, cashOut: 0, bankIn: 0, bankOut: 0 };
    let openingCash = cash;
    let openingBank = bank;

    for (const m of this._movements(db)) {
      const delta = roundMoney(m.inn - m.out);
      if (from && m.date < from) {
        if (m.account === "Cash") cash = roundMoney(cash + delta); else bank = roundMoney(bank + delta);
        openingCash = cash;
        openingBank = bank;
        continue;
      }
      if (to && m.date > to) continue;
      if (m.account === "Cash") {
        cash = roundMoney(cash + delta);
        totals.cashIn += m.inn; totals.cashOut += m.out;
      } else {
        bank = roundMoney(bank + delta);
        totals.bankIn += m.inn; totals.bankOut += m.out;
      }
      if (account && m.account !== account) continue;
      rows.push({ date: m.date, kind: m.kind, account: m.account, who: m.who, detail: m.detail, in: roundMoney(m.inn), out: roundMoney(m.out), cash, bank });
    }

    return {
      openingCash, openingBank, rows,
      totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, roundMoney(v)])),
      closingCash: cash, closingBank: bank,
    };
  }
}

module.exports = new CashBookService();
