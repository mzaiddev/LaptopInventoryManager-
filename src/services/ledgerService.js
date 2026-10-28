const { getDatabase } = require("../database/dbInit");
const { roundMoney } = require("../utils/money");
const { computeSaleTotals } = require("../shared/saleMath");

class LedgerService {
  // The UI offers Cash and Bank Transfer; both are stored as Cash / Bank.
  _normalizeMethod(m) {
    if (m === undefined || m === null || m === "" || m === "Cash") return "Cash";
    if (m === "Bank" || m === "Bank Transfer") return "Bank";
    throw new Error("Invalid payment method. Use Cash or Bank Transfer.");
  }

  // ==================== REFERENCE NUMBER GENERATION ====================

  generateReference(type) {
    const db = getDatabase();
    const prefix = type === "sale" ? "SALE" : type === "return" ? "RET" : "INV";
    const date = new Date();
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    const count = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM ${type === "sale" ? "sale_issues" : "returns"} WHERE reference_no LIKE ?`,
      )
      .get(`${prefix}-${dateStr}-%`);
    const num = String((count?.cnt || 0) + 1).padStart(4, "0");
    return `${prefix}-${dateStr}-${num}`;
  }

  // ==================== LEDGER ENTRY METHODS ====================

  _addLedgerEntry(customerId, referenceType, referenceId, description, debit, credit, entryDate, paymentMethod = null) {
    const db = getDatabase();
    // Get the last running balance for this customer
    const lastEntry = db.prepare(
      "SELECT running_balance FROM customer_ledger WHERE customer_id = ? ORDER BY entry_date DESC, id DESC LIMIT 1"
    ).get(customerId);
    const lastBalance = lastEntry ? lastEntry.running_balance : 0;
    const runningBalance = roundMoney(lastBalance + debit - credit);

    const result = db.prepare(`
      INSERT INTO customer_ledger (customer_id, reference_type, reference_id, description, debit, credit, running_balance, entry_date, payment_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(customerId, referenceType, referenceId, description, debit, credit, runningBalance, entryDate, paymentMethod);

    return { ledgerId: result.lastInsertRowid, runningBalance };
  }

  _updateLedgerRunningBalances(customerId) {
    const db = getDatabase();
    const entries = db.prepare(
      "SELECT id FROM customer_ledger WHERE customer_id = ? ORDER BY entry_date ASC, id ASC"
    ).all(customerId);

    let runningBalance = 0;
    const updateStmt = db.prepare("UPDATE customer_ledger SET running_balance = ? WHERE id = ?");

    for (const entry of entries) {
      const e = db.prepare("SELECT debit, credit FROM customer_ledger WHERE id = ?").get(entry.id);
      runningBalance = runningBalance + e.debit - e.credit;
      updateStmt.run(runningBalance, entry.id);
    }
  }

  // ==================== CUSTOMER LEDGER QUERIES ====================

  // Ledger list for the screen: one customer or all, newest first, filtered and paged.
  // filters: customer_id, reference_type, date_from, date_to, search, page, pageSize
  getLedgerEntries(filters = {}) {
    const db = getDatabase();
    const where = [];
    const args = [];
    if (filters.customer_id) { where.push("l.customer_id = ?"); args.push(filters.customer_id); }
    if (filters.reference_type) { where.push("l.reference_type = ?"); args.push(filters.reference_type); }
    if (filters.date_from) { where.push("l.entry_date >= ?"); args.push(filters.date_from); }
    if (filters.date_to) { where.push("l.entry_date <= ?"); args.push(filters.date_to); }
    if (filters.search) {
      const like = `%${String(filters.search).replace(/[\\%_]/g, "\\$&")}%`;
      where.push("(c.customer_name LIKE ? ESCAPE '\\' OR l.description LIKE ? ESCAPE '\\')");
      args.push(like, like);
    }
    const sql = where.length ? "WHERE " + where.join(" AND ") : "";
    const from = "FROM customer_ledger l LEFT JOIN customers c ON c.id = l.customer_id";
    const pageSize = Math.min(Math.max(parseInt(filters.pageSize) || 50, 1), 500);
    const page = Math.max(parseInt(filters.page) || 1, 1);
    const total = db.prepare(`SELECT COUNT(*) n ${from} ${sql}`).get(...args).n;
    const rows = db
      .prepare(`SELECT l.*, c.customer_name ${from} ${sql} ORDER BY l.entry_date DESC, l.id DESC LIMIT ? OFFSET ?`)
      .all(...args, pageSize, (page - 1) * pageSize);
    return { rows, total, page, pageSize };
  }

  getCustomerLedger(customerId, filters = {}) {
    const db = getDatabase();
    let query = "SELECT * FROM customer_ledger WHERE customer_id = ?";
    const params = [customerId];

    if (filters.reference_type) {
      query += " AND reference_type = ?";
      params.push(filters.reference_type);
    }

    if (filters.date_from) {
      query += " AND entry_date >= ?";
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += " AND entry_date <= ?";
      params.push(filters.date_to);
    }

    query += " ORDER BY entry_date ASC, id ASC";

    const entries = db.prepare(query).all(...params);

    // Get running balance progress
    let runningBalance = 0;
    for (const entry of entries) {
      // Recalculate to ensure accuracy
      // Use the stored running_balance
    }

    return entries;
  }

  getCustomerLedgerSummary(customerId) {
    const db = getDatabase();

    // Get last running balance from ledger - THIS IS THE SINGLE SOURCE OF TRUTH
    const lastEntry = db.prepare(
      "SELECT running_balance FROM customer_ledger WHERE customer_id = ? ORDER BY entry_date DESC, id DESC LIMIT 1"
    ).get(customerId);

    const ledgerBalance = lastEntry ? lastEntry.running_balance : 0;

    // Get sale-specific stats from sale_issues table
    const saleStats = db.prepare(
      "SELECT COALESCE(SUM(total_amount), 0) as ts, COALESCE(SUM(paid_amount), 0) as tp, COALESCE(SUM(remaining_amount), 0) as tr FROM sale_issues WHERE customer_id = ?"
    ).get(customerId);

    // Get old balance stats
    const oldData = this._getCustomerOldBalanceData(db, customerId);

    // Get ledger entry summary (for detailed breakdown)
    const ledgerSummary = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN reference_type = 'Sale' THEN debit ELSE 0 END), 0) as total_sale_debits,
        COALESCE(SUM(CASE WHEN reference_type = 'Payment' THEN credit ELSE 0 END), 0) as total_payment_credits,
        COALESCE(SUM(CASE WHEN reference_type IN ('OldBalanceDebit') THEN debit ELSE 0 END), 0) as total_old_debits,
        COALESCE(SUM(CASE WHEN reference_type IN ('OldBalanceCredit') THEN credit ELSE 0 END), 0) as total_old_credits,
        COALESCE(SUM(CASE WHEN reference_type = 'Return' THEN credit ELSE 0 END), 0) as total_return_credits
      FROM customer_ledger WHERE customer_id = ?
    `).get(customerId);

    // Total paid from ledger (sum of all Payment type credits)
    const totalPaidFromLedger = db.prepare(
      "SELECT COALESCE(SUM(credit), 0) as total FROM customer_ledger WHERE customer_id = ? AND reference_type = 'Payment'"
    ).get(customerId);

    const ls = ledgerSummary || { total_sale_debits: 0, total_payment_credits: 0, total_old_debits: 0, total_old_credits: 0, total_return_credits: 0 };
    const totalDebits = (ls.total_sale_debits || 0) + (ls.total_old_debits || 0);
    const totalCredits = (ls.total_payment_credits || 0) + (ls.total_old_credits || 0) + (ls.total_return_credits || 0);

    // Plain-language breakdown that always adds up: old + sales - returns - payments (+ other) = balance.
    const old_balance = roundMoney((ls.total_old_debits || 0) - (ls.total_old_credits || 0));
    const sales = roundMoney(ls.total_sale_debits || 0);
    const returns = roundMoney(ls.total_return_credits || 0);
    const payments = roundMoney(ls.total_payment_credits || 0);
    const balance = roundMoney(ledgerBalance);
    const statement = {
      old_balance, sales, returns, payments,
      other: roundMoney(balance - (old_balance + sales - returns - payments)),
      balance,
    };

    return {
      statement,
      // Sale-specific stats
      total_sales: saleStats.ts,
      total_paid_from_sales: saleStats.tp,
      total_outstanding: saleStats.tr,

      // Old balance stats
      old_balance_net: oldData.net,
      old_balance_debit: oldData.debit,
      old_balance_credit: oldData.credit,

      // Ledger stats (SINGLE SOURCE OF TRUTH for what customer owes)
      ledger_balance: ledgerBalance,
      total_paid: totalPaidFromLedger?.total || 0,
      total_debits: totalDebits,
      total_credits: totalCredits,

      // Simple formula for display: Total Due = ledger_balance
      // ledger_balance already accounts for: sales + payments + returns + old balances
      total_due: Math.max(0, ledgerBalance)
    };
  }

  // ==================== CUSTOMER MANAGEMENT ====================

  getAllCustomers(filters = {}) {
    const db = getDatabase();
    const balanceExpr = `COALESCE(
      (SELECT cl.running_balance FROM customer_ledger cl WHERE cl.customer_id=customers.id ORDER BY cl.entry_date DESC,cl.id DESC LIMIT 1),
      COALESCE((SELECT SUM(si.total_amount-si.paid_amount) FROM sale_issues si WHERE si.customer_id=customers.id),0)
        + COALESCE((SELECT SUM(CASE WHEN ob.balance_type='Debit' THEN ob.amount ELSE -ob.amount END) FROM old_balances ob WHERE ob.customer_id=customers.id),0)
    )`;
    let query = `SELECT customers.*, ${balanceExpr} AS ledger_balance, MAX(0,${balanceExpr}) AS total_due,
      (SELECT MAX(si.issue_date) FROM sale_issues si WHERE si.customer_id=customers.id) AS last_sale_date,
      (SELECT MAX(p.payment_date) FROM payments p JOIN sale_issues si ON si.id=p.sale_issue_id WHERE si.customer_id=customers.id) AS last_payment_date,
      COALESCE((SELECT SUM(si.total_amount) FROM sale_issues si WHERE si.customer_id=customers.id),0) AS total_sales,
      COALESCE((SELECT SUM(si.paid_amount) FROM sale_issues si WHERE si.customer_id=customers.id),0) AS total_paid,
      COALESCE((SELECT SUM(si.remaining_amount) FROM sale_issues si WHERE si.customer_id=customers.id),0) AS outstanding,
      COALESCE((SELECT SUM(CASE WHEN ob.balance_type='Debit' THEN ob.amount ELSE -ob.amount END) FROM old_balances ob WHERE ob.customer_id=customers.id),0) AS old_balance,
      (SELECT COUNT(*) FROM sale_issues si WHERE si.customer_id=customers.id) AS sales_count
      FROM customers WHERE 1=1`;
    const params = [];

    if (filters.search) {
      query += " AND (customer_name LIKE ? OR phone LIKE ? OR address LIKE ? OR email LIKE ?)";
      const s = `%${filters.search}%`;
      params.push(s, s, s, s);
    }

    if (filters.status) {
      query += " AND status = ?";
      params.push(filters.status);
    }

    if (filters.hasDue === true || filters.hasDue === '1') query += ` AND (${balanceExpr}) > 0`;

    const sortByDue = filters.sortBy === 'due';
    query += sortByDue ? ` ORDER BY ledger_balance ${filters.sortOrder === 'asc' ? 'ASC' : 'DESC'}, customer_name ASC` : " ORDER BY customer_name ASC";

    if (filters.limit) {
      const offset = filters.page ? (filters.page - 1) * filters.limit : 0;
      const fromIndex = query.indexOf('FROM customers');
      const countQuery = "SELECT COUNT(*) as total " + query.slice(fromIndex, query.lastIndexOf(' ORDER BY '));
      const totalResult = db.prepare(countQuery).get(...params);
      query += " LIMIT ? OFFSET ?";
      params.push(filters.limit, offset);
      const customers = db.prepare(query).all(...params);
      return {
        customers,
        total: totalResult?.total || 0,
        page: filters.page || 1,
        limit: filters.limit,
      };
    }

    return db.prepare(query).all(...params);
  }

  getCustomerById(id) {
    const db = getDatabase();
    return db.prepare("SELECT * FROM customers WHERE id = ?").get(id);
  }

  searchCustomers(query) {
    const db = getDatabase();
    const s = `%${query}%`;
    return db
      .prepare(
        "SELECT id, customer_name, phone, address FROM customers WHERE (customer_name LIKE ? OR phone LIKE ? OR address LIKE ?) AND status = 'Active' ORDER BY customer_name ASC LIMIT 20",
      )
      .all(s, s, s);
  }

  addCustomer(data) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO customers (customer_name, phone, address, email, status, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.customer_name,
      data.phone || "",
      data.address || "",
      data.email || "",
      data.status || "Active",
      data.notes || "",
    );
    return { id: result.lastInsertRowid };
  }

  updateCustomer(id, data) {
    const db = getDatabase();
    db.prepare(`
      UPDATE customers SET
        customer_name = ?, phone = ?, address = ?, email = ?,
        status = ?, notes = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      data.customer_name,
      data.phone || "",
      data.address || "",
      data.email || "",
      data.status || "Active",
      data.notes || "",
      id,
    );
    return { success: true };
  }

  deleteCustomer(id) {
    const db = getDatabase();

    return db.transaction(() => {
      // 1. Delete ledger entries
      db.prepare("DELETE FROM customer_ledger WHERE customer_id = ?").run(id);

      // 2. Delete old balances (CASCADE FK, so this is safe)
      db.prepare("DELETE FROM old_balances WHERE customer_id = ?").run(id);

      // 3. Restore stock for all items in this customer's sales, then delete sales
      const sales = db.prepare("SELECT id FROM sale_issues WHERE customer_id = ?").all(id);
      const restoreItemStock = db.prepare(
        "UPDATE products SET quantity = quantity + ?, status = CASE WHEN status = 'Sold' THEN 'In Stock' ELSE status END, updated_at = datetime('now','localtime') WHERE id = ?"
      );
      const deletePayments = db.prepare("DELETE FROM payments WHERE sale_issue_id = ?");
      const deleteSaleItems = db.prepare("DELETE FROM sale_issue_items WHERE sale_issue_id = ?");
      const deleteSale = db.prepare("DELETE FROM sale_issues WHERE id = ?");

      for (const sale of sales) {
        const items = db.prepare("SELECT product_id, quantity FROM sale_issue_items WHERE sale_issue_id = ?").all(sale.id);
        for (const item of items) {
          restoreItemStock.run(item.quantity, item.product_id);
        }
        deletePayments.run(sale.id);
        deleteSaleItems.run(sale.id);
        deleteSale.run(sale.id);
      }

      // 4. Before deleting returns, deduct the stock that was restored by them
      const returns = db.prepare("SELECT id FROM returns WHERE customer_id = ?").all(id);
      const deductReturnStock = db.prepare(
        "UPDATE products SET quantity = MAX(0, quantity - ?), updated_at = datetime('now','localtime') WHERE id = ?"
      );
      for (const ret of returns) {
        const retItems = db.prepare("SELECT product_id, quantity FROM return_items WHERE return_id = ?").all(ret.id);
        for (const item of retItems) {
          deductReturnStock.run(item.quantity, item.product_id);
        }
      }
      db.prepare("DELETE FROM returns WHERE customer_id = ?").run(id);

      // 5. Now delete the customer itself
      db.prepare("DELETE FROM customers WHERE id = ?").run(id);
    })();

    return { success: true };
  }

  _getCustomerOldBalanceData(db, customerId) {
    try {
      const debit = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM old_balances WHERE customer_id = ? AND balance_type = 'Debit'").get(customerId);
      const credit = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM old_balances WHERE customer_id = ? AND balance_type = 'Credit'").get(customerId);
      const records = db.prepare("SELECT * FROM old_balances WHERE customer_id = ? ORDER BY created_at DESC").all(customerId);
      return {
        debit: debit?.total || 0,
        credit: credit?.total || 0,
        net: (debit?.total || 0) - (credit?.total || 0),
        records: records || []
      };
    } catch(e) {
      return { debit: 0, credit: 0, net: 0, records: [] };
    }
  }

  getCustomerBalance(id) {
    const db = getDatabase();
    const s = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as ts, COALESCE(SUM(paid_amount), 0) as tp FROM sale_issues WHERE customer_id = ?").get(id);
    const oldData = this._getCustomerOldBalanceData(db, id);
    return {
      opening_balance: oldData.net,
      total_sales: s.ts,
      total_paid: s.tp,
      outstanding_balance: s.ts - s.tp,
      old_balance_debit: oldData.debit,
      old_balance_credit: oldData.credit,
      old_balance_net: oldData.net,
      combined_total: (s.ts - s.tp) + oldData.net
    };
  }

  // ==================== SALE / ISSUE CREATION ====================

  createSale(data) {
    const db = getDatabase();
    const errors = [];
    for (const item of data.items) {
      const product = db.prepare("SELECT quantity, product_name FROM products WHERE id = ?").get(item.product_id);
      if (!product) { errors.push(`Product ID ${item.product_id} not found`); continue; }
      if (product.quantity < item.quantity) {
        errors.push(`Insufficient stock for "${product.product_name}". Available: ${product.quantity}, Requested: ${item.quantity}`);
      }
    }
    if (errors.length > 0) { throw new Error(errors.join("\n")); }

    const referenceNo = this.generateReference("sale");
    const discountType = data.discount_type || "none";
    const calc = computeSaleTotals(data.items, discountType, Number(data.discount_value) || 0);
    const method = this._normalizeMethod(data.payment_method);
    const totalAmount = calc.total;
    const ledgerType = data.ledger_type || "Cash";
    const paidAmount = ledgerType === "Cash" ? totalAmount : roundMoney(Math.max(0, Math.min(data.paid_amount || 0, totalAmount)));
    const remainingAmount = roundMoney(totalAmount - paidAmount);
    const paymentStatus = remainingAmount <= 0 ? "Paid" : paidAmount > 0 ? "Partial" : "Outstanding";

    return db.transaction(() => {
      // Create sale issue directly
      const saleResult = db.prepare("INSERT INTO sale_issues (customer_id, reference_no, issue_date, transaction_type, total_amount, paid_amount, remaining_amount, payment_status, ledger_type, notes, discount_type, discount_value, discount_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        data.customer_id, referenceNo, data.issue_date, data.transaction_type || "Sale",
        totalAmount, paidAmount, remainingAmount, paymentStatus, ledgerType, data.notes || "",
        discountType, discountType === "none" ? 0 : Number(data.discount_value) || 0, calc.saleDiscount
      );
      const saleId = saleResult.lastInsertRowid;

      // Create sale items and reduce stock
      const itemStmt = db.prepare("INSERT INTO sale_issue_items (sale_issue_id, product_id, product_name, quantity, unit_price, subtotal, discount_amount) VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const [i, item] of data.items.entries()) {
        const product = db.prepare("SELECT product_name FROM products WHERE id = ?").get(item.product_id);
        itemStmt.run(saleId, item.product_id, product?.product_name || "Unknown", item.quantity, item.unit_price, calc.lines[i].net, calc.lines[i].discount);
        db.prepare("UPDATE products SET quantity = quantity - ?, status = CASE WHEN quantity - ? <= 0 THEN 'Sold' ELSE status END, updated_at = datetime('now','localtime') WHERE id = ?").run(item.quantity, item.quantity, item.product_id);
      }

      // Create payment record FIRST (to get the reference ID for ledger entries)
      let paymentId = null;
      if (paidAmount > 0) {
        const paymentResult = db.prepare("INSERT INTO payments (sale_issue_id, payment_date, amount, payment_method, note) VALUES (?, ?, ?, ?, ?)").run(
          saleId, data.issue_date, paidAmount, method, `Payment for ${referenceNo}`
        );
        paymentId = paymentResult.lastInsertRowid;
      }

      // Create ledger entries using the unified 2-entries system:
      // ALWAYS: 1 DEBIT entry for the sale amount
      // IF PAID: 1 CREDIT entry for the payment amount
      // This ensures the sale amount ALWAYS shows as a DEBIT in the ledger
      // and the running balance is always accurate.

      // DEBIT entry: the sale (customer owes this amount)
      this._addLedgerEntry(
        data.customer_id, 'Sale', saleId,
        `Sale ${referenceNo}`,
        totalAmount, 0, data.issue_date
      );

      // CREDIT entry: any payment made (reduces what customer owes)
      if (paidAmount > 0) {
        this._addLedgerEntry(
          data.customer_id, 'Payment', paymentId,
          `Payment for ${referenceNo} - ${method}`,
          0, paidAmount, data.issue_date
        );
      }

      return { saleId, referenceNo };
    })();
  }

  // ==================== SALES OPERATIONS ====================

  getAllSales(filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT si.id as sale_id, si.reference_no as sale_reference, si.issue_date as transaction_date,
        si.transaction_type, si.total_amount, si.paid_amount, si.remaining_amount,
        (si.discount_amount + COALESCE((SELECT SUM(discount_amount) FROM sale_issue_items WHERE sale_issue_id = si.id), 0)) as total_discount,
        (SELECT COALESCE(SUM(quantity * unit_price), 0) FROM sale_issue_items WHERE sale_issue_id = si.id) as gross_amount,
        si.payment_status as status, si.ledger_type, si.notes as sale_notes,
        c.id as customer_id, c.customer_name, c.phone as customer_phone,
        (SELECT COUNT(*) FROM sale_issue_items WHERE sale_issue_id = si.id) as items_count,
        (SELECT GROUP_CONCAT(product_name || ' x' || quantity, ', ') FROM sale_issue_items WHERE sale_issue_id = si.id) as items_summary
      FROM sale_issues si
      LEFT JOIN customers c ON si.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.search) {
      query += " AND (c.customer_name LIKE ? OR si.reference_no LIKE ?)";
      const s = `%${filters.search}%`;
      params.push(s, s);
    }

    if (filters.customer_id) { query += " AND si.customer_id = ?"; params.push(filters.customer_id); }
    if (filters.status) { query += " AND si.payment_status = ?"; params.push(filters.status); }
    if (filters.ledger_type) { query += " AND si.ledger_type = ?"; params.push(filters.ledger_type); }
    if (filters.date_from) { query += " AND si.issue_date >= ?"; params.push(filters.date_from); }
    if (filters.date_to) { query += " AND si.issue_date <= ?"; params.push(filters.date_to); }

    query += ` ORDER BY ${filters.sortBy || "si.created_at"} ${filters.sortOrder === "asc" ? "ASC" : "DESC"}`;

    const limit = filters.limit || 50;
    const offset = filters.page ? (filters.page - 1) * limit : 0;

    const fromIdx = query.indexOf('FROM sale_issues');
    const totalResult = db.prepare('SELECT COUNT(*) as total ' + (fromIdx >= 0 ? query.substring(fromIdx) : '')).get(...params);

    query += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const sales = db.prepare(query).all(...params);

    for (const sale of sales) {
      const rawPayments = db.prepare(
        "SELECT * FROM payments WHERE sale_issue_id = ? ORDER BY payment_date ASC, id ASC"
      ).all(sale.sale_id);
      let runningPaid = 0;
      sale.payments = rawPayments.map(p => {
        runningPaid += p.amount;
        return { ...p, running_paid: runningPaid, remaining_after: Math.max(0, sale.total_amount - runningPaid) };
      });

      // Ledger-aware display values — the customer's ledger balance is the
      // single source of truth for what the customer owes. Only treat the
      // ledger as authoritative when the customer actually has ledger entries;
      // legacy sales without ledger backing fall back to the sale's own values.
      let ledgerBalance = 0;
      let hasLedgerEntries = false;
      if (sale.customer_id) {
        const ledgerCheck = db.prepare(
          "SELECT running_balance FROM customer_ledger WHERE customer_id = ? ORDER BY entry_date DESC, id DESC LIMIT 1"
        ).get(sale.customer_id);
        ledgerBalance = ledgerCheck ? ledgerCheck.running_balance : 0;
        hasLedgerEntries = ledgerCheck !== undefined;
      }
      sale.ledger_balance = ledgerBalance;
      sale.ledger_settled = hasLedgerEntries && sale.ledger_balance <= 0;
      if (sale.ledger_settled) {
        // Customer owes nothing (or we owe them) → sale shows as fully paid
        sale.display_paid = sale.total_amount;
        sale.display_remaining = 0;
        sale.display_status = "Paid";
      } else {
        sale.display_paid = sale.paid_amount;
        sale.display_remaining = sale.remaining_amount;
        sale.display_status = sale.status;
      }
    }

    return { sales, total: totalResult?.total || 0, page: filters.page || 1, limit, totalPages: Math.ceil((totalResult?.total || 0) / limit) };
  }

  getSaleById(id) {
    const db = getDatabase();
    const sale = db.prepare("SELECT si.*, c.customer_name, c.phone, c.address FROM sale_issues si LEFT JOIN customers c ON si.customer_id = c.id WHERE si.id = ?").get(id);
    if (!sale) return null;
    sale.items = db.prepare("SELECT sii.*, p.category, p.serial_number FROM sale_issue_items sii LEFT JOIN products p ON sii.product_id = p.id WHERE sii.sale_issue_id = ?").all(id);
    sale.payments = db.prepare("SELECT * FROM payments WHERE sale_issue_id = ? ORDER BY payment_date DESC").all(id);
    sale.returns = db.prepare("SELECT id, return_date, total_return_amount, reason, status FROM returns WHERE sale_issue_id = ? ORDER BY return_date DESC").all(id);
    return sale;
  }

  addPayment(data) {
    const db = getDatabase();
    const sale = db.prepare("SELECT * FROM sale_issues WHERE id = ?").get(data.sale_issue_id);
    if (!sale) throw new Error("Sale not found");
    if (!(data.amount > 0)) throw new Error("Payment amount must be greater than 0");
    if (data.amount > sale.remaining_amount + 0.005) {
      throw new Error(`Payment exceeds the remaining balance (${sale.remaining_amount})`);
    }
    const method = this._normalizeMethod(data.payment_method);

    const newPaid = roundMoney(sale.paid_amount + data.amount);
    const newRemaining = roundMoney(sale.total_amount - newPaid);
    const newStatus = newRemaining <= 0 ? "Paid" : "Partial";

    const result = db.transaction(() => {
      // Insert payment
      const paymentResult = db.prepare("INSERT INTO payments (sale_issue_id, payment_date, amount, payment_method, note) VALUES (?, ?, ?, ?, ?)").run(
        data.sale_issue_id, data.payment_date, data.amount, method, data.note || ""
      );

      // Update sale
      db.prepare("UPDATE sale_issues SET paid_amount = ?, remaining_amount = ?, payment_status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
        newPaid, newRemaining, newStatus, data.sale_issue_id
      );

      // Create ledger CREDIT entry for payment
      this._addLedgerEntry(
        sale.customer_id,
        'Payment',
        paymentResult.lastInsertRowid,
        `Payment for ${sale.reference_no} - ${method}`,
        0,
        data.amount,
        data.payment_date
      );

      return { success: true, paymentId: paymentResult.lastInsertRowid };
    })();

    return result;
  }

  // ==================== DIRECT LEDGER PAYMENT (not tied to a specific sale) ====================

  addLedgerPayment(data) {
    const db = getDatabase();
    const customer = db.prepare("SELECT id, customer_name FROM customers WHERE id = ?").get(data.customer_id);
    if (!customer) throw new Error("Customer not found");
    if (!(data.amount > 0)) throw new Error("Payment amount must be greater than 0");
    const method = this._normalizeMethod(data.payment_method);

    return db.transaction(() => {
      // Create a ledger entry directly as a payment credit
      const result = this._addLedgerEntry(
        data.customer_id,
        'Payment',
        null,
        data.description || `Payment received - ${method}`,
        0,
        data.amount,
        data.payment_date,
        method
      );

      return { success: true, ledgerId: result.ledgerId, runningBalance: result.runningBalance };
    })();
  }

  // ==================== LEDGER OLD BALANCE ENTRY ====================

  addLedgerOldBalance(data) {
    const db = getDatabase();
    const customer = db.prepare("SELECT id, customer_name FROM customers WHERE id = ?").get(data.customer_id);
    if (!customer) throw new Error("Customer not found");
    if (!["Debit", "Credit"].includes(data.balance_type)) throw new Error("Old balance type must be Debit or Credit");
    if (!(Number(data.amount) > 0)) throw new Error("Old balance amount must be greater than 0");

    return db.transaction(() => {
      // First add to old_balances table for legacy support
      const obResult = db.prepare("INSERT INTO old_balances (customer_id, amount, balance_type, notes) VALUES (?, ?, ?, ?)").run(
        data.customer_id, data.amount, data.balance_type, data.notes || ""
      );

      // Then add to ledger
      const refType = data.balance_type === 'Debit' ? 'OldBalanceDebit' : 'OldBalanceCredit';
      const debit = data.balance_type === 'Debit' ? data.amount : 0;
      const credit = data.balance_type === 'Credit' ? data.amount : 0;
      const description = data.notes || `${data.balance_type === 'Debit' ? 'Old Debit' : 'Old Credit'} Balance`;

      const result = this._addLedgerEntry(
        data.customer_id,
        refType,
        obResult.lastInsertRowid,
        description,
        debit,
        credit,
        data.entry_date || new Date().toISOString().split('T')[0]
      );

      return { success: true, oldBalanceId: obResult.lastInsertRowid, ledgerId: result.ledgerId, runningBalance: result.runningBalance };
    })();
  }

  // ==================== RETURNS ====================

  createReturn(data) {
    const db = getDatabase();

    const customer = db
      .prepare("SELECT id, customer_name FROM customers WHERE id = ?")
      .get(data.customer_id);
    if (!customer) {
      throw new Error("Customer not found. Please select a valid customer.");
    }

    const sale = db
      .prepare("SELECT * FROM sale_issues WHERE id = ?")
      .get(data.sale_issue_id);
    if (!sale) {
      throw new Error("Sale/Issue not found");
    }

    const errors = [];
    for (const item of data.items) {
      const originalItem = db
        .prepare("SELECT * FROM sale_issue_items WHERE sale_issue_id = ? AND product_id = ?")
        .get(data.sale_issue_id, item.product_id);
      if (!originalItem) {
        errors.push(`Product ID ${item.product_id} was not in the original sale`);
        continue;
      }
      const alreadyReturned = db
        .prepare(
          `SELECT COALESCE(SUM(quantity), 0) as returned_qty
          FROM return_items ri
          JOIN returns r ON ri.return_id = r.id
          WHERE r.sale_issue_id = ? AND ri.product_id = ? AND r.status = 'Completed'`,
        )
        .get(data.sale_issue_id, item.product_id);
      const availableToReturn = originalItem.quantity - (alreadyReturned?.returned_qty || 0);
      if (item.quantity > availableToReturn) {
        errors.push(
          `Cannot return ${item.quantity} of "${originalItem.product_name}". Maximum returnable: ${availableToReturn}`,
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }

    const returnRef = this.generateReference("return");
    const itemsNetTotal = db.prepare("SELECT COALESCE(SUM(subtotal),0) t FROM sale_issue_items WHERE sale_issue_id = ?").get(data.sale_issue_id).t;
    // Discounted sales refund the net price (item discount + share of the sale discount);
    // undiscounted sales keep the price the caller sent.
    const items = data.items.map((item) => {
      const orig = db.prepare("SELECT quantity, subtotal, discount_amount FROM sale_issue_items WHERE sale_issue_id = ? AND product_id = ?").get(data.sale_issue_id, item.product_id);
      if (!(sale.discount_amount > 0 || orig.discount_amount > 0)) return item;
      const share = itemsNetTotal > 0 ? 1 - sale.discount_amount / itemsNetTotal : 1;
      return { ...item, unit_price: roundMoney((orig.subtotal * share) / orig.quantity) };
    });
    const totalReturnAmount = roundMoney(items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0,
    ));

    for (const item of items) {
      const prodExists = db.prepare("SELECT id FROM products WHERE id = ?").get(item.product_id);
      if (!prodExists) {
        throw new Error(`Product ID ${item.product_id} no longer exists in inventory.`);
      }
    }

    const result = db.transaction(() => {
      const returnStmt = db.prepare("INSERT INTO returns (customer_id, sale_issue_id, reference_no, return_date, reason, total_return_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'Completed')");
      let returnId;
      try {
        const returnResult = returnStmt.run(data.customer_id, data.sale_issue_id, returnRef, data.return_date, data.reason || "", totalReturnAmount);
        returnId = returnResult.lastInsertRowid;
      } catch (insErr) {
        if (insErr.message.includes("FOREIGN KEY")) {
          throw new Error(`Cannot create return: the sale or customer reference is invalid.`);
        }
        throw insErr;
      }

      const itemStmt = db.prepare(`
        INSERT INTO return_items (return_id, product_id, product_name, quantity, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const restoreStockStmt = db.prepare(`
        UPDATE products SET quantity = quantity + ?, status = CASE WHEN status = 'Sold' THEN 'In Stock' ELSE status END, updated_at = datetime('now','localtime')
        WHERE id = ?
      `);

      for (const item of items) {
        const product = db
          .prepare("SELECT product_name FROM products WHERE id = ?")
          .get(item.product_id);
        try {
          itemStmt.run(
            returnId,
            item.product_id,
            product?.product_name || "Unknown",
            item.quantity,
            item.unit_price,
            roundMoney(item.quantity * item.unit_price),
          );
        } catch (itemErr) {
          if (itemErr.message.includes("FOREIGN KEY")) {
            throw new Error(`Cannot add return item "${product?.product_name || item.product_id}" (Product ID: ${item.product_id}): the product no longer exists in inventory.`);
          }
          throw itemErr;
        }
        restoreStockStmt.run(item.quantity, item.product_id);
      }

      // Add ledger entry for return (credit - reduces customer's debt)
      let ledgerBalanceAfterReturn = null;
      if (totalReturnAmount > 0) {
        const ledgerResult = this._addLedgerEntry(
          data.customer_id,
          'Return',
          returnId,
          `Return ${returnRef}`,
          0,
          totalReturnAmount,
          data.return_date
        );
        // The running balance returned by _addLedgerEntry is the correct
        // post-return balance — deterministic regardless of how the return
        // date orders against other entries (e.g., later payments).
        ledgerBalanceAfterReturn = ledgerResult ? ledgerResult.runningBalance : null;
        // Recalculate the stored running balances so the ledger sequence stays
        // chronologically consistent even for backdated returns. This does not
        // change the current balance (the last entry's balance matches the
        // returned value), but keeps every intermediate row accurate.
        this._updateLedgerRunningBalances(data.customer_id);
      }

      if (totalReturnAmount > 0) {
        const newTotal = Math.max(0, sale.total_amount - totalReturnAmount);

        // SINGLE SOURCE OF TRUTH: the customer's ledger running balance
        // immediately after this return's CREDIT entry was recorded.
        const ledgerBalance = ledgerBalanceAfterReturn !== null
          ? ledgerBalanceAfterReturn
          : 0;

        let newPaid, newRemaining, newStatus;
        if (ledgerBalance <= 0) {
          // Customer owes nothing (or we owe them) → this sale shows as fully Paid
          newPaid = newTotal;
          newRemaining = 0;
          newStatus = "Paid";
        } else {
          // Reflect the reduced total using the sale's own payment records
          newPaid = Math.min(sale.paid_amount, newTotal);
          newRemaining = newTotal - newPaid;
          newStatus = newRemaining <= 0 ? (newPaid > 0 ? "Paid" : "Outstanding") : "Partial";
        }
        db.prepare("UPDATE sale_issues SET total_amount = ?, paid_amount = ?, remaining_amount = ?, payment_status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(newTotal, newPaid, newRemaining, newStatus, data.sale_issue_id);
      }

      return { returnId, referenceNo: returnRef };
    })();

    return result;
  }

  getAllReturns(filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT r.*, c.customer_name, si.reference_no as sale_reference
      FROM returns r
      LEFT JOIN customers c ON r.customer_id = c.id
      LEFT JOIN sale_issues si ON r.sale_issue_id = si.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.search) {
      query += " AND (c.customer_name LIKE ? OR si.reference_no LIKE ? OR r.reason LIKE ?)";
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }

    if (filters.customer_id) {
      query += " AND r.customer_id = ?";
      params.push(filters.customer_id);
    }

    if (filters.status) {
      query += " AND r.status = ?";
      params.push(filters.status);
    }

    if (filters.date_from) {
      query += " AND r.return_date >= ?";
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += " AND r.return_date <= ?";
      params.push(filters.date_to);
    }

    query += " ORDER BY r.created_at DESC";

    const limit = filters.limit || 50;
    const offset = filters.page ? (filters.page - 1) * limit : 0;

    const countQuery = query.replace(
      "SELECT r.*, c.customer_name, si.reference_no as sale_reference",
      "SELECT COUNT(*) as total",
    );
    const totalResult = db.prepare(countQuery).get(...params);

    query += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const returns = db.prepare(query).all(...params);

    for (const ret of returns) {
      ret.items = db.prepare("SELECT * FROM return_items WHERE return_id = ?").all(ret.id);
    }

    return { returns, total: totalResult?.total || 0, page: filters.page || 1, limit };
  }

  // ==================== DAMAGE MANAGEMENT ====================

  recordDamage(data) {
    const db = getDatabase();

    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(data.product_id);
    if (!product) {
      throw new Error("Product not found");
    }

    if (data.quantity > product.quantity) {
      throw new Error(
        `Cannot record ${data.quantity} damaged. Available quantity: ${product.quantity}`
      );
    }

    const date = new Date();
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    const countRef = db.prepare("SELECT COUNT(*) as cnt FROM damage_records").get();
    const referenceNo = `DMG-${dateStr}-${String((countRef?.cnt || 0) + 1).padStart(4, "0")}`;

    const result = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO damage_records (product_id, quantity, damage_type, reason, reference_no, recorded_by, recorded_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insResult = stmt.run(
        data.product_id,
        data.quantity,
        data.damage_type || 'Damaged',
        data.reason || '',
        referenceNo,
        data.recorded_by || '',
        data.recorded_date || new Date().toISOString().split('T')[0],
        data.notes || ''
      );

      const newQty = product.quantity - data.quantity;
      const newStatus = newQty <= 0 ? 'Damaged' : product.status;
      db.prepare(
        "UPDATE products SET quantity = ?, status = ?, updated_at = datetime('now','localtime') WHERE id = ?"
      ).run(newQty, newStatus, data.product_id);

      return { id: insResult.lastInsertRowid, referenceNo };
    })();

    return result;
  }

  getAllDamages(filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT dr.*, p.product_name, p.category, p.purchase_price,
        CASE WHEN dr.damage_type = 'Corrected' THEN 'Restored' ELSE dr.damage_type END as display_type
      FROM damage_records dr
      LEFT JOIN products p ON dr.product_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.product_id) {
      query += " AND dr.product_id = ?";
      params.push(filters.product_id);
    }

    if (filters.damage_type) {
      query += " AND dr.damage_type = ?";
      params.push(filters.damage_type);
    }

    if (filters.date_from) {
      query += " AND dr.recorded_date >= ?";
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += " AND dr.recorded_date <= ?";
      params.push(filters.date_to);
    }

    query += " ORDER BY dr.created_at DESC";

    const limit = filters.limit || 50;
    const offset = filters.page ? (filters.page - 1) * limit : 0;

    const whereMatch = query.match(/WHERE[\s\S]*/);
    const whereClause = whereMatch ? whereMatch[0] : '';
    let totalResult;
    try {
      totalResult = db.prepare("SELECT COUNT(*) as total FROM damage_records dr LEFT JOIN products p ON dr.product_id = p.id " + whereClause).get(...params);
    } catch(e) {
      totalResult = { total: 0 };
    }

    query += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const damages = db.prepare(query).all(...params);

    for (const dmg of damages) {
      const product = db.prepare("SELECT quantity, status FROM products WHERE id = ?").get(dmg.product_id);
      if (product) {
        dmg.current_qty = product.quantity;
        dmg.product_status = product.status;
      } else {
        dmg.current_qty = 0;
        dmg.product_status = 'Deleted';
      }
    }

    return { damages, total: totalResult?.total || 0, page: filters.page || 1, limit };
  }

  correctDamage(id, correctionData) {
    const db = getDatabase();
    const existing = db.prepare("SELECT * FROM damage_records WHERE id = ?").get(id);
    if (!existing) {
      throw new Error("Damage record not found");
    }

    const result = db.transaction(() => {
      const newQuantity = correctionData.quantity !== undefined ? correctionData.quantity : existing.quantity;
      const restoreQty = existing.quantity - newQuantity;

      db.prepare(`
        UPDATE damage_records SET
          damage_type = 'Corrected',
          reason = CASE WHEN ? != '' THEN ? ELSE reason END,
          notes = CASE WHEN ? != '' THEN ? ELSE notes END,
          updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(
        correctionData.reason || '', correctionData.reason || '',
        correctionData.notes || '', correctionData.notes || '',
        id
      );

      if (restoreQty > 0) {
        const product = db.prepare("SELECT * FROM products WHERE id = ?").get(existing.product_id);
        if (product) {
          const newQty = product.quantity + restoreQty;
          const newStatus = newQty > 0 ? 'In Stock' : product.status;
          db.prepare(
            "UPDATE products SET quantity = ?, status = ?, updated_at = datetime('now','localtime') WHERE id = ?"
          ).run(newQty, newStatus, existing.product_id);
        }
      }

      return { success: true };
    })();

    return result;
  }

  getCustomerFullProfile(customerId) {
    const db = getDatabase();
    const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId);
    if (!customer) return null;

    const sales = db.prepare("SELECT si.*, (SELECT COUNT(*) FROM sale_issue_items WHERE sale_issue_id = si.id) as items_count FROM sale_issues si WHERE si.customer_id = ? ORDER BY si.issue_date DESC").all(customerId);

    for (const sale of sales) {
      const rawPayments = db.prepare("SELECT * FROM payments WHERE sale_issue_id = ? ORDER BY payment_date ASC, id ASC").all(sale.id);
      let runningPaid = 0;
      sale.payments = rawPayments.map(p => { runningPaid += p.amount; const ra = sale.total_amount - runningPaid; return { ...p, running_paid: runningPaid, remaining_after: Math.max(0, ra) }; });
      sale.items = db.prepare("SELECT sii.*, p.category, p.serial_number FROM sale_issue_items sii LEFT JOIN products p ON sii.product_id = p.id WHERE sii.sale_issue_id = ?").all(sale.id);
    }

    const returns = db.prepare("SELECT r.*, si.reference_no as sale_reference FROM returns r LEFT JOIN sale_issues si ON r.sale_issue_id = si.id WHERE r.customer_id = ? ORDER BY r.return_date DESC").all(customerId);
    for (const ret of returns) { ret.items = db.prepare("SELECT * FROM return_items WHERE return_id = ?").all(ret.id); }

    const damages = db.prepare("SELECT dr.*, p.product_name, p.category FROM damage_records dr LEFT JOIN products p ON dr.product_id = p.id WHERE dr.product_id IN (SELECT DISTINCT sii.product_id FROM sale_issue_items sii JOIN sale_issues si ON sii.sale_issue_id = si.id WHERE si.customer_id = ?) ORDER BY dr.created_at DESC").all(customerId);

    const balance = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as ts, COALESCE(SUM(paid_amount), 0) as tp, COALESCE(SUM(remaining_amount), 0) as to_ FROM sale_issues WHERE customer_id = ?").get(customerId);

    const oldData = this._getCustomerOldBalanceData(db, customerId);

    // Get ledger entries
    const ledgerEntries = db.prepare("SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY entry_date ASC, id ASC").all(customerId);

    // Get ledger summary
    const ledgerSummary = this.getCustomerLedgerSummary(customerId);

    return {
      customer, sales, returns, damages,
      old_balances: oldData.records,
      ledger_entries: ledgerEntries,
      balance: {
        opening_balance: 0,
        total_sales: balance.ts || 0,
        total_paid: ledgerSummary.total_paid || 0,
        total_outstanding: balance.to_ || 0,
        old_balance_debit: oldData.debit,
        old_balance_credit: oldData.credit,
        old_balance_net: oldData.net,
        ledger_balance: ledgerSummary.ledger_balance,
        total_due: ledgerSummary.total_due,
        total_debits: ledgerSummary.total_debits,
        total_credits: ledgerSummary.total_credits,
        statement: ledgerSummary.statement
      }
    };
  }

  getCustomerStatement(customerId) {
    const db = getDatabase();
    const profile = this.getCustomerFullProfile(customerId);
    if (!profile) return null;

    const settings = {};
    const dbSettings = db.prepare("SELECT * FROM settings").all();
    for (const row of dbSettings) {
      settings[row.key] = row.value;
    }

    return {
      shopName: settings.shop_name || 'Laptop Inventory Manager',
      shopAddress: settings.shop_address || '',
      shopPhone: settings.phone_number || '',
      shopEmail: settings.email || '',
      shop: {
        shop_address: settings.shop_address || '',
        phone_number: settings.phone_number || '',
        phone_number_2: settings.phone_number_2 || '',
        google_map_link: settings.google_map_link || '',
        easypaisa_number: settings.easypaisa_number || '',
        bank_name: settings.bank_name || '',
        bank_account_number: settings.bank_account_number || '',
      },
      currency: settings.currency || 'USD',
      customer: profile.customer,
      sales: profile.sales,
      returns: profile.returns,
      damages: profile.damages,
      ledger_entries: profile.ledger_entries,
      balance: profile.balance,
      generatedAt: new Date().toISOString()
    };
  }

  // ==================== DASHBOARD / REPORTS ====================

  getSalesSummary() {
    const db = getDatabase();
    const to = db.prepare("SELECT COALESCE(SUM(remaining_amount), 0) FROM sale_issues").get()['COALESCE(SUM(remaining_amount), 0)'];
    const ts = db.prepare("SELECT COALESCE(SUM(total_amount), 0) FROM sale_issues").get()['COALESCE(SUM(total_amount), 0)'];
    const tc = db.prepare("SELECT COALESCE(SUM(paid_amount), 0) FROM sale_issues").get()['COALESCE(SUM(paid_amount), 0)'];
    const ac = db.prepare("SELECT COUNT(*) FROM customers WHERE status='Active'").get()['COUNT(*)'];
    const tds = db.prepare("SELECT COALESCE(SUM(total_amount), 0) FROM sale_issues WHERE date(issue_date)=date('now','localtime')").get()['COALESCE(SUM(total_amount), 0)'];
    const tdp = db.prepare("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE date(payment_date)=date('now','localtime')").get()['COALESCE(SUM(amount), 0)'];
    const sc = db.prepare("SELECT payment_status, COUNT(*) as cnt FROM sale_issues GROUP BY payment_status").all();

    // Get ledger totals
    const ledgerTotalDebit = db.prepare("SELECT COALESCE(SUM(debit), 0) FROM customer_ledger").get()['COALESCE(SUM(debit), 0)'];
    const ledgerTotalCredit = db.prepare("SELECT COALESCE(SUM(credit), 0) FROM customer_ledger").get()['COALESCE(SUM(credit), 0)'];

    return {
      total_outstanding: to,
      total_sales: ts,
      total_collected: tc,
      active_customers: ac,
      today_sales: tds,
      today_payments: tdp,
      sale_counts: sc,
      ledger_total_debit: ledgerTotalDebit,
      ledger_total_credit: ledgerTotalCredit,
      ledger_net: ledgerTotalDebit - ledgerTotalCredit
    };
  }

  getSalesReport(filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT si.*, c.customer_name,
        (si.discount_amount + COALESCE((SELECT SUM(discount_amount) FROM sale_issue_items WHERE sale_issue_id = si.id), 0)) as total_discount,
        (SELECT COALESCE(SUM(quantity * unit_price), 0) FROM sale_issue_items WHERE sale_issue_id = si.id) as gross_amount,
        (SELECT GROUP_CONCAT(sii.product_name || ' x' || sii.quantity, ', ') FROM sale_issue_items sii WHERE sii.sale_issue_id = si.id) as items_summary
      FROM sale_issues si
      LEFT JOIN customers c ON si.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.date_from) {
      query += " AND si.issue_date >= ?";
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      query += " AND si.issue_date <= ?";
      params.push(filters.date_to);
    }
    if (filters.customer_id) {
      query += " AND si.customer_id = ?";
      params.push(filters.customer_id);
    }
    if (filters.payment_status) {
      query += " AND si.payment_status = ?";
      params.push(filters.payment_status);
    }

    query += " ORDER BY si.created_at DESC";
    return db.prepare(query).all(...params);
  }

  getOutstandingReport() {
    const db = getDatabase();
    return db.prepare("SELECT c.id as customer_id, c.customer_name, c.phone, COALESCE(SUM(si.total_amount), 0) as total_sales, COALESCE(SUM(si.paid_amount), 0) as total_paid, COALESCE(SUM(si.remaining_amount), 0) as total_outstanding, COUNT(si.id) as invoice_count FROM customers c LEFT JOIN sale_issues si ON c.id = si.customer_id AND si.remaining_amount > 0 WHERE c.status = 'Active' GROUP BY c.id HAVING total_outstanding > 0 ORDER BY total_outstanding DESC").all();
  }

  getCustomerLedgerReport() {
    const db = getDatabase();
    // Get all customers with their ledger balances
    const customers = db.prepare("SELECT id, customer_name, phone FROM customers WHERE status = 'Active' ORDER BY customer_name ASC").all();

    const result = [];
    for (const c of customers) {
      const lastEntry = db.prepare("SELECT running_balance FROM customer_ledger WHERE customer_id = ? ORDER BY entry_date DESC, id DESC LIMIT 1").get(c.id);
      const saleOutstanding = db.prepare("SELECT COALESCE(SUM(remaining_amount), 0) as total FROM sale_issues WHERE customer_id = ?").get(c.id);

      result.push({
        customer_id: c.id,
        customer_name: c.customer_name,
        phone: c.phone,
        ledger_balance: lastEntry ? lastEntry.running_balance : 0,
        sale_outstanding: saleOutstanding.total || 0
      });
    }

    return result;
  }

  // ==================== DELETE LEDGER ENTRY ====================
  deleteLedgerEntry(entryId) {
    const db = getDatabase();

    const entry = db.prepare("SELECT * FROM customer_ledger WHERE id = ?").get(entryId);
    if (!entry) {
      throw new Error("Ledger entry not found");
    }

    return db.transaction(() => {
      // Handle different entry types
      if (entry.reference_type === 'Sale') {
        throw new Error("Cannot delete a sale from ledger. Use Sales History to delete the sale.");
      }

      if (entry.reference_type === 'Payment' && entry.reference_id !== null) {
        throw new Error("Cannot delete a sale payment from ledger. Use Sales History to delete the payment.");
      }

      if (entry.reference_type === 'Return') {
        throw new Error("Cannot delete a return from ledger. Use Returns page to delete the return.");
      }

      // For OldBalance entries, also delete from old_balances table
      if (entry.reference_type === 'OldBalanceDebit' || entry.reference_type === 'OldBalanceCredit') {
        if (entry.reference_id) {
          db.prepare("DELETE FROM old_balances WHERE id = ?").run(entry.reference_id);
        }
      }

      // Delete the ledger entry
      db.prepare("DELETE FROM customer_ledger WHERE id = ?").run(entryId);

      // Recalculate running balances
      this._updateLedgerRunningBalances(entry.customer_id);

      return { success: true };
    })();
  }

  // ==================== DELETE SALE ====================
  deleteSale(saleId) {
    const db = getDatabase();

    const sale = db.prepare("SELECT * FROM sale_issues WHERE id = ?").get(saleId);
    if (!sale) {
      throw new Error("Sale not found");
    }

    return db.transaction(() => {
      // Restore stock for all items in the sale
      const items = db.prepare("SELECT product_id, quantity FROM sale_issue_items WHERE sale_issue_id = ?").all(saleId);
      for (const item of items) {
        db.prepare("UPDATE products SET quantity = quantity + ?, status = CASE WHEN status = 'Sold' THEN 'In Stock' WHEN quantity + ? > 0 THEN status ELSE status END, updated_at = datetime('now','localtime') WHERE id = ?").run(item.quantity, item.quantity, item.product_id);
      }

      // Delete ledger entries for this sale
      db.prepare("DELETE FROM customer_ledger WHERE customer_id = ? AND reference_type = 'Sale' AND reference_id = ?").run(sale.customer_id, saleId);

      // Delete payments and their ledger entries
      const payments = db.prepare("SELECT id FROM payments WHERE sale_issue_id = ?").all(saleId);
      for (const p of payments) {
        db.prepare("DELETE FROM customer_ledger WHERE customer_id = ? AND reference_type = 'Payment' AND reference_id = ?").run(sale.customer_id, p.id);
      }

      // Delete payments
      db.prepare("DELETE FROM payments WHERE sale_issue_id = ?").run(saleId);

      // Delete sale items
      db.prepare("DELETE FROM sale_issue_items WHERE sale_issue_id = ?").run(saleId);

      // Delete the sale itself
      db.prepare("DELETE FROM sale_issues WHERE id = ?").run(saleId);

      // Recalculate running balances
      this._updateLedgerRunningBalances(sale.customer_id);

      return { success: true };
    })();
  }

  // ==================== DELETE PAYMENT ====================
  deletePayment(paymentId) {
    const db = getDatabase();

    const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId);
    if (!payment) {
      throw new Error("Payment not found");
    }

    const sale = db.prepare("SELECT * FROM sale_issues WHERE id = ?").get(payment.sale_issue_id);
    if (!sale) {
      throw new Error("Sale not found for this payment");
    }

    return db.transaction(() => {
      // Delete ledger entry for this payment
      db.prepare("DELETE FROM customer_ledger WHERE customer_id = ? AND reference_type = 'Payment' AND reference_id = ?").run(sale.customer_id, paymentId);

      const allPayments = db.prepare("SELECT * FROM payments WHERE sale_issue_id = ? ORDER BY payment_date ASC, id ASC").all(payment.sale_issue_id);
      const remainingPayments = allPayments.filter(p => p.id !== paymentId);

      let newPaid = 0;
      for (const p of remainingPayments) {
        newPaid += p.amount;
      }

      const newRemaining = Math.max(0, sale.total_amount - newPaid);
      const newStatus = newRemaining <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Outstanding";

      // Delete the payment
      db.prepare("DELETE FROM payments WHERE id = ?").run(paymentId);

      // Update sale totals
      db.prepare("UPDATE sale_issues SET paid_amount = ?, remaining_amount = ?, payment_status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(newPaid, newRemaining, newStatus, payment.sale_issue_id);

      // Recalculate running balances
      this._updateLedgerRunningBalances(sale.customer_id);

      return { success: true, newPaid, newRemaining, newStatus };
    })();
  }

  // ==================== UPDATE SALE ====================

  // Reconcile the sale's payment records + Payment CREDIT ledger entries so the
  // total paid amount equals the target. Creates, updates, or deletes records as needed.
  _reconcileSalePayments(db, sale, newCustomerId, targetPaid, newDate, paymentMethod) {
    if (paymentMethod) paymentMethod = this._normalizeMethod(paymentMethod);
    const payments = db.prepare(
      "SELECT * FROM payments WHERE sale_issue_id = ? ORDER BY payment_date ASC, id ASC"
    ).all(sale.id);
    const currentPaid = payments.reduce((s, p) => s + p.amount, 0);
    const diff = targetPaid - currentPaid;

    if (Math.abs(diff) < 0.001) {
      // Amount unchanged — only refresh the payment method if provided
      if (paymentMethod && payments.length > 0) {
        db.prepare("UPDATE payments SET payment_method = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(paymentMethod, payments[0].id);
        db.prepare("UPDATE customer_ledger SET description = ? WHERE customer_id = ? AND reference_type = 'Payment' AND reference_id = ?").run(
          `Payment for ${sale.reference_no} - ${paymentMethod}`, newCustomerId, payments[0].id
        );
      }
      return;
    }

    if (diff > 0) {
      // Increase: add the difference to the first payment, or create a new payment record
      if (payments.length > 0) {
        const first = payments[0];
        const newAmount = first.amount + diff;
        db.prepare("UPDATE payments SET amount = ?, payment_date = ?, payment_method = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(newAmount, newDate, paymentMethod || first.payment_method, first.id);
        db.prepare("UPDATE customer_ledger SET credit = ?, entry_date = ?, description = ? WHERE customer_id = ? AND reference_type = 'Payment' AND reference_id = ?").run(
          newAmount, newDate, `Payment for ${sale.reference_no} - ${paymentMethod || first.payment_method}`, newCustomerId, first.id
        );
      } else {
        const paymentResult = db.prepare("INSERT INTO payments (sale_issue_id, payment_date, amount, payment_method, note) VALUES (?, ?, ?, ?, ?)").run(
          sale.id, newDate, diff, paymentMethod || "Cash", `Payment for ${sale.reference_no}`
        );
        this._addLedgerEntry(
          newCustomerId, 'Payment', paymentResult.lastInsertRowid,
          `Payment for ${sale.reference_no} - ${paymentMethod || "Cash"}`, 0, diff, newDate
        );
      }
      return;
    }

    // Decrease: remove from the most recent payments first, deleting records that reach zero
    let toRemove = -diff;
    const reversed = [...payments].reverse();
    for (const p of reversed) {
      if (toRemove <= 0.001) break;
      if (p.amount <= toRemove) {
        toRemove -= p.amount;
        db.prepare("DELETE FROM customer_ledger WHERE customer_id = ? AND reference_type = 'Payment' AND reference_id = ?").run(newCustomerId, p.id);
        db.prepare("DELETE FROM payments WHERE id = ?").run(p.id);
      } else {
        const newAmount = p.amount - toRemove;
        toRemove = 0;
        db.prepare("UPDATE payments SET amount = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(newAmount, p.id);
        db.prepare("UPDATE customer_ledger SET credit = ? WHERE customer_id = ? AND reference_type = 'Payment' AND reference_id = ?").run(newAmount, newCustomerId, p.id);
      }
    }
  }

  updateSale(saleId, data) {
    const db = getDatabase();

    const sale = db.prepare("SELECT * FROM sale_issues WHERE id = ?").get(saleId);
    if (!sale) {
      throw new Error("Sale not found");
    }

    return db.transaction(() => {
      // ---- GUARD: products cannot be changed if the sale already has returns ----
      const returnsCount = db.prepare(
        "SELECT COUNT(*) as cnt FROM returns WHERE sale_issue_id = ? AND status != 'Cancelled'"
      ).get(saleId)?.cnt || 0;
      if (returnsCount > 0 && (Array.isArray(data.items) || data.discount_type !== undefined)) {
        throw new Error("This sale has returns — products cannot be edited. You can update customer, date, type, payment, and notes only.");
      }

      const oldCustomerId = sale.customer_id;
      const newCustomerId = data.customer_id !== undefined ? data.customer_id : sale.customer_id;
      const newDate = data.issue_date !== undefined ? data.issue_date : sale.issue_date;
      const newType = data.transaction_type !== undefined ? data.transaction_type : sale.transaction_type;
      const newNotes = data.notes !== undefined ? data.notes || "" : sale.notes;

      // ---- 1. Customer change: move the sale, its payments, AND its returns
      // (plus every related ledger entry) to the new customer so per-customer
      // balances stay consistent even when the sale already has returns ----
      if (newCustomerId !== oldCustomerId) {
        db.prepare("UPDATE customer_ledger SET customer_id = ? WHERE customer_id = ? AND reference_type = 'Sale' AND reference_id = ?")
          .run(newCustomerId, oldCustomerId, saleId);
        db.prepare(`UPDATE customer_ledger SET customer_id = ?
                    WHERE customer_id = ? AND reference_type = 'Payment' AND reference_id IN (SELECT id FROM payments WHERE sale_issue_id = ?)`)
          .run(newCustomerId, oldCustomerId, saleId);
        // Returns belong to the sale — move them so their Return CREDIT
        // entries (which reference return ids) follow the sale to the new customer
        db.prepare("UPDATE returns SET customer_id = ? WHERE sale_issue_id = ?").run(newCustomerId, saleId);
        db.prepare(`UPDATE customer_ledger SET customer_id = ?
                    WHERE customer_id = ? AND reference_type = 'Return' AND reference_id IN (SELECT id FROM returns WHERE sale_issue_id = ?)`)
          .run(newCustomerId, oldCustomerId, saleId);
      }

      // ---- 2. Base sale fields ----
      db.prepare("UPDATE sale_issues SET customer_id = ?, issue_date = ?, transaction_type = ?, notes = ?, updated_at = datetime('now','localtime') WHERE id = ?")
        .run(newCustomerId, newDate, newType, newNotes, saleId);

      // Update ledger entry dates to match the sale date
      if (newDate !== sale.issue_date) {
        db.prepare("UPDATE customer_ledger SET entry_date = ? WHERE customer_id = ? AND reference_type = 'Sale' AND reference_id = ?").run(newDate, newCustomerId, saleId);
        db.prepare(`UPDATE customer_ledger SET entry_date = ?
                    WHERE customer_id = ? AND reference_type = 'Payment' AND reference_id IN (SELECT id FROM payments WHERE sale_issue_id = ?)`).run(newDate, newCustomerId, saleId);
      }

      // ---- 3. Items: restore old stock, validate, deduct new stock ----
      let totalAmount = sale.total_amount;
      const discountType = data.discount_type !== undefined ? data.discount_type : sale.discount_type;
      const discountValue = data.discount_value !== undefined ? Number(data.discount_value) || 0 : sale.discount_value;
      let discountAmount = sale.discount_amount;
      if (!Array.isArray(data.items) && data.discount_type !== undefined) {
        // Discount-only edit: recompute from the stored lines (stored unit_price and item discount).
        const lines = db.prepare("SELECT quantity, unit_price, discount_amount FROM sale_issue_items WHERE sale_issue_id = ?").all(saleId);
        const calc = computeSaleTotals(lines, discountType, discountValue);
        totalAmount = calc.total;
        discountAmount = calc.saleDiscount;
        db.prepare("UPDATE customer_ledger SET debit = ? WHERE customer_id = ? AND reference_type = 'Sale' AND reference_id = ?").run(totalAmount, newCustomerId, saleId);
      }
      if (Array.isArray(data.items)) {
        const calc = computeSaleTotals(data.items, discountType, discountValue);
        const oldItems = db.prepare("SELECT product_id, quantity FROM sale_issue_items WHERE sale_issue_id = ?").all(saleId);

        // Restore old stock first so availability checks are correct
        const restoreStmt = db.prepare("UPDATE products SET quantity = quantity + ?, status = CASE WHEN status = 'Sold' THEN 'In Stock' ELSE status END, updated_at = datetime('now','localtime') WHERE id = ?");
        for (const item of oldItems) {
          restoreStmt.run(item.quantity, item.product_id);
        }

        // Validate new items against stock
        const errors = [];
        for (const item of data.items) {
          const product = db.prepare("SELECT quantity, product_name FROM products WHERE id = ?").get(item.product_id);
          if (!product) { errors.push(`Product ID ${item.product_id} not found`); continue; }
          if (product.quantity < item.quantity) {
            errors.push(`Insufficient stock for "${product.product_name}". Available: ${product.quantity}, Requested: ${item.quantity}`);
          }
        }
        if (errors.length > 0) throw new Error(errors.join("\n"));

        // Replace items
        db.prepare("DELETE FROM sale_issue_items WHERE sale_issue_id = ?").run(saleId);
        const itemStmt = db.prepare("INSERT INTO sale_issue_items (sale_issue_id, product_id, product_name, quantity, unit_price, subtotal, discount_amount) VALUES (?, ?, ?, ?, ?, ?, ?)");
        const deductStmt = db.prepare("UPDATE products SET quantity = quantity - ?, status = CASE WHEN quantity - ? <= 0 THEN 'Sold' ELSE status END, updated_at = datetime('now','localtime') WHERE id = ?");
        totalAmount = calc.total;
        discountAmount = calc.saleDiscount;
        for (const [i, item] of data.items.entries()) {
          const product = db.prepare("SELECT product_name FROM products WHERE id = ?").get(item.product_id);
          itemStmt.run(saleId, item.product_id, product?.product_name || "Unknown", item.quantity, item.unit_price, calc.lines[i].net, calc.lines[i].discount);
          deductStmt.run(item.quantity, item.quantity, item.product_id);
        }

        // Sync the Sale DEBIT ledger entry with the new total
        db.prepare("UPDATE customer_ledger SET debit = ? WHERE customer_id = ? AND reference_type = 'Sale' AND reference_id = ?").run(totalAmount, newCustomerId, saleId);
      }

      // ---- 4. Ledger type & paid amount reconciliation ----
      const newLedgerType = data.ledger_type !== undefined ? data.ledger_type : sale.ledger_type;
      if (data.ledger_type !== undefined || data.paid_amount !== undefined || data.payment_method !== undefined) {
        let targetPaid;
        if (newLedgerType === "Cash") {
          targetPaid = totalAmount; // Cash = fully paid
        } else {
          targetPaid = Math.min(data.paid_amount !== undefined ? data.paid_amount : sale.paid_amount, totalAmount);
        }
        this._reconcileSalePayments(db, sale, newCustomerId, targetPaid, newDate, data.payment_method);
      }

      // ---- 5. Recalc totals from the payments table ----
      const allPayments = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE sale_issue_id = ?").get(saleId);
      const finalPaid = allPayments?.total || 0;
      const finalRemaining = Math.max(0, totalAmount - finalPaid);
      const finalStatus = finalRemaining <= 0 ? "Paid" : finalPaid > 0 ? "Partial" : "Outstanding";

      db.prepare("UPDATE sale_issues SET total_amount = ?, paid_amount = ?, remaining_amount = ?, payment_status = ?, ledger_type = ?, discount_type = ?, discount_value = ?, discount_amount = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
        totalAmount, finalPaid, finalRemaining, finalStatus, newLedgerType,
        discountType, discountType === "none" ? 0 : discountValue, discountAmount, saleId
      );

      // ---- 6. Recalculate running balances for affected customers ----
      this._updateLedgerRunningBalances(newCustomerId);
      if (oldCustomerId !== newCustomerId) {
        this._updateLedgerRunningBalances(oldCustomerId);
      }

      return { success: true };
    })();
  }

  // ==================== UPDATE PAYMENT ====================
  updatePayment(paymentId, data) {
    const db = getDatabase();

    const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId);
    if (!payment) {
      throw new Error("Payment not found");
    }

    const sale = db.prepare("SELECT * FROM sale_issues WHERE id = ?").get(payment.sale_issue_id);
    if (!sale) {
      throw new Error("Sale not found for this payment");
    }
    if (data.payment_method) data = { ...data, payment_method: this._normalizeMethod(data.payment_method) };

    return db.transaction(() => {
      // Update payment
      db.prepare("UPDATE payments SET payment_date = ?, amount = ?, payment_method = ?, note = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
        data.payment_date || payment.payment_date,
        data.amount !== undefined ? data.amount : payment.amount,
        data.payment_method || payment.payment_method,
        data.note !== undefined ? data.note : payment.note,
        paymentId
      );

      // Update ledger entry for this payment
      db.prepare("UPDATE customer_ledger SET credit = ?, entry_date = ?, description = ? WHERE customer_id = ? AND reference_type = 'Payment' AND reference_id = ?").run(
        data.amount !== undefined ? data.amount : payment.amount,
        data.payment_date || payment.payment_date,
        `Payment for ${sale.reference_no} - ${data.payment_method || payment.payment_method}`,
        sale.customer_id,
        paymentId
      );

      // Recalculate
      const allPayments = db.prepare("SELECT * FROM payments WHERE sale_issue_id = ?").all(payment.sale_issue_id);
      const newPaid = allPayments.reduce((sum, p) => sum + p.amount, 0);
      const newRemaining = Math.max(0, sale.total_amount - newPaid);
      const newStatus = newRemaining <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Outstanding";

      db.prepare("UPDATE sale_issues SET paid_amount = ?, remaining_amount = ?, payment_status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(newPaid, newRemaining, newStatus, payment.sale_issue_id);

      // Recalculate running balances
      this._updateLedgerRunningBalances(sale.customer_id);

      return { success: true, newPaid, newRemaining, newStatus };
    })();
  }
}

module.exports = new LedgerService();
