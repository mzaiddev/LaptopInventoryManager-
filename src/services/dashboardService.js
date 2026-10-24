const { getDatabase } = require("../database/dbInit");
const { roundMoney } = require("../utils/money");
const expenseService = require("./expenseService");

// Empty from/to means unbounded on that side.
function between(col, from, to) {
  const sql = [];
  const args = [];
  if (from) { sql.push(`${col} >= ?`); args.push(from); }
  if (to) { sql.push(`${col} <= ?`); args.push(to); }
  return { sql: sql.length ? " AND " + sql.join(" AND ") : "", args };
}

class DashboardService {
  // range: { from, to } (YYYY-MM-DD, inclusive). costVisible: owner revealed purchase prices.
  getDashboardData({ from, to } = {}, { costVisible = false } = {}) {
    const db = getDatabase();
    const sales = this.getSales(db, from, to);
    const received = this.getReceived(db, from, to);
    const returns = this.getReturns(db, from, to);
    const expenses = expenseService.totals({ from, to });
    const cogs = this.getCogs(db, from, to);

    return {
      range: { from: from || null, to: to || null },
      currency: this.getSetting("currency") || "USD",
      sales: sales.total,
      salesCount: sales.count,
      received,
      returns,
      expenses: { total: expenses.total, cash: expenses.cash, bank: expenses.bank },
      netProfit: costVisible ? roundMoney(sales.total - cogs - expenses.total) : null,
      ...this.getBalances(db),
      outstanding: this.getOutstanding(db),
      stock: this.getStock(db, costVisible),
      recentSales: this.getRecentSales(db),
      recentPayments: this.getRecentPayments(db),
      details: this.getDetails(db, { from, to, sales, returns, expenses, cogs, costVisible }),
    };
  }

  // The lines behind each card, so the owner can see how a figure was worked out.
  getDetails(db, { from, to, sales, returns, expenses, cogs, costVisible }) {
    const ws = between("issue_date", from, to);
    const wi = between("si.issue_date", from, to);
    const wp = between("payment_date", from, to);
    const wl = between("entry_date", from, to);
    const discounts =
      db.prepare(`SELECT COALESCE(SUM(discount_amount),0) t FROM sale_issues WHERE 1=1${ws.sql}`).get(...ws.args).t +
      db.prepare(`SELECT COALESCE(SUM(sii.discount_amount),0) t FROM sale_issue_items sii JOIN sale_issues si ON si.id = sii.sale_issue_id WHERE 1=1${wi.sql}`).get(...wi.args).t;
    const onSales = db.prepare(`SELECT COALESCE(SUM(amount),0) t FROM payments WHERE 1=1${wp.sql}`).get(...wp.args).t;
    const onLedger = db.prepare(`SELECT COALESCE(SUM(credit),0) t FROM customer_ledger WHERE reference_type='Payment' AND reference_id IS NULL${wl.sql}`).get(...wl.args).t;

    const paid = this._paymentsByMethod(db);
    const spent = expenseService.totals({});
    const opening = (key) => roundMoney(Number(this.getSetting(key)) || 0);

    const l = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN reference_type='OldBalanceDebit' THEN debit ELSE 0 END),0) - COALESCE(SUM(CASE WHEN reference_type='OldBalanceCredit' THEN credit ELSE 0 END),0) old_balance,
        COALESCE(SUM(CASE WHEN reference_type='Sale' THEN debit ELSE 0 END),0) sales,
        COALESCE(SUM(CASE WHEN reference_type='Return' THEN credit ELSE 0 END),0) returns,
        COALESCE(SUM(CASE WHEN reference_type='Payment' THEN credit ELSE 0 END),0) payments,
        COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0) balance
      FROM customer_ledger`).get();
    const owe = {
      old_balance: roundMoney(l.old_balance), sales: roundMoney(l.sales), returns: roundMoney(l.returns),
      payments: roundMoney(l.payments), other: 0, balance: roundMoney(l.balance),
    };
    owe.other = roundMoney(owe.balance - (owe.old_balance + owe.sales - owe.returns - owe.payments));

    return {
      sales: { discounts: roundMoney(discounts), returns: returns.total },
      received: { onSales: roundMoney(onSales), onLedger: roundMoney(onLedger) },
      profit: costVisible ? { sales: sales.total, cogs, expenses: expenses.total } : null,
      cash: { opening: opening("opening_cash"), received: paid.cash, expenses: spent.cash },
      bank: { opening: opening("opening_bank"), received: paid.bank, expenses: spent.bank },
      owe,
    };
  }

  getSales(db, from, to) {
    const w = between("issue_date", from, to);
    const r = db.prepare(`SELECT COALESCE(SUM(total_amount),0) t, COUNT(*) c FROM sale_issues WHERE 1=1${w.sql}`).get(...w.args);
    return { total: roundMoney(r.t), count: r.c };
  }

  // Money in by Cash / Bank: payments on sales plus direct ledger payments. Old 'Online'/'Other' rows count as Bank.
  _paymentsByMethod(db, from, to) {
    const wp = between("payment_date", from, to);
    const wl = between("entry_date", from, to);
    const out = { cash: 0, bank: 0 };
    const add = (method, amount) => {
      out[method === "Cash" || method === null ? "cash" : "bank"] += amount;
    };
    db.prepare(`SELECT payment_method m, SUM(amount) a FROM payments WHERE 1=1${wp.sql} GROUP BY payment_method`)
      .all(...wp.args).forEach((r) => add(r.m, r.a));
    db.prepare(`SELECT payment_method m, SUM(credit) a FROM customer_ledger WHERE reference_type='Payment' AND reference_id IS NULL${wl.sql} GROUP BY payment_method`)
      .all(...wl.args).forEach((r) => add(r.m, r.a));
    return { cash: roundMoney(out.cash), bank: roundMoney(out.bank) };
  }

  getReceived(db, from, to) {
    const p = this._paymentsByMethod(db, from, to);
    return { total: roundMoney(p.cash + p.bank), cash: p.cash, bank: p.bank };
  }

  getReturns(db, from, to) {
    const w = between("return_date", from, to);
    const r = db.prepare(`SELECT COALESCE(SUM(total_return_amount),0) t, COUNT(*) c FROM returns WHERE status='Completed'${w.sql}`).get(...w.args);
    return { total: roundMoney(r.t), count: r.c };
  }

  // Cost of goods still with customers (sold minus returned) for sales in range.
  getCogs(db, from, to) {
    const w = between("si.issue_date", from, to);
    const r = db.prepare(`
      SELECT COALESCE(SUM((sii.quantity - COALESCE(ret.q, 0)) * COALESCE(p.purchase_price, 0)), 0) c
      FROM sale_issue_items sii
      JOIN sale_issues si ON si.id = sii.sale_issue_id
      LEFT JOIN products p ON p.id = sii.product_id
      LEFT JOIN (
        SELECT r.sale_issue_id sid, ri.product_id pid, SUM(ri.quantity) q
        FROM return_items ri JOIN returns r ON r.id = ri.return_id
        WHERE r.status = 'Completed' GROUP BY r.sale_issue_id, ri.product_id
      ) ret ON ret.sid = sii.sale_issue_id AND ret.pid = sii.product_id
      WHERE 1=1${w.sql}`).get(...w.args);
    return roundMoney(r.c);
  }

  // All-time, never filtered by date.
  getBalances(db) {
    const paid = this._paymentsByMethod(db);
    const spent = expenseService.totals({});
    // Money already in the drawer / bank when the shop started using the app (Settings).
    const opening = (key) => roundMoney(Number(this.getSetting(key)) || 0);
    return {
      cashInHand: roundMoney(opening("opening_cash") + paid.cash - spent.cash),
      bankBalance: roundMoney(opening("opening_bank") + paid.bank - spent.bank),
    };
  }

  // Ledger balance is the single source of truth for what customers owe.
  getOutstanding(db) {
    const amount = db.prepare("SELECT COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0) b FROM customer_ledger").get().b;
    const owing = db.prepare(`
      SELECT COUNT(*) c FROM (
        SELECT customer_id FROM customer_ledger GROUP BY customer_id HAVING SUM(debit) - SUM(credit) > 0.005
      )`).get().c;
    return { amount: roundMoney(amount), customersOwing: owing };
  }

  getStock(db, costVisible) {
    const r = db.prepare(`
      SELECT COALESCE(SUM(quantity),0) q, COALESCE(SUM(quantity * purchase_price),0) v
      FROM products WHERE status = 'In Stock'`).get();
    return { itemsInStock: r.q, stockValue: costVisible ? roundMoney(r.v) : null };
  }

  getRecentSales(db) {
    return db.prepare(`
      SELECT si.id, si.reference_no, si.total_amount, si.issue_date, c.customer_name
      FROM sale_issues si LEFT JOIN customers c ON si.customer_id = c.id
      ORDER BY si.created_at DESC, si.id DESC LIMIT 5`).all();
  }

  getRecentPayments(db) {
    return db.prepare(`
      SELECT p.id, p.amount, p.payment_date, p.payment_method, si.reference_no sale_ref, c.customer_name
      FROM payments p
      LEFT JOIN sale_issues si ON p.sale_issue_id = si.id
      LEFT JOIN customers c ON si.customer_id = c.id
      ORDER BY p.created_at DESC, p.id DESC LIMIT 5`).all();
  }

  getSetting(key) {
    const row = getDatabase().prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : null;
  }
}

module.exports = new DashboardService();
