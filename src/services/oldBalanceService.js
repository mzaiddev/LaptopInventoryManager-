const { getDatabase } = require("../database/dbInit");

class OldBalanceService {
  getAllOldBalances(filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT ob.*, c.customer_name, c.phone
      FROM old_balances ob
      LEFT JOIN customers c ON ob.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.search) {
      query += " AND (c.customer_name LIKE ? OR c.phone LIKE ?)";
      const s = `%${filters.search}%`;
      params.push(s, s);
    }

    if (filters.customer_id) {
      query += " AND ob.customer_id = ?";
      params.push(filters.customer_id);
    }

    if (filters.balance_type) {
      query += " AND ob.balance_type = ?";
      params.push(filters.balance_type);
    }

    query += " ORDER BY ob.created_at DESC";

    if (filters.limit) {
      const offset = filters.page ? (filters.page - 1) * filters.limit : 0;
      const countQuery = query.replace(
        "SELECT ob.*, c.customer_name, c.phone",
        "SELECT COUNT(*) as total"
      );
      const totalResult = db.prepare(countQuery).get(...params);
      query += " LIMIT ? OFFSET ?";
      params.push(filters.limit, offset);
      const balances = db.prepare(query).all(...params);
      return {
        balances,
        total: totalResult?.total || 0,
        page: filters.page || 1,
        limit: filters.limit,
      };
    }

    return db.prepare(query).all(...params);
  }

  getOldBalanceById(id) {
    const db = getDatabase();
    return db
      .prepare(
        "SELECT ob.*, c.customer_name FROM old_balances ob LEFT JOIN customers c ON ob.customer_id = c.id WHERE ob.id = ?",
      )
      .get(id);
  }

  getCustomerOldBalances(customerId) {
    const db = getDatabase();
    return db
      .prepare("SELECT * FROM old_balances WHERE customer_id = ? ORDER BY created_at DESC")
      .all(customerId);
  }

  getCustomerOldBalanceTotal(customerId) {
    const db = getDatabase();
    const debit = db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM old_balances WHERE customer_id = ? AND balance_type = 'Debit'",
      )
      .get(customerId);
    const credit = db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM old_balances WHERE customer_id = ? AND balance_type = 'Credit'",
      )
      .get(customerId);
    return {
      debit: debit?.total || 0,
      credit: credit?.total || 0,
      net: (debit?.total || 0) - (credit?.total || 0),
    };
  }

  getAllOldBalancesSummary() {
    const db = getDatabase();
    const stats = db
      .prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN balance_type = 'Debit' THEN amount ELSE 0 END), 0) as total_debit,
          COALESCE(SUM(CASE WHEN balance_type = 'Credit' THEN amount ELSE 0 END), 0) as total_credit,
          COUNT(DISTINCT customer_id) as total_customers,
          COUNT(*) as total_records
        FROM old_balances
      `)
      .get();
    return {
      totalDebit: stats.total_debit || 0,
      totalCredit: stats.total_credit || 0,
      totalCustomers: stats.total_customers || 0,
      totalRecords: stats.total_records || 0,
      netOldBalance: (stats.total_debit || 0) - (stats.total_credit || 0),
    };
  }

  addOldBalance(data) {
    const db = getDatabase();
    return db.transaction(() => {
      const result = db
        .prepare(
          "INSERT INTO old_balances (customer_id, amount, balance_type, notes) VALUES (?, ?, ?, ?)",
        )
        .run(
          data.customer_id,
          data.amount,
          data.balance_type || "Debit",
          data.notes || "",
        );
      
      // Also add to customer_ledger for unified ledger
      const refType = data.balance_type === 'Debit' ? 'OldBalanceDebit' : 'OldBalanceCredit';
      const debit = data.balance_type === 'Debit' ? data.amount : 0;
      const credit = data.balance_type === 'Credit' ? data.amount : 0;
      
      const lastEntry = db.prepare(
        "SELECT running_balance FROM customer_ledger WHERE customer_id = ? ORDER BY entry_date DESC, id DESC LIMIT 1"
      ).get(data.customer_id);
      const lastBalance = lastEntry ? lastEntry.running_balance : 0;
      const runningBalance = lastBalance + debit - credit;
      
      db.prepare(`
        INSERT INTO customer_ledger (customer_id, reference_type, reference_id, description, debit, credit, running_balance, entry_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.customer_id,
        refType,
        result.lastInsertRowid,
        data.notes || `${data.balance_type === 'Debit' ? 'Old Debit' : 'Old Credit'} Balance`,
        debit,
        credit,
        runningBalance,
        new Date().toISOString().split('T')[0]
      );
      
      return { id: result.lastInsertRowid };
    })();
  }

  updateOldBalance(id, data) {
    const db = getDatabase();
    const oldRecord = db.prepare("SELECT * FROM old_balances WHERE id = ?").get(id);
    if (!oldRecord) {
      throw new Error("Old balance record not found");
    }
    
    db.transaction(() => {
      db.prepare(`
        UPDATE old_balances SET
          amount = ?, balance_type = ?, notes = ?,
          updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(
        data.amount !== undefined ? data.amount : oldRecord.amount,
        data.balance_type || oldRecord.balance_type,
        data.notes !== undefined ? data.notes : oldRecord.notes,
        id,
      );
      
      // Update ledger entry
      const refType = (data.balance_type || oldRecord.balance_type) === 'Debit' ? 'OldBalanceDebit' : 'OldBalanceCredit';
      const newDebit = (data.balance_type || oldRecord.balance_type) === 'Debit' ? (data.amount !== undefined ? data.amount : oldRecord.amount) : 0;
      const newCredit = (data.balance_type || oldRecord.balance_type) === 'Credit' ? (data.amount !== undefined ? data.amount : oldRecord.amount) : 0;
      
      db.prepare(`
        UPDATE customer_ledger SET debit = ?, credit = ?, description = ?
        WHERE customer_id = ? AND reference_id = ? AND reference_type IN ('OldBalanceDebit', 'OldBalanceCredit')
      `).run(newDebit, newCredit, data.notes || oldRecord.notes || 'Old Balance', oldRecord.customer_id, id);
      
      // Recalculate running balances
      const entries = db.prepare(
        "SELECT id FROM customer_ledger WHERE customer_id = ? ORDER BY entry_date ASC, id ASC"
      ).all(oldRecord.customer_id);
      let runningBalance = 0;
      const updateStmt = db.prepare("UPDATE customer_ledger SET running_balance = ? WHERE id = ?");
      for (const entry of entries) {
        const e = db.prepare("SELECT debit, credit FROM customer_ledger WHERE id = ?").get(entry.id);
        runningBalance = runningBalance + e.debit - e.credit;
        updateStmt.run(runningBalance, entry.id);
      }
    })();
    
    return { success: true };
  }

  deleteOldBalance(id) {
    const db = getDatabase();
    const record = db.prepare("SELECT * FROM old_balances WHERE id = ?").get(id);
    if (!record) {
      throw new Error("Old balance record not found");
    }
    
    db.transaction(() => {
      db.prepare("DELETE FROM old_balances WHERE id = ?").run(id);
      
      // Delete ledger entry
      db.prepare("DELETE FROM customer_ledger WHERE customer_id = ? AND reference_id = ? AND reference_type IN ('OldBalanceDebit', 'OldBalanceCredit')").run(record.customer_id, id);
      
      // Recalculate running balances
      const entries = db.prepare(
        "SELECT id FROM customer_ledger WHERE customer_id = ? ORDER BY entry_date ASC, id ASC"
      ).all(record.customer_id);
      let runningBalance = 0;
      const updateStmt = db.prepare("UPDATE customer_ledger SET running_balance = ? WHERE id = ?");
      for (const entry of entries) {
        const e = db.prepare("SELECT debit, credit FROM customer_ledger WHERE id = ?").get(entry.id);
        runningBalance = runningBalance + e.debit - e.credit;
        updateStmt.run(runningBalance, entry.id);
      }
    })();
    
    return { success: true };
  }
}

module.exports = new OldBalanceService();