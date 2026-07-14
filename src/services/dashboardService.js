const { getDatabase } = require('../database/dbInit');

class DashboardService {
  getDashboardData() {
    const db = getDatabase();
    const currency = this.getSetting('currency') || 'USD';

    const inventorySummary = this.getInventorySummary(db);
    const financialSummary = this.getFinancialSummary(db);
    const conditionSummary = this.getConditionSummary(db);
    const salesSummary = this.getSalesSummary(db);
    const ledgerSummary = this.getLedgerFinancialSummary(db);
    const recentActivity = this.getRecentActivity(db);
    const damageSummary = this.getDamageSummary(db);

    return {
      inventorySummary,
      financialSummary,
      conditionSummary,
      salesSummary,
      ledgerSummary,
      damageSummary,
      recentActivity,
      currency
    };
  }

  getInventorySummary(db) {
    // Damaged count comes from damage_records, not from products table
    const damagedCount = db.prepare(`
      SELECT COALESCE(SUM(dr.quantity), 0) as total FROM damage_records WHERE damage_type IN ('Damaged', 'Disposed')
    `).get();

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_products,
        COALESCE(SUM(quantity), 0) as total_quantity,
        COALESCE(SUM(CASE WHEN status != 'Sold' AND status != 'Lost' THEN quantity ELSE 0 END), 0) as in_stock,
        COALESCE(SUM(CASE WHEN status = 'Reserved' THEN quantity ELSE 0 END), 0) as reserved,
        COALESCE(SUM(CASE WHEN status = 'Sold' THEN quantity ELSE 0 END), 0) as sold,
        COALESCE(SUM(CASE WHEN status = 'Returned' THEN quantity ELSE 0 END), 0) as returned
      FROM products
    `).get();

    return {
      totalProducts: stats.total_products,
      totalQuantity: stats.total_quantity,
      inStock: stats.in_stock,
      reserved: stats.reserved,
      sold: stats.sold,
      returned: stats.returned,
      damaged: damagedCount.total || 0
    };
  }

  getFinancialSummary(db) {
    // Financial data from actual sales transactions
    const salesFinancials = db.prepare(`
      SELECT
        COALESCE(SUM(sii.subtotal), 0) as total_sales_value,
        COALESCE(SUM(sii.quantity * COALESCE(p.purchase_price, 0)), 0) as total_cogs,
        COALESCE(SUM(sii.subtotal) - SUM(sii.quantity * COALESCE(p.purchase_price, 0)), 0) as total_gross_profit
      FROM sale_issue_items sii
      LEFT JOIN products p ON sii.product_id = p.id
    `).get();

    // Current inventory value from stock
    const inventoryValues = db.prepare(`
      SELECT
        COALESCE(SUM(purchase_price * quantity), 0) as total_purchase_value,
        COALESCE(SUM(selling_price * quantity), 0) as total_selling_value,
        COALESCE(SUM(CASE WHEN status != 'Sold' AND status != 'Lost' THEN purchase_price * quantity ELSE 0 END), 0) as current_inventory_value
      FROM products
    `).get();

    // Damaged stock value from damage_records
    const damagedValue = db.prepare(`
      SELECT COALESCE(SUM(dr.quantity * p.purchase_price), 0) as total
      FROM damage_records dr
      LEFT JOIN products p ON dr.product_id = p.id
      WHERE dr.damage_type IN ('Damaged', 'Disposed')
    `).get();

    return {
      totalPurchaseValue: inventoryValues.total_purchase_value,
      totalSellingValue: inventoryValues.total_selling_value,
      totalSoldValue: salesFinancials.total_sales_value,
      currentInventoryValue: inventoryValues.current_inventory_value,
      expectedProfit: salesFinancials.total_gross_profit,
      totalCOGS: salesFinancials.total_cogs,
      grossProfit: salesFinancials.total_gross_profit,
      damagedStockValue: damagedValue.total || 0
    };
  }

  getConditionSummary(db) {
    const stats = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN condition = 'Excellent' THEN 1 ELSE 0 END), 0) as excellent,
        COALESCE(SUM(CASE WHEN condition = 'Good' THEN 1 ELSE 0 END), 0) as good,
        COALESCE(SUM(CASE WHEN condition = 'Fair' THEN 1 ELSE 0 END), 0) as fair,
        COALESCE(SUM(CASE WHEN condition = 'Damaged' THEN 1 ELSE 0 END), 0) as damaged,
        COALESCE(SUM(CASE WHEN condition = 'For Parts' THEN 1 ELSE 0 END), 0) as for_parts
      FROM products
    `).get();

    return {
      excellent: stats.excellent,
      good: stats.good,
      fair: stats.fair,
      damaged: stats.damaged,
      forParts: stats.for_parts
    };
  }

  getSalesSummary(db) {
    const today = new Date().toISOString().split('T')[0];
    const stats = db.prepare(`
      SELECT
        COALESCE(SUM(si.total_amount), 0) as total_sales,
        COALESCE(SUM(si.paid_amount), 0) as total_collected,
        COUNT(si.id) as total_transactions,
        COALESCE(SUM(CASE WHEN si.issue_date = ? THEN si.total_amount ELSE 0 END), 0) as today_sales,
        COALESCE(SUM(CASE WHEN si.issue_date = ? THEN si.paid_amount ELSE 0 END), 0) as today_collected,
        COALESCE(SUM(CASE WHEN si.payment_status = 'Paid' THEN 1 ELSE 0 END), 0) as paid_count,
        COALESCE(SUM(CASE WHEN si.payment_status = 'Partial' THEN 1 ELSE 0 END), 0) as partial_count,
        COALESCE(SUM(CASE WHEN si.payment_status = 'Outstanding' THEN 1 ELSE 0 END), 0) as outstanding_count
      FROM sale_issues si
    `).get(today, today);

    return {
      totalSales: stats.total_sales,
      totalCollected: stats.total_collected,
      totalTransactions: stats.total_transactions,
      todaySales: stats.today_sales,
      todayCollected: stats.today_collected,
      paidCount: stats.paid_count,
      partialCount: stats.partial_count,
      outstandingCount: stats.outstanding_count
    };
  }

  getLedgerFinancialSummary(db) {
    const stats = db.prepare(`
      SELECT
        COALESCE(SUM(remaining_amount), 0) as total_outstanding,
        COALESCE(SUM(total_amount), 0) as total_ledger_sales,
        COALESCE(SUM(paid_amount), 0) as total_ledger_collected,
        COUNT(*) as total_ledgers,
        COALESCE(SUM(CASE WHEN status = 'Outstanding' THEN 1 ELSE 0 END), 0) as outstanding_ledgers,
        COALESCE(SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END), 0) as paid_ledgers,
        COALESCE(SUM(CASE WHEN status = 'Partial' THEN 1 ELSE 0 END), 0) as partial_ledgers
      FROM ledgers
    `).get();

    const returnsTotal = db.prepare(`
      SELECT COALESCE(SUM(total_return_amount), 0) as total_returns_value,
             COUNT(*) as total_returns
      FROM returns WHERE status = 'Completed'
    `).get();

    return {
      totalOutstanding: stats.total_outstanding,
      totalLedgerSales: stats.total_ledger_sales,
      totalLedgerCollected: stats.total_ledger_collected,
      totalLedgers: stats.total_ledgers,
      outstandingLedgers: stats.outstanding_ledgers,
      paidLedgers: stats.paid_ledgers,
      partialLedgers: stats.partial_ledgers,
      totalReturnsValue: returnsTotal.total_returns_value,
      totalReturns: returnsTotal.total_returns
    };
  }

  getDamageSummary(db) {
    const stats = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN dr.damage_type IN ('Damaged', 'Disposed') THEN dr.quantity ELSE 0 END), 0) as total_damaged_qty,
        COUNT(DISTINCT CASE WHEN dr.damage_type IN ('Damaged', 'Disposed') THEN dr.product_id END) as damaged_products_count,
        COALESCE(SUM(CASE WHEN dr.damage_type IN ('Damaged', 'Disposed') THEN dr.quantity * COALESCE(p.purchase_price, 0) ELSE 0 END), 0) as total_damaged_value
      FROM damage_records dr
      LEFT JOIN products p ON dr.product_id = p.id
    `).get();

    return {
      totalDamagedQty: stats.total_damaged_qty || 0,
      damagedProductsCount: stats.damaged_products_count || 0,
      totalDamagedValue: stats.total_damaged_value || 0,
      damagedStatusQty: stats.total_damaged_qty || 0,
      damagedStatusValue: stats.total_damaged_value || 0
    };
  }

  getRecentActivity(db) {
    const recentSales = db.prepare(`
      SELECT si.id, si.reference_no, si.total_amount, si.issue_date, c.customer_name
      FROM sale_issues si
      LEFT JOIN customers c ON si.customer_id = c.id
      ORDER BY si.created_at DESC LIMIT 5
    `).all();

    const recentReturns = db.prepare(`
      SELECT r.id, r.reference_no, r.total_return_amount, r.return_date, c.customer_name
      FROM returns r
      LEFT JOIN customers c ON r.customer_id = c.id
      ORDER BY r.created_at DESC LIMIT 5
    `).all();

    const recentPayments = db.prepare(`
      SELECT lp.id, lp.amount, lp.payment_date, lp.payment_method, l.reference_no as ledger_ref, c.customer_name
      FROM ledger_payments lp
      LEFT JOIN ledgers l ON lp.ledger_id = l.id
      LEFT JOIN customers c ON l.customer_id = c.id
      ORDER BY lp.created_at DESC LIMIT 5
    `).all();

    const recentDamages = db.prepare(`
      SELECT dr.id, dr.quantity, dr.reference_no, dr.recorded_date, p.product_name
      FROM damage_records dr
      LEFT JOIN products p ON dr.product_id = p.id
      ORDER BY dr.created_at DESC LIMIT 5
    `).all();

    return { recentSales, recentReturns, recentPayments, recentDamages };
  }

  getSetting(key) {
    const db = getDatabase();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }
}

module.exports = new DashboardService();