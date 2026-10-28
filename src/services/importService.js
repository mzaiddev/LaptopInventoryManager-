const { getDatabase } = require("../database/dbInit");

const MAX_ROWS = 5000;
const num = (v) => (String(v == null ? "" : v).trim() === "" ? 0 : Number(String(v).replace(/,/g, "")));

// Bulk import of customers and suppliers from rows read out of a CSV. Always reports row by row (row 1 is the
// header, so the first data row is 2). { dryRun: true } checks everything and writes nothing.
class ImportService {
  _guard(rows) {
    if (!Array.isArray(rows)) throw new Error("Nothing to import");
    if (rows.length > MAX_ROWS) throw new Error(`Import at most ${MAX_ROWS.toLocaleString("en-US")} rows at a time`);
  }

  customers(rows, { dryRun = false } = {}) {
    this._guard(rows);
    const db = getDatabase();
    const key = (name, phone) => `${String(name).trim().toLowerCase()}|${String(phone || "").trim()}`;
    const known = new Set(db.prepare("SELECT customer_name n, phone p FROM customers").all().map((c) => key(c.n, c.p)));
    const skipped = [];
    const good = [];

    rows.forEach((r, i) => {
      const row = i + 2;
      const name = String(r.customer_name || r.name || "").trim();
      const skip = (reason) => skipped.push({ row, name, reason });
      if (!name) return skip("Customer name is required");
      const amount = num(r.opening_balance);
      if (!Number.isFinite(amount) || amount < 0) return skip("Opening balance must be a number of 0 or more");
      const type = String(r.balance_type || "Debit").trim().toLowerCase();
      if (!["debit", "credit"].includes(type)) return skip("Balance type must be Debit or Credit");
      const k = key(name, r.phone);
      if (known.has(k)) return skip("Already exists (same name and phone), or repeated in this file");
      known.add(k);
      good.push({ name, phone: String(r.phone || "").trim(), address: String(r.address || "").trim(), email: String(r.email || "").trim(), notes: String(r.notes || "").trim(), amount, type: type === "credit" ? "Credit" : "Debit" });
    });

    if (dryRun) return { total: rows.length, valid: good.length, created: 0, skipped };

    const ledger = require("./ledgerService");
    const oldBalances = require("./oldBalanceService");
    db.transaction(() => {
      for (const c of good) {
        const id = Number(ledger.addCustomer({ customer_name: c.name, phone: c.phone, address: c.address, email: c.email, notes: c.notes }).id);
        if (c.amount > 0) oldBalances.addOldBalance({ customer_id: id, amount: c.amount, balance_type: c.type, notes: "Opening balance (imported)" });
      }
    })();
    return { total: rows.length, valid: good.length, created: good.length, skipped };
  }

  suppliers(rows, { dryRun = false } = {}) {
    this._guard(rows);
    const db = getDatabase();
    const known = new Set(db.prepare("SELECT name FROM suppliers").all().map((s) => s.name.toLowerCase()));
    const skipped = [];
    const good = [];

    rows.forEach((r, i) => {
      const row = i + 2;
      const name = String(r.name || r.supplier_name || "").trim();
      const skip = (reason) => skipped.push({ row, name, reason });
      if (!name) return skip("Supplier name is required");
      const amount = num(r.opening_balance);
      if (!Number.isFinite(amount) || amount < 0) return skip("Opening balance must be a number of 0 or more");
      if (known.has(name.toLowerCase())) return skip("Already exists, or repeated in this file");
      known.add(name.toLowerCase());
      good.push({ name, phone: r.phone, phone2: r.phone2, address: r.address, notes: r.notes, opening: amount });
    });

    if (dryRun) return { total: rows.length, valid: good.length, created: 0, skipped };

    const supplierService = require("./supplierService");
    db.transaction(() => {
      for (const s of good) supplierService.add({ name: s.name, phone: s.phone, phone2: s.phone2, address: s.address, notes: s.notes, opening: s.opening });
    })();
    return { total: rows.length, valid: good.length, created: good.length, skipped };
  }
}

module.exports = new ImportService();
