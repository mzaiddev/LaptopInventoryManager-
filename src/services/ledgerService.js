const { getDatabase } = require("../database/dbInit");

class LedgerService {
  // ==================== REFERENCE NUMBER GENERATION ====================

  generateReference(type) {
    const db = getDatabase();
    const prefix = type === "sale" ? "SALE" : type === "ledger" ? "LDG" : "RET";
    const date = new Date();
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    const count = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM ${type === "sale" ? "sale_issues" : type === "ledger" ? "ledgers" : "returns"} WHERE reference_no LIKE ?`,
      )
      .get(`${prefix}-${dateStr}-%`);
    const num = String((count?.cnt || 0) + 1).padStart(4, "0");
    return `${prefix}-${dateStr}-${num}`;
  }

  // ==================== CUSTOMER MANAGEMENT ====================

  getAllCustomers(filters = {}) {
    const db = getDatabase();
    let query = "SELECT * FROM customers WHERE 1=1";
    const params = [];

    if (filters.search) {
      query +=
        " AND (customer_name LIKE ? OR phone LIKE ? OR address LIKE ? OR email LIKE ?)";
      const s = `%${filters.search}%`;
      params.push(s, s, s, s);
    }

    if (filters.status) {
      query += " AND status = ?";
      params.push(filters.status);
    }

    query += " ORDER BY customer_name ASC";

    if (filters.limit) {
      const offset = filters.page ? (filters.page - 1) * filters.limit : 0;
      const countQuery = query.replace(
        "SELECT *",
        "SELECT COUNT(*) as total",
      );
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
      INSERT INTO customers (customer_name, phone, address, email, credit_limit, opening_balance, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.customer_name,
      data.phone || "",
      data.address || "",
      data.email || "",
      data.credit_limit || 0,
      data.opening_balance || 0,
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
        credit_limit = ?, opening_balance = ?, status = ?, notes = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      data.customer_name,
      data.phone || "",
      data.address || "",
      data.email || "",
      data.credit_limit || 0,
      data.opening_balance || 0,
      data.status || "Active",
      data.notes || "",
      id,
    );
    return { success: true };
  }

  deleteCustomer(id) {
    const db = getDatabase();
    // Check if customer has any transactions
    const hasTransactions = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM sale_issues WHERE customer_id = ?",
      )
      .get(id);
    if (hasTransactions?.cnt > 0) {
      throw new Error("Cannot delete customer with existing transactions. Mark as inactive instead.");
    }
    db.prepare("DELETE FROM customers WHERE id = ?").run(id);
    return { success: true };
  }

  getCustomerBalance(id) {
    const db = getDatabase();
    const customer = db
      .prepare("SELECT opening_balance FROM customers WHERE id = ?")
      .get(id);
    const ledgerStats = db
      .prepare(
        `SELECT
          COALESCE(SUM(total_amount), 0) as total_sales,
          COALESCE(SUM(paid_amount), 0) as total_paid
        FROM ledgers WHERE customer_id = ?`,
      )
      .get(id);
    const opening = customer?.opening_balance || 0;
    const totalSales = ledgerStats?.total_sales || 0;
    const totalPaid = ledgerStats?.total_paid || 0;
    const outstanding = totalSales - totalPaid + opening;
    return {
      opening_balance: opening,
      total_sales: totalSales,
      total_paid: totalPaid,
      outstanding_balance: outstanding,
    };
  }

  // ==================== SALE / ISSUE CREATION ====================

  createSale(data) {
    const db = getDatabase();
    const errors = [];

    // Validate stock availability
    for (const item of data.items) {
      const product = db
        .prepare("SELECT quantity, product_name FROM products WHERE id = ?")
        .get(item.product_id);
      if (!product) {
        errors.push(`Product ID ${item.product_id} not found`);
        continue;
      }
      if (product.quantity < item.quantity) {
        errors.push(
          `Insufficient stock for "${product.product_name}". Available: ${product.quantity}, Requested: ${item.quantity}`,
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }

    const referenceNo = this.generateReference("sale");
    const ledgerRef = this.generateReference("ledger");
    const totalAmount = data.items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0,
    );
    const ledgerType = data.ledger_type || "Cash";
    const paidAmount =
      ledgerType === "Cash" ? totalAmount : Math.min(data.paid_amount || 0, totalAmount);
    const remainingAmount = totalAmount - paidAmount;
    const paymentStatus =
      remainingAmount <= 0
        ? "Paid"
        : paidAmount > 0
          ? "Partial"
          : "Outstanding";

    const result = db.transaction(() => {
      // 1. Create ledger
      const ledgerStmt = db.prepare(`
        INSERT INTO ledgers (customer_id, ledger_type, reference_no, transaction_date, description, total_amount, paid_amount, remaining_amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const ledgerResult = ledgerStmt.run(
        data.customer_id,
        ledgerType,
        ledgerRef,
        data.issue_date,
        data.description || `Sale/Issue - ${referenceNo}`,
        totalAmount,
        paidAmount,
        remainingAmount,
        paymentStatus,
      );
      const ledgerId = ledgerResult.lastInsertRowid;

      // 2. Create sale issue
      const saleStmt = db.prepare(`
        INSERT INTO sale_issues (customer_id, ledger_id, reference_no, issue_date, transaction_type, total_amount, paid_amount, remaining_amount, payment_status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const saleResult = saleStmt.run(
        data.customer_id,
        ledgerId,
        referenceNo,
        data.issue_date,
        data.transaction_type || "Sale",
        totalAmount,
        paidAmount,
        remainingAmount,
        paymentStatus,
        data.notes || "",
      );
      const saleId = saleResult.lastInsertRowid;

      // 3. Create sale items and reduce stock
      const itemStmt = db.prepare(`
        INSERT INTO sale_issue_items (sale_issue_id, product_id, product_name, quantity, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const updateStockStmt = db.prepare(`
        UPDATE products SET quantity = quantity - ?, status = CASE WHEN quantity - ? <= 0 THEN 'Sold' ELSE status END, updated_at = datetime('now','localtime')
        WHERE id = ?
      `);

      for (const item of data.items) {
        const product = db
          .prepare("SELECT product_name FROM products WHERE id = ?")
          .get(item.product_id);
        itemStmt.run(
          saleId,
          item.product_id,
          product?.product_name || "Unknown",
          item.quantity,
          item.unit_price,
          item.quantity * item.unit_price,
        );
        updateStockStmt.run(item.quantity, item.quantity, item.product_id);
      }

      // 4. If paid, create payment record
      if (paidAmount > 0) {
        db.prepare(
          "INSERT INTO ledger_payments (ledger_id, payment_date, amount, payment_method, note) VALUES (?, ?, ?, ?, ?)",
        ).run(
          ledgerId,
          data.issue_date,
          paidAmount,
          data.payment_method || "Cash",
          `Payment for ${referenceNo}`,
        );
      }

      return { saleId, ledgerId, referenceNo };
    })();

    return result;
  }

  // ==================== LEDGER OPERATIONS ====================

  getAllLedgers(filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT l.*, c.customer_name, c.phone as customer_phone
      FROM ledgers l
      LEFT JOIN customers c ON l.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.search) {
      query +=
        " AND (c.customer_name LIKE ? OR l.reference_no LIKE ? OR l.description LIKE ?)";
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }

    if (filters.customer_id) {
      query += " AND l.customer_id = ?";
      params.push(filters.customer_id);
    }

    if (filters.status) {
      query += " AND l.status = ?";
      params.push(filters.status);
    }

    if (filters.ledger_type) {
      query += " AND l.ledger_type = ?";
      params.push(filters.ledger_type);
    }

    if (filters.date_from) {
      query += " AND l.transaction_date >= ?";
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += " AND l.transaction_date <= ?";
      params.push(filters.date_to);
    }

    const sortCol = filters.sortBy || "l.created_at";
    const sortOrd = filters.sortOrder === "asc" ? "ASC" : "DESC";
    query += ` ORDER BY ${sortCol} ${sortOrd}`;

    const limit = filters.limit || 50;
    const offset = filters.page ? (filters.page - 1) * limit : 0;

    const countQuery = query.replace(
      "SELECT l.*, c.customer_name, c.phone as customer_phone",
      "SELECT COUNT(*) as total",
    );
    const totalResult = db.prepare(countQuery).get(...params);

    query += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const ledgers = db.prepare(query).all(...params);

    // Get sale info for each ledger
    for (const ledger of ledgers) {
      const sale = db
        .prepare(
          "SELECT id, reference_no, transaction_type FROM sale_issues WHERE ledger_id = ?",
        )
        .get(ledger.id);
      if (sale) {
        ledger.sale_reference = sale.reference_no;
        ledger.transaction_type = sale.transaction_type;
        ledger.sale_id = sale.id;
      }
    }

    return {
      ledgers,
      total: totalResult?.total || 0,
      page: filters.page || 1,
      limit,
    };
  }

  getLedgerById(id) {
    const db = getDatabase();
    const ledger = db
      .prepare(
        `SELECT l.*, c.customer_name, c.phone, c.address
        FROM ledgers l
        LEFT JOIN customers c ON l.customer_id = c.id
        WHERE l.id = ?`,
      )
      .get(id);

    if (!ledger) return null;

    // Get sale info
    ledger.sale = db
      .prepare(
        `SELECT si.*, GROUP_CONCAT(sii.product_name || ' x' || sii.quantity, ', ') as items_summary
        FROM sale_issues si
        LEFT JOIN sale_issue_items sii ON si.id = sii.sale_issue_id
        WHERE si.ledger_id = ?
        GROUP BY si.id`,
      )
      .get(id);

    // Get items
    if (ledger.sale) {
      ledger.items = db
        .prepare(
          `SELECT sii.*, p.category, p.serial_number
          FROM sale_issue_items sii
          LEFT JOIN products p ON sii.product_id = p.id
          WHERE sii.sale_issue_id = ?`,
        )
        .all(ledger.sale.id);
    }

    // Get payments
    ledger.payments = db
      .prepare(
        "SELECT * FROM ledger_payments WHERE ledger_id = ? ORDER BY payment_date DESC",
      )
      .all(id);

    // Get returns for this ledger
    ledger.returns = db
      .prepare(
        "SELECT id, return_date, total_return_amount, reason, status FROM returns WHERE ledger_id = ? ORDER BY return_date DESC",
      )
      .all(id);

    return ledger;
  }

  addPayment(data) {
    const db = getDatabase();
    const ledger = db
      .prepare("SELECT * FROM ledgers WHERE id = ?")
      .get(data.ledger_id);

    if (!ledger) {
      throw new Error("Ledger not found");
    }

    const newPaid = ledger.paid_amount + data.amount;
    const newRemaining = ledger.total_amount - newPaid;
    const newStatus =
      newRemaining <= 0 ? "Paid" : "Partial";

    // Use implicit transaction via WAL mode - all statements execute atomically
    db.prepare(
      "INSERT INTO ledger_payments (ledger_id, payment_date, amount, payment_method, note) VALUES (?, ?, ?, ?, ?)",
    ).run(
      data.ledger_id,
      data.payment_date,
      data.amount,
      data.payment_method || "Cash",
      data.note || "",
    );

    db.prepare(
      "UPDATE ledgers SET paid_amount = ?, remaining_amount = ?, status = ?, updated_at = datetime('now','localtime') WHERE id = ?",
    ).run(newPaid, newRemaining, newStatus, data.ledger_id);

    db.prepare(
      "UPDATE sale_issues SET paid_amount = ?, remaining_amount = ?, payment_status = ?, updated_at = datetime('now','localtime') WHERE ledger_id = ?",
    ).run(newPaid, newRemaining, newStatus, data.ledger_id);

    return { success: true };
  }

  // ==================== RETURNS ====================

  createReturn(data) {
    const db = getDatabase();

    // Validate the sale exists and belongs to customer
    const sale = db
      .prepare("SELECT * FROM sale_issues WHERE id = ?")
      .get(data.sale_issue_id);
    if (!sale) {
      throw new Error("Sale/Issue not found");
    }

    const errors = [];
    for (const item of data.items) {
      // Check if the item was in the original sale
      const originalItem = db
        .prepare(
          "SELECT * FROM sale_issue_items WHERE sale_issue_id = ? AND product_id = ?",
        )
        .get(data.sale_issue_id, item.product_id);
      if (!originalItem) {
        errors.push(`Product ID ${item.product_id} was not in the original sale`);
        continue;
      }
      // Check return quantity doesn't exceed sold quantity minus already returned
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
    const totalReturnAmount = data.items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0,
    );

    const result = db.transaction(() => {
      // Create return record
      const returnStmt = db.prepare(`
        INSERT INTO returns (customer_id, sale_issue_id, ledger_id, reference_no, return_date, reason, total_return_amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Completed')
      `);
      const returnResult = returnStmt.run(
        data.customer_id,
        data.sale_issue_id,
        sale.ledger_id,
        returnRef,
        data.return_date,
        data.reason || "",
        totalReturnAmount,
      );
      const returnId = returnResult.lastInsertRowid;

      // Add return items and restore stock
      const itemStmt = db.prepare(`
        INSERT INTO return_items (return_id, product_id, product_name, quantity, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const restoreStockStmt = db.prepare(`
        UPDATE products SET quantity = quantity + ?, status = CASE WHEN status = 'Sold' THEN 'In Stock' ELSE status END, updated_at = datetime('now','localtime')
        WHERE id = ?
      `);

      for (const item of data.items) {
        const product = db
          .prepare("SELECT product_name FROM products WHERE id = ?")
          .get(item.product_id);
        itemStmt.run(
          returnId,
          item.product_id,
          product?.product_name || "Unknown",
          item.quantity,
          item.unit_price,
          item.quantity * item.unit_price,
        );
        restoreStockStmt.run(item.quantity, item.product_id);
      }

      // If this return affects a loan ledger, adjust the ledger balance
      if (sale.ledger_id && totalReturnAmount > 0) {
        const ledger = db
          .prepare("SELECT * FROM ledgers WHERE id = ?")
          .get(sale.ledger_id);

        if (ledger && ledger.remaining_amount > 0) {
          // Reduce total amount by return value (or adjust remaining)
          const newTotal = Math.max(0, ledger.total_amount - totalReturnAmount);
          // If paid_amount exceeds new total, adjust
          const newPaid = Math.min(ledger.paid_amount, newTotal);
          const newRemaining = newTotal - newPaid;
          const newStatus =
            newRemaining <= 0
              ? newPaid > 0 ? "Paid" : "Outstanding"
              : "Partial";

          db.prepare(
            "UPDATE ledgers SET total_amount = ?, paid_amount = ?, remaining_amount = ?, status = ?, updated_at = datetime('now','localtime') WHERE id = ?",
          ).run(newTotal, newPaid, newRemaining, newStatus, sale.ledger_id);

          // Update sale issue as well
          db.prepare(
            "UPDATE sale_issues SET total_amount = ?, paid_amount = ?, remaining_amount = ?, payment_status = ?, updated_at = datetime('now','localtime') WHERE id = ?",
          ).run(newTotal, newPaid, newRemaining, newStatus, data.sale_issue_id);
        }
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
      query +=
        " AND (c.customer_name LIKE ? OR si.reference_no LIKE ? OR r.reason LIKE ?)";
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

    // Get items for each return
    for (const ret of returns) {
      ret.items = db
        .prepare(
          "SELECT * FROM return_items WHERE return_id = ?",
        )
        .all(ret.id);
    }

    return {
      returns,
      total: totalResult?.total || 0,
      page: filters.page || 1,
      limit,
    };
  }

  // ==================== DASHBOARD / REPORTS ====================

  getLedgerSummary() {
    const db = getDatabase();
    const totalOutstanding = db
      .prepare(
        "SELECT COALESCE(SUM(remaining_amount), 0) as total FROM ledgers",
      )
      .get();
    const totalSales = db
      .prepare(
        "SELECT COALESCE(SUM(total_amount), 0) as total FROM ledgers",
      )
      .get();
    const totalCollected = db
      .prepare(
        "SELECT COALESCE(SUM(paid_amount), 0) as total FROM ledgers",
      )
      .get();
    const activeCustomers = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM customers WHERE status = 'Active'",
      )
      .get();
    const todaySales = db
      .prepare(
        "SELECT COALESCE(SUM(total_amount), 0) as total FROM ledgers WHERE date(transaction_date) = date('now','localtime')",
      )
      .get();
    const todayPayments = db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM ledger_payments WHERE date(payment_date) = date('now','localtime')",
      )
      .get();
    const ledgerCounts = db
      .prepare(
        "SELECT status, COUNT(*) as cnt FROM ledgers GROUP BY status",
      )
      .all();

    return {
      total_outstanding: totalOutstanding?.total || 0,
      total_sales: totalSales?.total || 0,
      total_collected: totalCollected?.total || 0,
      active_customers: activeCustomers?.cnt || 0,
      today_sales: todaySales?.total || 0,
      today_payments: todayPayments?.total || 0,
      ledger_counts: ledgerCounts,
    };
  }

  getSalesReport(filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT si.*, c.customer_name,
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
    return db
      .prepare(
        `SELECT c.id as customer_id, c.customer_name, c.phone,
          COALESCE(SUM(l.total_amount), 0) as total_sales,
          COALESCE(SUM(l.paid_amount), 0) as total_paid,
          COALESCE(SUM(l.remaining_amount), 0) as total_outstanding,
          COUNT(l.id) as ledger_count
        FROM customers c
        LEFT JOIN ledgers l ON c.id = l.customer_id AND l.remaining_amount > 0
        WHERE c.status = 'Active'
        GROUP BY c.id
        HAVING total_outstanding > 0
        ORDER BY total_outstanding DESC`,
      )
      .all();
  }
}

module.exports = new LedgerService();