const { getDatabase } = require("../database/dbInit");
const { roundMoney } = require("../utils/money");
const lists = require("./listService");

function clean(data) {
  const amount = roundMoney(data.amount);
  if (!(amount > 0)) throw new Error("Amount must be greater than 0");
  if (!data.expense_date) throw new Error("Date is required");
  const category = String(data.category || "").trim();
  if (!category) throw new Error("Category is required");
  if (!["Cash", "Bank"].includes(data.payment_source)) throw new Error("Paid from must be Cash or Bank");
  return { expense_date: data.expense_date, category, amount, payment_source: data.payment_source, note: String(data.note || "").trim() };
}

function rangeWhere({ from, to, search } = {}) {
  const where = [];
  const args = [];
  if (from) { where.push("expense_date >= ?"); args.push(from); }
  if (to) { where.push("expense_date <= ?"); args.push(to); }
  if (search) {
    where.push("(category LIKE ? OR note LIKE ?)");
    args.push(`%${search}%`, `%${search}%`);
  }
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", args };
}

class ExpenseService {
  add(data) {
    const d = clean(data);
    lists.ensure("expense_category", d.category);
    const r = getDatabase()
      .prepare("INSERT INTO expenses (expense_date, category, amount, payment_source, note) VALUES (?, ?, ?, ?, ?)")
      .run(d.expense_date, d.category, d.amount, d.payment_source, d.note);
    return { id: Number(r.lastInsertRowid) };
  }

  update(id, data) {
    const d = clean(data);
    lists.ensure("expense_category", d.category);
    const r = getDatabase()
      .prepare("UPDATE expenses SET expense_date = ?, category = ?, amount = ?, payment_source = ?, note = ? WHERE id = ?")
      .run(d.expense_date, d.category, d.amount, d.payment_source, d.note, id);
    if (r.changes === 0) throw new Error("Expense not found");
  }

  remove(id) {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);
    if (row) require("./recycleService").archive({ entity: "expense", entityId: id, label: `${row.category} ${row.amount} (${row.expense_date})`, tables: { expenses: [row] } });
    const r = db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
    if (r.changes === 0) throw new Error("Expense not found");
  }

  list({ from, to, search, page = 1, pageSize = 25 } = {}) {
    const db = getDatabase();
    const w = rangeWhere({ from, to, search });
    const agg = db.prepare(`SELECT COUNT(*) total, COALESCE(SUM(amount),0) sum FROM expenses ${w.sql}`).get(...w.args);
    const rows = db
      .prepare(`SELECT * FROM expenses ${w.sql} ORDER BY expense_date DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...w.args, pageSize, (Math.max(1, page) - 1) * pageSize);
    return { rows, total: agg.total, sum: roundMoney(agg.sum) };
  }

  totals({ from, to } = {}) {
    const db = getDatabase();
    const w = rangeWhere({ from, to });
    const bySource = db
      .prepare(`SELECT payment_source s, COALESCE(SUM(amount),0) a FROM expenses ${w.sql} GROUP BY payment_source`)
      .all(...w.args);
    const get = (s) => roundMoney(bySource.find((r) => r.s === s)?.a || 0);
    const byCategory = db
      .prepare(`SELECT category, SUM(amount) amount FROM expenses ${w.sql} GROUP BY category ORDER BY amount DESC, category`)
      .all(...w.args)
      .map((r) => ({ category: r.category, amount: roundMoney(r.amount) }));
    return { total: roundMoney(get("Cash") + get("Bank")), cash: get("Cash"), bank: get("Bank"), byCategory };
  }
}

module.exports = new ExpenseService();
