const { getDatabase } = require("../database/dbInit");
const { roundMoney } = require("../utils/money");

const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
const today = () => new Date().toLocaleDateString("sv-SE");

function addDays(date, days) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Instalment plans on a loan sale. A plan splits what was still owed into dated parts. Nothing is stored about which
// part was paid: payments made on the sale after the plan was created fill the parts in order.
class InstalmentService {
  createPlan({ sale_issue_id, count, first_due_date, interval_days = 30 }) {
    const db = getDatabase();
    const sale = db.prepare("SELECT * FROM sale_issues WHERE id = ?").get(sale_issue_id);
    if (!sale) throw new Error("Sale not found");
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 60) throw new Error("Instalment count must be a whole number from 1 to 60");
    if (!isDate(first_due_date)) throw new Error("First due date must be a valid date");
    const gap = Number(interval_days);
    if (!Number.isInteger(gap) || gap < 1) throw new Error("Days between instalments must be 1 or more");
    if (!(sale.remaining_amount > 0.004)) throw new Error("This sale has nothing remaining to put on a plan");
    if (db.prepare("SELECT 1 FROM instalment_plans WHERE sale_issue_id = ?").get(sale_issue_id)) throw new Error("This sale already has an instalment plan");

    const each = Math.floor((sale.remaining_amount / n) * 100) / 100;
    return db.transaction(() => {
      const plan = Number(db.prepare("INSERT INTO instalment_plans (sale_issue_id, base_paid) VALUES (?, ?)").run(sale_issue_id, sale.paid_amount).lastInsertRowid);
      let left = roundMoney(sale.remaining_amount);
      for (let i = 0; i < n; i++) {
        const amount = i === n - 1 ? left : each;
        db.prepare("INSERT INTO instalments (plan_id, seq, due_date, amount) VALUES (?, ?, ?, ?)").run(plan, i + 1, addDays(first_due_date, gap * i), amount);
        left = roundMoney(left - amount);
      }
      return this.getPlan(sale_issue_id);
    })();
  }

  cancelPlan(sale_issue_id) {
    getDatabase().prepare("DELETE FROM instalment_plans WHERE sale_issue_id = ?").run(sale_issue_id);
    return { success: true };
  }

  // Items with a status: Paid, Overdue, Partial (part paid, not late), Pending.
  getPlan(sale_issue_id, { asOf } = {}) {
    const db = getDatabase();
    const plan = db.prepare("SELECT * FROM instalment_plans WHERE sale_issue_id = ?").get(sale_issue_id);
    if (!plan) return null;
    const sale = db.prepare("SELECT s.*, c.customer_name, c.phone FROM sale_issues s JOIN customers c ON c.id = s.customer_id WHERE s.id = ?").get(sale_issue_id);
    const when = asOf || today();
    let available = Math.max(0, roundMoney(sale.paid_amount - plan.base_paid));
    const items = db.prepare("SELECT * FROM instalments WHERE plan_id = ? ORDER BY seq").all(plan.id).map((i) => {
      const allotted = Math.min(i.amount, available);
      available = roundMoney(available - allotted);
      const balance = roundMoney(i.amount - allotted);
      const status = balance <= 0.004 ? "Paid" : i.due_date < when ? "Overdue" : allotted > 0 ? "Partial" : "Pending";
      return { id: i.id, seq: i.seq, due_date: i.due_date, amount: i.amount, paid: roundMoney(allotted), balance, status };
    });
    const payments = db.prepare("SELECT id, payment_date, amount, payment_method, note FROM payments WHERE sale_issue_id = ? ORDER BY payment_date ASC, id ASC").all(sale_issue_id);
    return {
      sale_issue_id, reference_no: sale.reference_no, customer_id: sale.customer_id, customer_name: sale.customer_name, phone: sale.phone || "", items,
      sale_total: sale.total_amount, sale_paid: sale.paid_amount, sale_remaining: sale.remaining_amount, payments,
    };
  }

  // Money received on an instalment plan. It is an ordinary payment on the sale (so the customer's ledger, the
  // sale and the Cash Book all update), and the plan's parts fill in order, so nothing is stored twice.
  receivePayment({ sale_issue_id, amount, payment_method, payment_date, note } = {}) {
    const plan = this.getPlan(sale_issue_id);
    if (!plan) throw new Error("This sale has no instalment plan");
    const value = roundMoney(Number(amount));
    if (!(value > 0)) throw new Error("Enter the amount received");
    const date = payment_date || today();
    if (!isDate(date)) throw new Error("Payment date must be a valid date");
    const next = plan.items.find((i) => i.balance > 0.004);
    require("./ledgerService").addPayment({
      sale_issue_id, amount: value, payment_method, payment_date: date,
      note: String(note || "").trim() || (next ? `Instalment ${next.seq} of ${plan.items.length}` : "Instalment plan"),
    });
    return this.getPlan(sale_issue_id);
  }

  // Unpaid instalments that are late, or due within the next withinDays, across every plan.
  due({ asOf, withinDays = 7 } = {}) {
    const when = asOf || today();
    const limit = addDays(when, withinDays);
    const out = [];
    const plans = getDatabase().prepare("SELECT sale_issue_id FROM instalment_plans").all();
    for (const p of plans) {
      const plan = this.getPlan(p.sale_issue_id, { asOf: when });
      for (const i of plan.items) {
        if (i.status === "Paid") continue;
        if (i.status === "Overdue" || i.due_date <= limit) {
          out.push({ ...i, sale_issue_id: plan.sale_issue_id, reference_no: plan.reference_no, customer_id: plan.customer_id, customer_name: plan.customer_name, phone: plan.phone, parts: plan.items.length, status: i.status === "Overdue" ? "Overdue" : "Due soon" });
        }
      }
    }
    return out.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.customer_name.localeCompare(b.customer_name));
  }

  // Sales with money still owing and no plan yet: what a new plan can be made for.
  candidates() {
    return getDatabase().prepare(`
      SELECT s.id, s.reference_no, s.issue_date, s.remaining_amount, c.customer_name
      FROM sale_issues s JOIN customers c ON c.id = s.customer_id
      WHERE s.remaining_amount > 0.004 AND NOT EXISTS (SELECT 1 FROM instalment_plans p WHERE p.sale_issue_id = s.id)
      ORDER BY s.issue_date DESC, s.id DESC LIMIT 500`).all();
  }

  // One line per plan: how many parts, what is still owed on them, and the next date that matters.
  plans({ asOf } = {}) {
    return getDatabase().prepare("SELECT sale_issue_id FROM instalment_plans ORDER BY id DESC").all().map((p) => {
      const plan = this.getPlan(p.sale_issue_id, { asOf });
      const open = plan.items.filter((i) => i.status !== "Paid");
      return {
        sale_issue_id: plan.sale_issue_id, reference_no: plan.reference_no, customer_name: plan.customer_name, phone: plan.phone,
        count: plan.items.length, balance: roundMoney(open.reduce((s, i) => s + i.balance, 0)),
        next_due: open.length ? open[0].due_date : null, status: open.length === 0 ? "Complete" : open.some((i) => i.status === "Overdue") ? "Overdue" : "On track",
      };
    });
  }

  overdueCount({ asOf } = {}) {
    return this.overdueList({ asOf }).length;
  }

  overdueList({ asOf } = {}) {
    return this.due({ asOf, withinDays: 0 }).filter((i) => i.status === "Overdue");
  }
}

module.exports = new InstalmentService();
