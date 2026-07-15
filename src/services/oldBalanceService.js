const { getDatabase } = require("../database/dbInit");

class OldBalanceService {
  // ==================== GET ALL OLD BALANCES ====================

  getAllOldBalances(filters = {}) {
    try {
      const db = getDatabase();
      let query = `
        SELECT ob.*, c.customer_name, c.phone
        FROM old_balances ob
        LEFT JOIN customers c ON ob.customer_id = c.id
        WHERE 1=1
      `;
      const params = [];

      if (filters.search) {
        query += " AND (c.customer_name LIKE ? OR c.phone LIKE ? OR ob.notes LIKE ?)";
        const s = `%${filters.search}%`;
        params.push(s, s, s);
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
          totalPages: Math.ceil((totalResult?.total || 0) / filters.limit),
          page: filters.page || 1,
          limit: filters.limit,
        };
      }

      return db.prepare(query).all(...params);
    } catch (e) {
      return { balances: [], total: 0, totalPages: 0, page: 1, limit: filters.limit || 50 };
    }
  }

  // ==================== GET OLD BALANCES BY CUSTOMER ====================

  getCustomerOldBalances(customerId) {
    try {
      const db = getDatabase();
      return db
        .prepare(
          "SELECT * FROM old_balances WHERE customer_id = ? ORDER BY created_at DESC"
        )
        .all(customerId);
    } catch (e) {
      return [];
    }
  }

  // ==================== GET CUSTOMER OLD BALANCE TOTAL ====================

  getCustomerOldBalanceTotal(customerId) {
    try {
      const db = getDatabase();
      const debit = db
        .prepare(
          "SELECT COALESCE(SUM(amount), 0) as total FROM old_balances WHERE customer_id = ? AND balance_type = 'Debit'"
        )
        .get(customerId);
      const credit = db
        .prepare(
          "SELECT COALESCE(SUM(amount), 0) as total FROM old_balances WHERE customer_id = ? AND balance_type = 'Credit'"
        )
        .get(customerId);
      return {
        total_debit: debit?.total || 0,
        total_credit: credit?.total || 0,
        net_balance: (debit?.total || 0) - (credit?.total || 0),
      };
    } catch (e) {
      return { total_debit: 0, total_credit: 0, net_balance: 0 };
    }
  }

  // ==================== GET ALL OLD BALANCES SUMMARY ====================

  getAllOldBalancesSummary() {
    try {
      const db = getDatabase();
      const result = db
        .prepare(
          `SELECT
            COALESCE(SUM(CASE WHEN balance_type = 'Debit' THEN amount ELSE 0 END), 0) as total_debit,
            COALESCE(SUM(CASE WHEN balance_type = 'Credit' THEN amount ELSE 0 END), 0) as total_credit,
            COUNT(*) as total_records,
            COUNT(DISTINCT customer_id) as total_customers
          FROM old_balances`
        )
        .get();
      return result || { total_debit: 0, total_credit: 0, total_records: 0, total_customers: 0 };
    } catch (e) {
      return { total_debit: 0, total_credit: 0, total_records: 0, total_customers: 0 };
    }
  }

  // ==================== ADD OLD BALANCE ====================

  addOldBalance(data) {
    try {
      const db = getDatabase();
      const result = db
        .prepare(
          "INSERT INTO old_balances (customer_id, amount, balance_type, notes) VALUES (?, ?, ?, ?)"
        )
        .run(
          data.customer_id,
          data.amount || 0,
          data.balance_type || "Debit",
          data.notes || ""
        );
      return { id: result?.lastInsertRowid };
    } catch (e) {
      throw new Error("Failed to add old balance: " + e.message);
    }
  }

  // ==================== UPDATE OLD BALANCE ====================

  updateOldBalance(id, data) {
    try {
      const db = getDatabase();
      db.prepare(
        `UPDATE old_balances SET
          customer_id = ?, amount = ?, balance_type = ?, notes = ?,
          updated_at = datetime('now','localtime')
        WHERE id = ?`
      ).run(
        data.customer_id,
        data.amount || 0,
        data.balance_type || "Debit",
        data.notes || "",
        id
      );
      return { success: true };
    } catch (e) {
      throw new Error("Failed to update old balance: " + e.message);
    }
  }

  // ==================== DELETE OLD BALANCE ====================

  deleteOldBalance(id) {
    try {
      const db = getDatabase();
      db.prepare("DELETE FROM old_balances WHERE id = ?").run(id);
      return { success: true };
    } catch (e) {
      throw new Error("Failed to delete old balance: " + e.message);
    }
  }

  // ==================== GET OLD BALANCE BY ID ====================

  getOldBalanceById(id) {
    try {
      const db = getDatabase();
      return db
        .prepare(
          `SELECT ob.*, c.customer_name, c.phone
          FROM old_balances ob
          LEFT JOIN customers c ON ob.customer_id = c.id
          WHERE ob.id = ?`
        )
        .get(id);
    } catch (e) {
      return null;
    }
  }
}

module.exports = new OldBalanceService();
