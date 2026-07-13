const { getDatabase } = require('../database/dbInit');

class DashboardService {
  getDashboardData() {
    const db = getDatabase();
    const currency = this.getSetting('currency') || 'USD';

    const inventorySummary = this.getInventorySummary(db);
    const financialSummary = this.getFinancialSummary(db);
    const conditionSummary = this.getConditionSummary(db);
    const recentActivity = this.getRecentActivity(db);

    return {
      inventorySummary,
      financialSummary,
      conditionSummary,
      recentActivity,
      currency
    };
  }

  getInventorySummary(db) {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_products,
        COALESCE(SUM(quantity), 0) as total_quantity,
        COALESCE(SUM(CASE WHEN status = 'In Stock' THEN quantity ELSE 0 END), 0) as in_stock,
        COALESCE(SUM(CASE WHEN status = 'Reserved' THEN quantity ELSE 0 END), 0) as reserved,
        COALESCE(SUM(CASE WHEN status = 'Sold' THEN quantity ELSE 0 END), 0) as sold,
        COALESCE(SUM(CASE WHEN status = 'Returned' THEN quantity ELSE 0 END), 0) as returned,
        COALESCE(SUM(CASE WHEN status = 'Damaged' THEN quantity ELSE 0 END), 0) as damaged
      FROM products
    `).get();

    return {
      totalProducts: stats.total_products,
      totalQuantity: stats.total_quantity,
      inStock: stats.in_stock,
      reserved: stats.reserved,
      sold: stats.sold,
      returned: stats.returned,
      damaged: stats.damaged
    };
  }

  getFinancialSummary(db) {
    const stats = db.prepare(`
      SELECT
        COALESCE(SUM(purchase_price * quantity), 0) as total_purchase_value,
        COALESCE(SUM(selling_price * quantity), 0) as total_selling_value,
        COALESCE(SUM(CASE WHEN status = 'Sold' THEN selling_price * quantity ELSE 0 END), 0) as total_sold_value,
        COALESCE(SUM(CASE WHEN status = 'In Stock' OR status = 'Reserved' THEN purchase_price * quantity ELSE 0 END), 0) as current_inventory_value
      FROM products
    `).get();

    return {
      totalPurchaseValue: stats.total_purchase_value,
      totalSellingValue: stats.total_selling_value,
      totalSoldValue: stats.total_sold_value,
      currentInventoryValue: stats.current_inventory_value,
      expectedProfit: stats.total_selling_value - stats.total_purchase_value
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

  getRecentActivity(db) {
    const recentlyAdded = db.prepare(
      "SELECT id, product_name, category, created_at FROM products ORDER BY created_at DESC LIMIT 5"
    ).all();

    const recentlyUpdated = db.prepare(
      "SELECT id, product_name, category, updated_at FROM products ORDER BY updated_at DESC LIMIT 5"
    ).all();

    const recentlySold = db.prepare(
      "SELECT id, product_name, category, selling_price, updated_at FROM products WHERE status = 'Sold' ORDER BY updated_at DESC LIMIT 5"
    ).all();

    return { recentlyAdded, recentlyUpdated, recentlySold };
  }

  getSetting(key) {
    const db = getDatabase();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }
}

module.exports = new DashboardService();