const { getDatabase } = require("../database/dbInit");

const EPS = 0.01;

// Read-only consistency check the owner can run from Settings.
class IntegrityService {
  check() {
    const db = getDatabase();
    const problems = [];

    db.prepare(`
      SELECT si.id, si.reference_no, si.total_amount, si.paid_amount, si.remaining_amount,
             COALESCE((SELECT SUM(amount) FROM payments WHERE sale_issue_id = si.id), 0) AS paid_rows,
             (SELECT COUNT(*) FROM returns WHERE sale_issue_id = si.id AND status = 'Completed') AS returns_count
      FROM sale_issues si`).all().forEach((s) => {
      // Returns legitimately lower total/paid without touching payment rows, so only unreturned sales are checked.
      if (s.returns_count > 0) return;
      if (Math.abs(s.total_amount - s.paid_amount - s.remaining_amount) > EPS) {
        problems.push({ type: "sale_total_mismatch", id: s.id, detail: `${s.reference_no}: total, paid and remaining do not add up` });
      }
      if (Math.abs(s.paid_amount - s.paid_rows) > EPS) {
        problems.push({ type: "sale_paid_mismatch", id: s.id, detail: `${s.reference_no}: paid ${s.paid_amount} but payments add up to ${s.paid_rows}` });
      }
    });

    db.prepare(`
      SELECT l.customer_id AS id, SUM(l.debit) - SUM(l.credit) AS net,
             (SELECT running_balance FROM customer_ledger
              WHERE customer_id = l.customer_id ORDER BY entry_date DESC, id DESC LIMIT 1) AS last_balance
      FROM customer_ledger l GROUP BY l.customer_id`).all().forEach((c) => {
      if (Math.abs(c.net - c.last_balance) > EPS) {
        problems.push({ type: "ledger_balance_mismatch", id: c.id, detail: `Ledger shows ${c.last_balance} but entries add up to ${c.net}` });
      }
    });

    db.prepare("SELECT id, product_name FROM products WHERE quantity < 0").all().forEach((p) => {
      problems.push({ type: "negative_stock", id: p.id, detail: `${p.product_name} has negative stock` });
    });

    const bal = require("./dashboardService").getBalances(db);
    if (bal.cashInHand < -EPS) problems.push({ type: "cash_negative", id: null, detail: `Cash in hand is ${bal.cashInHand}. Check the opening cash in Settings and recent expenses or supplier payments.` });
    if (bal.bankBalance < -EPS) problems.push({ type: "bank_negative", id: null, detail: `Bank balance is ${bal.bankBalance}. Check the opening bank balance in Settings and recent expenses or supplier payments.` });

    return { ok: problems.length === 0, problems };
  }
}

module.exports = new IntegrityService();
