const { getDatabase } = require("../database/dbInit");
const { roundMoney } = require("../utils/money");

const DAY = 24 * 60 * 60 * 1000;

function daysBetween(fromDate, asOf) {
  return Math.max(0, Math.round((new Date(asOf + "T00:00:00") - new Date(fromDate + "T00:00:00")) / DAY));
}

function bucketOf(days) {
  if (days <= 30) return "current";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90_plus";
}

const emptyBuckets = () => ({ current: 0, d31_60: 0, d61_90: 0, d90_plus: 0 });

class AgeingService {
  // What each customer owes, split by how old the charge is. Payments, returns and credits clear the
  // oldest charges first, so what is left is the newest money. Customers who owe nothing are left out.
  report({ asOf } = {}) {
    const when = asOf || new Date().toLocaleDateString("sv-SE");
    const db = getDatabase();
    const entries = db.prepare(`
      SELECT l.customer_id, l.debit, l.credit, l.entry_date, c.customer_name, c.phone
      FROM customer_ledger l JOIN customers c ON c.id = l.customer_id
      ORDER BY l.customer_id, l.entry_date ASC, l.id ASC`).all();

    const byCustomer = new Map();
    for (const e of entries) {
      if (!byCustomer.has(e.customer_id)) byCustomer.set(e.customer_id, { name: e.customer_name, phone: e.phone, charges: [], credit: 0 });
      const c = byCustomer.get(e.customer_id);
      if (e.debit > 0) c.charges.push({ date: e.entry_date, left: e.debit });
      c.credit += e.credit;
    }

    const rows = [];
    for (const [customerId, c] of byCustomer) {
      let credit = c.credit;
      for (const ch of c.charges) {
        const used = Math.min(ch.left, credit);
        ch.left = roundMoney(ch.left - used);
        credit = roundMoney(credit - used);
      }
      const open = c.charges.filter((ch) => ch.left > 0.004);
      if (!open.length) continue;
      const buckets = emptyBuckets();
      let oldest = 0;
      for (const ch of open) {
        const days = daysBetween(ch.date, when);
        buckets[bucketOf(days)] = roundMoney(buckets[bucketOf(days)] + ch.left);
        oldest = Math.max(oldest, days);
      }
      rows.push({
        customer_id: customerId, customer_name: c.name, phone: c.phone,
        total: roundMoney(open.reduce((s, ch) => s + ch.left, 0)), buckets, oldest_days: oldest,
      });
    }
    rows.sort((a, b) => b.total - a.total || a.customer_name.localeCompare(b.customer_name));

    const totals = { total: 0, buckets: emptyBuckets() };
    for (const r of rows) {
      totals.total = roundMoney(totals.total + r.total);
      for (const k of Object.keys(totals.buckets)) totals.buckets[k] = roundMoney(totals.buckets[k] + r.buckets[k]);
    }
    return { asOf: when, rows, totals };
  }

  // Customers (and money) with a charge older than graceDays still unpaid.
  overdue({ asOf, graceDays = 30 } = {}) {
    const { rows } = this.report({ asOf });
    const late = rows.filter((r) => r.oldest_days > graceDays);
    return { customers: late.length, amount: roundMoney(late.reduce((s, r) => s + r.total, 0)), list: late };
  }
}

module.exports = new AgeingService();
