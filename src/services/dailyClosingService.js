const { getDatabase } = require("../database/dbInit");
const { roundMoney } = require("../utils/money");
const cashBook = require("./cashBookService");

const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));

// End-of-day count: what the drawer should hold against what the owner actually counted.
class DailyClosingService {
  preview(date) {
    if (!isDate(date)) throw new Error("Date is required (YYYY-MM-DD)");
    const db = getDatabase();
    const book = cashBook.get({ from: date, to: date });
    const sales = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(total_amount),0) t FROM sale_issues WHERE issue_date = ?").get(date);
    const closing = db.prepare("SELECT * FROM day_closings WHERE closing_date = ?").get(date) || null;
    return {
      date,
      openingCash: book.openingCash, cashIn: book.totals.cashIn, cashOut: book.totals.cashOut, expectedCash: book.closingCash,
      openingBank: book.openingBank, bankIn: book.totals.bankIn, bankOut: book.totals.bankOut, expectedBank: book.closingBank,
      salesCount: sales.n, salesTotal: roundMoney(sales.t),
      closing,
    };
  }

  save({ date, countedCash, note }) {
    const counted = typeof countedCash === "number" ? countedCash : Number.parseFloat(countedCash);
    if (!isDate(date)) throw new Error("Date is required (YYYY-MM-DD)");
    if (!Number.isFinite(counted) || counted < 0) throw new Error("Counted cash must be a number of 0 or more");
    const expected = this.preview(date).expectedCash;
    const difference = roundMoney(counted - expected);
    getDatabase().prepare(`
      INSERT INTO day_closings (closing_date, expected_cash, counted_cash, difference, note)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(closing_date) DO UPDATE SET expected_cash = excluded.expected_cash, counted_cash = excluded.counted_cash,
        difference = excluded.difference, note = excluded.note, updated_at = datetime('now','localtime')`)
      .run(date, expected, roundMoney(counted), difference, String(note || "").trim());
    return { date, expectedCash: expected, countedCash: roundMoney(counted), difference };
  }

  list({ limit = 30 } = {}) {
    return getDatabase().prepare("SELECT * FROM day_closings ORDER BY closing_date DESC LIMIT ?").all(limit);
  }
}

module.exports = new DailyClosingService();
