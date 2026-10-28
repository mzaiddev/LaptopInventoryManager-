const { getDatabase } = require("../database/dbInit");
const { roundMoney } = require("../utils/money");

const SOURCES = ["Cash", "Bank"];

function str(v) {
  return String(v == null ? "" : v).trim();
}

function amountOf(v, label = "Amount") {
  const a = roundMoney(v);
  if (!(a > 0)) throw new Error(`${label} must be greater than 0`);
  return a;
}

function dateOf(v) {
  const d = str(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("Date is required");
  return d;
}

function between(col, from, to) {
  const sql = [];
  const args = [];
  if (from) { sql.push(`${col} >= ?`); args.push(from); }
  if (to) { sql.push(`${col} <= ?`); args.push(to); }
  return { sql: sql.length ? " AND " + sql.join(" AND ") : "", args };
}

// Suppliers, what the shop owes them, and payments made out of Cash or Bank.
// A payment lowers the supplier's balance AND the cash/bank balance (dashboardService reads it).
class SupplierService {
  _supplier(id) {
    const s = getDatabase().prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
    if (!s) throw new Error("Supplier not found");
    return s;
  }

  _cleanSupplier(data) {
    const name = str(data.name);
    if (!name) throw new Error("Supplier name is required");
    const opening = data.opening === "" || data.opening == null ? 0 : roundMoney(data.opening);
    if (opening < 0) throw new Error("Opening amount cannot be negative");
    return {
      name,
      phone: str(data.phone),
      phone2: str(data.phone2),
      address: str(data.address),
      notes: str(data.notes),
      status: data.status === "Inactive" ? "Inactive" : "Active",
      opening,
    };
  }

  _writeOpening(db, supplierId, opening) {
    const row = db.prepare("SELECT id FROM supplier_ledger WHERE supplier_id = ? AND entry_type = 'Opening'").get(supplierId);
    if (opening > 0) {
      if (row) db.prepare("UPDATE supplier_ledger SET charge = ? WHERE id = ?").run(opening, row.id);
      else {
        db.prepare("INSERT INTO supplier_ledger (supplier_id, entry_date, entry_type, charge, note) VALUES (?, date('now','localtime'), 'Opening', ?, 'Opening balance')")
          .run(supplierId, opening);
      }
    } else if (row) {
      db.prepare("DELETE FROM supplier_ledger WHERE id = ?").run(row.id);
    }
  }

  add(data) {
    const db = getDatabase();
    const d = this._cleanSupplier(data);
    return db.transaction(() => {
      let id;
      try {
        id = Number(
          db.prepare("INSERT INTO suppliers (name, phone, phone2, address, notes, status) VALUES (?, ?, ?, ?, ?, ?)")
            .run(d.name, d.phone, d.phone2, d.address, d.notes, d.status).lastInsertRowid,
        );
      } catch (err) {
        if (/UNIQUE/.test(err.message)) throw new Error("A supplier with this name already exists");
        throw err;
      }
      this._writeOpening(db, id, d.opening);
      return { id };
    })();
  }

  update(id, data) {
    const db = getDatabase();
    this._supplier(id);
    const d = this._cleanSupplier(data);
    db.transaction(() => {
      try {
        db.prepare("UPDATE suppliers SET name = ?, phone = ?, phone2 = ?, address = ?, notes = ?, status = ? WHERE id = ?")
          .run(d.name, d.phone, d.phone2, d.address, d.notes, d.status, id);
      } catch (err) {
        if (/UNIQUE/.test(err.message)) throw new Error("A supplier with this name already exists");
        throw err;
      }
      // Only touch the opening amount when the form sent one.
      if (data.opening !== undefined) this._writeOpening(db, id, d.opening);
    })();
  }

  // A supplier with purchases or payments can only be made Inactive, never deleted.
  remove(id) {
    const db = getDatabase();
    this._supplier(id);
    const used = db.prepare("SELECT COUNT(*) c FROM supplier_ledger WHERE supplier_id = ? AND entry_type <> 'Opening'").get(id).c;
    if (used > 0) throw new Error("This supplier has purchases or payments. Mark it Inactive instead.");
    db.transaction(() => {
      db.prepare("DELETE FROM supplier_ledger WHERE supplier_id = ?").run(id);
      db.prepare("DELETE FROM suppliers WHERE id = ?").run(id);
    })();
  }

  get(id) {
    const s = this._supplier(id);
    return { ...s, ...this._figures(id) };
  }

  _figures(id) {
    const r = getDatabase().prepare(`
      SELECT COALESCE(SUM(charge),0) charged, COALESCE(SUM(paid),0) paid,
             COALESCE(SUM(CASE WHEN entry_type='Opening' THEN charge ELSE 0 END),0) opening,
             COALESCE(SUM(CASE WHEN entry_type='Purchase' THEN charge ELSE 0 END),0) purchased
      FROM supplier_ledger WHERE supplier_id = ?`).get(id);
    return {
      opening: roundMoney(r.opening),
      purchased: roundMoney(r.purchased),
      paid: roundMoney(r.paid),
      balance: roundMoney(r.charged - r.paid),
    };
  }

  list({ search, status } = {}) {
    const db = getDatabase();
    const where = [];
    const args = [];
    if (search) {
      where.push("(s.name LIKE ? OR s.phone LIKE ? OR s.phone2 LIKE ? OR s.address LIKE ?)");
      const q = `%${search}%`;
      args.push(q, q, q, q);
    }
    if (status) { where.push("s.status = ?"); args.push(status); }
    return db.prepare(`
      SELECT s.*,
        COALESCE(SUM(l.charge),0) charged, COALESCE(SUM(l.paid),0) paid,
        COALESCE(SUM(CASE WHEN l.entry_type='Purchase' THEN l.charge ELSE 0 END),0) purchased,
        COALESCE(SUM(CASE WHEN l.entry_type='Opening' THEN l.charge ELSE 0 END),0) opening
      FROM suppliers s LEFT JOIN supplier_ledger l ON l.supplier_id = s.id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      GROUP BY s.id ORDER BY s.name COLLATE NOCASE`).all(...args).map((r) => ({
      id: r.id, name: r.name, phone: r.phone, phone2: r.phone2, address: r.address, notes: r.notes, status: r.status,
      opening: roundMoney(r.opening), purchased: roundMoney(r.purchased), paid: roundMoney(r.paid),
      balance: roundMoney(r.charged - r.paid),
    }));
  }

  // What the shop owes in total, and what it has paid ahead (advances).
  totals() {
    const rows = this.list({});
    let payable = 0, advance = 0, owed = 0;
    for (const r of rows) {
      if (r.balance > 0) { payable += r.balance; owed += 1; }
      else if (r.balance < 0) advance += -r.balance;
    }
    return { payable: roundMoney(payable), advance: roundMoney(advance), suppliersOwed: owed, suppliers: rows.length };
  }

  // Money paid to suppliers in a date range, split by where it came from.
  paymentsBySource({ from, to } = {}) {
    const w = between("entry_date", from, to);
    const rows = getDatabase()
      .prepare(`SELECT payment_source s, COALESCE(SUM(paid),0) a FROM supplier_ledger WHERE entry_type='Payment'${w.sql} GROUP BY payment_source`)
      .all(...w.args);
    const get = (s) => roundMoney(rows.find((r) => r.s === s)?.a || 0);
    return { cash: get("Cash"), bank: get("Bank"), total: roundMoney(get("Cash") + get("Bank")) };
  }

  // A payment can never take cash or bank below zero. ignoreId = the entry being edited.
  _guardFunds(source, amount, ignoreId = null) {
    const db = getDatabase();
    const bal = require("./dashboardService").getBalances(db);
    let available = source === "Cash" ? bal.cashInHand : bal.bankBalance;
    if (ignoreId) {
      const old = db.prepare("SELECT paid, payment_source FROM supplier_ledger WHERE id = ? AND entry_type = 'Payment'").get(ignoreId);
      if (old && old.payment_source === source) available += old.paid;
    }
    if (amount > roundMoney(available) + 1e-9) {
      const where = source === "Cash" ? "Cash in hand" : "Bank balance";
      throw new Error(
        `${where} is ${roundMoney(available).toLocaleString("en-US")}, which is less than this payment. ` +
        "Check the opening balance in Settings or pick the other account.",
      );
    }
  }

  _insertEntry(db, e) {
    return Number(
      db.prepare(`INSERT INTO supplier_ledger (supplier_id, entry_date, entry_type, charge, paid, payment_source, reference_no, note)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(e.supplier_id, e.entry_date, e.entry_type, e.charge || 0, e.paid || 0, e.payment_source || null, e.reference_no || "", e.note || "")
        .lastInsertRowid,
    );
  }

  _activeSupplier(id) {
    const s = this._supplier(id);
    if (s.status !== "Active") throw new Error("This supplier is Inactive");
    return s;
  }

  _cleanPayment(data) {
    if (!SOURCES.includes(data.payment_source)) throw new Error("Paid from must be Cash or Bank");
    return {
      entry_date: dateOf(data.entry_date),
      amount: amountOf(data.amount),
      payment_source: data.payment_source,
      reference_no: str(data.reference_no),
      note: str(data.note),
    };
  }

  // A payment, including an advance (paying before any purchase is recorded).
  addPayment(data) {
    const db = getDatabase();
    this._activeSupplier(data.supplier_id);
    const p = this._cleanPayment(data);
    return db.transaction(() => {
      this._guardFunds(p.payment_source, p.amount);
      return {
        id: this._insertEntry(db, {
          supplier_id: data.supplier_id, entry_date: p.entry_date, entry_type: "Payment",
          paid: p.amount, payment_source: p.payment_source, reference_no: p.reference_no, note: p.note,
        }),
      };
    })();
  }

  // A bill for goods bought from the supplier. paid_now (optional) is paid at the same time.
  addPurchase(data) {
    const db = getDatabase();
    this._activeSupplier(data.supplier_id);
    const entry_date = dateOf(data.entry_date);
    const amount = amountOf(data.amount, "Bill total");
    const paidNow = data.paid_now === "" || data.paid_now == null ? 0 : roundMoney(data.paid_now);
    if (paidNow < 0) throw new Error("Paid now cannot be negative");
    if (paidNow > amount) throw new Error("Paid now cannot be more than the bill total. Record extra money as a separate payment.");
    if (paidNow > 0 && !SOURCES.includes(data.payment_source)) throw new Error("Paid from must be Cash or Bank");
    return db.transaction(() => {
      if (paidNow > 0) this._guardFunds(data.payment_source, paidNow);
      const id = this._insertEntry(db, {
        supplier_id: data.supplier_id, entry_date, entry_type: "Purchase", charge: amount,
        reference_no: str(data.reference_no), note: str(data.note),
      });
      let paymentId = null;
      if (paidNow > 0) {
        paymentId = this._insertEntry(db, {
          supplier_id: data.supplier_id, entry_date, entry_type: "Payment", paid: paidNow,
          payment_source: data.payment_source, reference_no: str(data.reference_no), note: "Paid with bill",
        });
      }
      return { id, paymentId };
    })();
  }

  _entry(id) {
    const e = getDatabase().prepare("SELECT * FROM supplier_ledger WHERE id = ?").get(id);
    if (!e) throw new Error("Entry not found");
    return e;
  }

  // Edit a Purchase or Payment. The Opening amount is edited on the supplier itself.
  updateEntry(id, data) {
    const db = getDatabase();
    const e = this._entry(id);
    if (e.entry_type === "Opening") throw new Error("Edit the opening amount on the supplier");
    db.transaction(() => {
      if (e.entry_type === "Payment") {
        const p = this._cleanPayment(data);
        this._guardFunds(p.payment_source, p.amount, id);
        db.prepare("UPDATE supplier_ledger SET entry_date = ?, paid = ?, payment_source = ?, reference_no = ?, note = ? WHERE id = ?")
          .run(p.entry_date, p.amount, p.payment_source, p.reference_no, p.note, id);
      } else {
        db.prepare("UPDATE supplier_ledger SET entry_date = ?, charge = ?, reference_no = ?, note = ? WHERE id = ?")
          .run(dateOf(data.entry_date), amountOf(data.amount, "Bill total"), str(data.reference_no), str(data.note), id);
      }
    })();
  }

  // Deleting a payment puts the money back into cash/bank because balances are always computed from the entries.
  removeEntry(id) {
    const e = this._entry(id);
    if (e.entry_type === "Opening") throw new Error("Edit the opening amount on the supplier");
    getDatabase().prepare("DELETE FROM supplier_ledger WHERE id = ?").run(id);
  }

  // Entries with a running balance. With a date range, broughtForward carries the earlier balance.
  statement(supplierId, { from, to } = {}) {
    const supplier = this.get(supplierId);
    const all = getDatabase().prepare("SELECT * FROM supplier_ledger WHERE supplier_id = ? ORDER BY (entry_type = 'Opening') DESC, entry_date, id").all(supplierId);
    let running = 0;
    let forward = 0;
    const rows = [];
    for (const e of all) {
      running = roundMoney(running + e.charge - e.paid);
      // The opening amount is from before the app was used, so it always counts as brought forward.
      const early = e.entry_type === "Opening";
      if (from && (early || e.entry_date < from)) { forward = running; continue; }
      if (to && !early && e.entry_date > to) continue;
      rows.push({ ...e, balance: running });
    }
    return {
      supplier,
      broughtForward: from ? forward : null,
      rows,
      totals: {
        charged: roundMoney(rows.reduce((s, r) => s + r.charge, 0)),
        paid: roundMoney(rows.reduce((s, r) => s + r.paid, 0)),
      },
      balance: supplier.balance,
    };
  }
}

module.exports = new SupplierService();
