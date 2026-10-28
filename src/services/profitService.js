const { getDatabase } = require("../database/dbInit");
const { roundMoney } = require("../utils/money");

// Profit per product for a date range. Cost uses the product's current purchase price (the app keeps no price history).
// A sale-level discount is shared across the sale's lines by value, and returns take away revenue and cost.
class ProfitService {
  byProduct({ from, to } = {}) {
    const db = getDatabase();
    const range = (col) => {
      const parts = [];
      const args = [];
      if (from) { parts.push(`${col} >= ?`); args.push(from); }
      if (to) { parts.push(`${col} <= ?`); args.push(to); }
      return { sql: parts.length ? " AND " + parts.join(" AND ") : "", args };
    };

    const s = range("si.issue_date");
    const sold = db.prepare(`
      SELECT sii.product_id pid, SUM(sii.quantity) qty,
             SUM(sii.subtotal - COALESCE(si.discount_amount, 0) * sii.subtotal / NULLIF(lines.total, 0)) revenue
      FROM sale_issue_items sii
      JOIN sale_issues si ON si.id = sii.sale_issue_id
      JOIN (SELECT sale_issue_id sid, SUM(subtotal) total FROM sale_issue_items GROUP BY sale_issue_id) lines ON lines.sid = si.id
      WHERE 1=1${s.sql}
      GROUP BY sii.product_id`).all(...s.args);

    const r = range("r.return_date");
    const back = db.prepare(`
      SELECT ri.product_id pid, SUM(ri.quantity) qty, SUM(ri.subtotal) revenue
      FROM return_items ri JOIN returns r ON r.id = ri.return_id
      WHERE r.status = 'Completed'${r.sql}
      GROUP BY ri.product_id`).all(...r.args);

    const info = new Map(db.prepare("SELECT id, product_name, category, purchase_price FROM products").all().map((p) => [p.id, p]));
    const rows = new Map();
    const row = (pid) => {
      if (!rows.has(pid)) {
        const p = info.get(pid) || { product_name: "(deleted product)", category: "", purchase_price: 0 };
        rows.set(pid, { product_id: pid, product_name: p.product_name, category: p.category, cost: p.purchase_price || 0, qty: 0, revenue: 0 });
      }
      return rows.get(pid);
    };
    sold.forEach((x) => { const o = row(x.pid); o.qty += x.qty; o.revenue += x.revenue; });
    back.forEach((x) => { const o = row(x.pid); o.qty -= x.qty; o.revenue -= x.revenue; });

    const out = [...rows.values()].filter((o) => o.qty !== 0 || Math.abs(o.revenue) > 0.004).map((o) => {
      const revenue = roundMoney(o.revenue);
      const cogs = roundMoney(o.qty * o.cost);
      const profit = roundMoney(revenue - cogs);
      return { product_id: o.product_id, product_name: o.product_name, category: o.category, qty: o.qty, revenue, cogs, profit, margin: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0 };
    }).sort((a, b) => b.profit - a.profit || a.product_name.localeCompare(b.product_name));

    const totals = out.reduce((t, o) => ({ qty: t.qty + o.qty, revenue: roundMoney(t.revenue + o.revenue), cogs: roundMoney(t.cogs + o.cogs), profit: roundMoney(t.profit + o.profit) }), { qty: 0, revenue: 0, cogs: 0, profit: 0 });
    return { rows: out, totals };
  }
}

module.exports = new ProfitService();
