const { getDatabase } = require("../database/dbInit");

class LedgerService {
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
    return { opening_balance: oldData.net, total_sales: s.ts, total_paid: s.tp, outstanding_balance: s.ts - s.tp, old_balance_debit: oldData.debit, old_balance_credit: oldData.credit, old_balance_net: oldData.net };
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
    const totalAmount = data.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const ledgerType = data.ledger_type || "Cash";
    const paidAmount = ledgerType === "Cash" ? totalAmount : Math.min(data.paid_amount || 0, totalAmount);
    const remainingAmount = totalAmount - paidAmount;
    const paymentStatus = remainingAmount <= 0 ? "Paid" : paidAmount > 0 ? "Partial" : "Outstanding";

    return db.transaction(() => {
      // Create sale issue directly (no separate ledger)
      const saleResult = db.prepare("INSERT INTO sale_issues (customer_id, reference_no, issue_date, transaction_type, total_amount, paid_amount, remaining_amount, payment_status, ledger_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        data.customer_id, referenceNo, data.issue_date, data.transaction_type || "Sale",
        totalAmount, paidAmount, remainingAmount, paymentStatus, ledgerType, data.notes || ""
      );
      const saleId = saleResult.lastInsertRowid;

      // Create sale items and reduce stock
      const itemStmt = db.prepare("INSERT INTO sale_issue_items (sale_issue_id, product_id, product_name, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)");
      for (const item of data.items) {
        const product = db.prepare("SELECT product_name FROM products WHERE id = ?").get(item.product_id);
        itemStmt.run(saleId, item.product_id, product?.product_name || "Unknown", item.quantity, item.unit_price, item.quantity * item.unit_price);
        db.prepare("UPDATE products SET quantity = quantity - ?, status = CASE WHEN quantity - ? <= 0 THEN 'Sold' ELSE status END, updated_at = datetime('now','localtime') WHERE id = ?").run(item.quantity, item.quantity, item.product_id);
      }

      // If paid, create payment record directly linked to sale
      if (paidAmount > 0) {
        db.prepare("INSERT INTO payments (sale_issue_id, payment_date, amount, payment_method, note) VALUES (?, ?, ?, ?, ?)").run(
          saleId, data.issue_date, paidAmount, data.payment_method || "Cash", `Payment for ${referenceNo}`
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
    }

    return { sales, total: totalResult?.total || 0, page: filters.page || 1, limit };
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
    const newPaid = sale.paid_amount + data.amount;
    const newRemaining = sale.total_amount - newPaid;
    const newStatus = newRemaining <= 0 ? "Paid" : "Partial";
    db.prepare("INSERT INTO payments (sale_issue_id, payment_date, amount, payment_method, note) VALUES (?, ?, ?, ?, ?)").run(data.sale_issue_id, data.payment_date, data.amount, data.payment_method || "Cash", data.note || "");
    db.prepare("UPDATE sale_issues SET paid_amount = ?, remaining_amount = ?, payment_status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(newPaid, newRemaining, newStatus, data.sale_issue_id);
    return { success: true };
  }

  // ==================== RETURNS ====================

  createReturn(data) {
    const db = getDatabase();

    // Validate customer exists
    const customer = db
      .prepare("SELECT id, customer_name FROM customers WHERE id = ?")
      .get(data.customer_id);
    if (!customer) {
      throw new Error("Customer not found. Please select a valid customer.");
    }

    // Validate the sale exists
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

    // Validate each product exists before starting transaction
    for (const item of data.items) {
      const prodExists = db.prepare("SELECT id FROM products WHERE id = ?").get(item.product_id);
      if (!prodExists) {
        throw new Error(`Product ID ${item.product_id} no longer exists in inventory. It may have been deleted.`);
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
          throw new Error(`Cannot create return: the sale or customer reference is invalid. Please verify the sale (ID: ${data.sale_issue_id}) and customer (ID: ${data.customer_id}) still exist.`);
        }
        throw insErr;
      }

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
        try {
          itemStmt.run(
            returnId,
            item.product_id,
            product?.product_name || "Unknown",
            item.quantity,
            item.unit_price,
            item.quantity * item.unit_price,
          );
        } catch (itemErr) {
          if (itemErr.message.includes("FOREIGN KEY")) {
            throw new Error(`Cannot add return item "${product?.product_name || item.product_id}" (Product ID: ${item.product_id}): the product no longer exists in inventory.`);
          }
          throw itemErr;
        }
        restoreStockStmt.run(item.quantity, item.product_id);
      }

      if (totalReturnAmount > 0) {
        const newTotal = Math.max(0, sale.total_amount - totalReturnAmount);
        const newPaid = Math.min(sale.paid_amount, newTotal);
        const newRemaining = newTotal - newPaid;
        const newStatus = newRemaining <= 0 ? (newPaid > 0 ? "Paid" : "Outstanding") : "Partial";
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
      // Record the damage
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

      // Reduce product quantity directly
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

    // Build a proper count query by extracting the WHERE clause
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

    // Get current product quantities for each damage record
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

    return {
      damages,
      total: totalResult?.total || 0,
      page: filters.page || 1,
      limit
    };
  }

  correctDamage(id, correctionData) {
    const db = getDatabase();
    const existing = db.prepare("SELECT * FROM damage_records WHERE id = ?").get(id);
    if (!existing) {
      throw new Error("Damage record not found");
    }

    const result = db.transaction(() => {
      // If quantity is explicitly provided (including 0), use it; otherwise keep existing
      const newQuantity = correctionData.quantity !== undefined ? correctionData.quantity : existing.quantity;
      // How many units are being restored?
      const restoreQty = existing.quantity - newQuantity;

      // Update the damage record
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

      // If restoring stock, add quantity back to product
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

    // Get old balance data via shared helper
    const oldData = this._getCustomerOldBalanceData(db, customerId);

    return {
      customer, sales, returns, damages,
      old_balances: oldData.records,
      balance: {
        opening_balance: 0,
        total_sales: balance.ts || 0,
        total_paid: balance.tp || 0,
        total_outstanding: balance.to_ || 0,
        old_balance_debit: oldData.debit,
        old_balance_credit: oldData.credit,
        old_balance_net: oldData.net,
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
      currency: settings.currency || 'USD',
      customer: profile.customer,
      sales: profile.sales,
      returns: profile.returns,

      damages: profile.damages,
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
    return { total_outstanding: to, total_sales: ts, total_collected: tc, active_customers: ac, today_sales: tds, today_payments: tdp, sale_counts: sc };
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
    return db.prepare("SELECT c.id as customer_id, c.customer_name, c.phone, COALESCE(SUM(si.total_amount), 0) as total_sales, COALESCE(SUM(si.paid_amount), 0) as total_paid, COALESCE(SUM(si.remaining_amount), 0) as total_outstanding, COUNT(si.id) as invoice_count FROM customers c LEFT JOIN sale_issues si ON c.id = si.customer_id AND si.remaining_amount > 0 WHERE c.status = 'Active' GROUP BY c.id HAVING total_outstanding > 0 ORDER BY total_outstanding DESC").all();
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
      
      // Delete payments
      db.prepare("DELETE FROM payments WHERE sale_issue_id = ?").run(saleId);
      
      // Delete sale items
      db.prepare("DELETE FROM sale_issue_items WHERE sale_issue_id = ?").run(saleId);
      
      // Delete the sale itself
      db.prepare("DELETE FROM sale_issues WHERE id = ?").run(saleId);
      
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
      // Get all payments for this sale to recalculate totals
      const allPayments = db.prepare("SELECT * FROM payments WHERE sale_issue_id = ? ORDER BY payment_date ASC, id ASC").all(payment.sale_issue_id);
      
      // Find and remove the deleted payment
      const remainingPayments = allPayments.filter(p => p.id !== paymentId);
      
      // Recalculate paid amount
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
      
      return { success: true, newPaid, newRemaining, newStatus };
    })();
  }

  // ==================== UPDATE SALE ====================
  updateSale(saleId, data) {
    const db = getDatabase();
    
    const sale = db.prepare("SELECT * FROM sale_issues WHERE id = ?").get(saleId);
    if (!sale) {
      throw new Error("Sale not found");
    }
    
    return db.transaction(() => {
      // Update sale basic info
      if (data.customer_id !== undefined) {
        db.prepare("UPDATE sale_issues SET customer_id = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(data.customer_id, saleId);
      }
      if (data.issue_date !== undefined) {
        db.prepare("UPDATE sale_issues SET issue_date = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(data.issue_date, saleId);
      }
      if (data.transaction_type !== undefined) {
        db.prepare("UPDATE sale_issues SET transaction_type = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(data.transaction_type, saleId);
      }
      if (data.notes !== undefined) {
        db.prepare("UPDATE sale_issues SET notes = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(data.notes || "", saleId);
      }
      
      // Update payment method if provided
      if (data.payment_method !== undefined) {
        const existingPayment = db.prepare("SELECT id FROM payments WHERE sale_issue_id = ? LIMIT 1").get(saleId);
        if (existingPayment) {
          db.prepare("UPDATE payments SET payment_method = ? WHERE sale_issue_id = ?").run(data.payment_method, saleId);
        }
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
    
    return db.transaction(() => {
      // Update payment
      db.prepare("UPDATE payments SET payment_date = ?, amount = ?, payment_method = ?, note = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
        data.payment_date || payment.payment_date,
        data.amount !== undefined ? data.amount : payment.amount,
        data.payment_method || payment.payment_method,
        data.note !== undefined ? data.note : payment.note,
        paymentId
      );
      
      // Recalculate total paid amount
      const allPayments = db.prepare("SELECT * FROM payments WHERE sale_issue_id = ?").all(payment.sale_issue_id);
      const newPaid = allPayments.reduce((sum, p) => sum + p.amount, 0);
      const newRemaining = Math.max(0, sale.total_amount - newPaid);
      const newStatus = newRemaining <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Outstanding";
      
      // Update sale totals
      db.prepare("UPDATE sale_issues SET paid_amount = ?, remaining_amount = ?, payment_status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(newPaid, newRemaining, newStatus, payment.sale_issue_id);
      
      return { success: true, newPaid, newRemaining, newStatus };
    })();
  }
}

module.exports = new LedgerService();
