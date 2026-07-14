// Dashboard Page
const DashboardPage = {
  async load() {
    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of your inventory</p>
        </div>
        <button class="btn btn-primary" onclick="App.refreshCurrentPage()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </div>
      <div id="dashboard-content">
        <div class="loading"><div class="spinner"></div></div>
      </div>
    `;
    await this.refresh();
  },

  async refresh() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    try {
      const result = await window.api.getDashboardData();
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><h3>Error loading dashboard</h3><p>${result.error}</p></div>`;
        return;
      }

      const data = result.data;
      App.currency = data.currency || 'USD';

      container.innerHTML = this.renderDashboard(data);
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  },

  renderDashboard(data) {
    const inv = data.inventorySummary;
    const fin = data.financialSummary;
    const cond = data.conditionSummary;
    const sales = data.salesSummary;
    const ledger = data.saleSummary;
    const damage = data.damageSummary;
    const activity = data.recentActivity;

    return `
      ${this.renderFinancialOverview(fin, ledger, sales, damage)}
      ${this.renderInventorySummary(inv, fin, damage)}
      ${this.renderConditionSummary(cond)}
      ${this.renderActivity(activity)}
    `;
  },

  renderFinancialOverview(fin, ledger, sales, damage) {
    const currency = App.currency || 'USD';
    const netProfit = fin.grossProfit - (ledger.totalReturnsValue || 0);
    const netRevenue = fin.totalSoldValue - (ledger.totalReturnsValue || 0);

    return `
      <div class="dashboard-section">
        <h2>Financial Overview</h2>
        <div class="stats-grid">
          <div class="stat-card clickable" onclick="DashboardPage.showDetail('Sales Overview', DashboardPage.getSalesDetailHtml)" title="Click for details">
            <div class="stat-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div class="stat-value">${Formatters.formatCurrency(sales.totalSales, currency)}</div>
            <div class="stat-label">Total Sales (${sales.totalTransactions} transactions)</div>
            <div class="stat-trend">Today: ${Formatters.formatCurrency(sales.todaySales, currency)}</div>
          </div>
          <div class="stat-card clickable" onclick="DashboardPage.showDetail('Cost of Goods Sold', DashboardPage.getCostDetailHtml)" title="Click for details">
            <div class="stat-icon yellow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <div class="stat-value">${Formatters.formatCurrency(fin.totalCOGS, currency)}</div>
            <div class="stat-label">Cost of Goods Sold</div>
          </div>
          <div class="stat-card clickable" onclick="DashboardPage.showDetail('Gross Profit', DashboardPage.getProfitDetailHtml)" title="Click for details">
            <div class="stat-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>
              </svg>
            </div>
            <div class="stat-value">${Formatters.formatCurrency(fin.grossProfit, currency)}</div>
            <div class="stat-label">Gross Profit</div>
          </div>
          <div class="stat-card clickable" onclick="DashboardPage.showDetail('Net Revenue', DashboardPage.getNetRevenueDetailHtml)" title="Click for details">
            <div class="stat-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <div class="stat-value">${Formatters.formatCurrency(netRevenue, currency)}</div>
            <div class="stat-label">Net Revenue (after returns)</div>
          </div>
          <div class="stat-card clickable" onclick="DashboardPage.showDetail('Outstanding Balances', DashboardPage.getOutstandingDetailHtml)" title="Click for details">
            <div class="stat-icon red">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div class="stat-value">${Formatters.formatCurrency(ledger.totalOutstanding, currency)}</div>
            <div class="stat-label">Outstanding Balance</div>
            <div class="stat-trend">${ledger.outstandingInvoices || 0} outstanding invoices</div>
          </div>
          <div class="stat-card clickable" onclick="DashboardPage.showDetail('Payments Collected', DashboardPage.getCollectedDetailHtml)" title="Click for details">
            <div class="stat-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div class="stat-value">${Formatters.formatCurrency(sales.totalCollected, currency)}</div>
            <div class="stat-label">Total Collected</div>
            <div class="stat-trend">Today: ${Formatters.formatCurrency(sales.todayCollected, currency)}</div>
          </div>
          <div class="stat-card clickable" onclick="DashboardPage.showDetail('Damaged Stock', DashboardPage.getDamageDetailHtml)" title="Click for details">
            <div class="stat-icon red">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <line x1="18" y1="6" x2="6" y2="18"/><circle cx="12" cy="12" r="10"/>
              </svg>
            </div>
            <div class="stat-value">${Formatters.formatCurrency(fin.damagedStockValue, currency)}</div>
            <div class="stat-label">Damaged Stock Value</div>
            <div class="stat-trend">${damage.damagedStatusQty} units damaged</div>
          </div>
          <div class="stat-card clickable" onclick="DashboardPage.showDetail('Returns & Credits', DashboardPage.getReturnsDetailHtml)" title="Click for details">
            <div class="stat-icon warning">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
              </svg>
            </div>
            <div class="stat-value">${Formatters.formatCurrency(ledger.totalReturnsValue, currency)}</div>
            <div class="stat-label">Returns / Credits</div>
            <div class="stat-trend">${ledger.totalReturns || 0} return transactions</div>
          </div>
          <div class="stat-card clickable" onclick="DashboardPage.showDetail('Net Profit', DashboardPage.getProfitDetailHtml)" title="Click for details">
            <div class="stat-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
              </svg>
            </div>
            <div class="stat-value ${netProfit >= 0 ? '' : 'text-danger'}">${Formatters.formatCurrency(netProfit, currency)}</div>
            <div class="stat-label">Net Profit / Loss</div>
          </div>
        </div>
      </div>
    `;
  },

  renderInventorySummary(inv, fin, damage) {
    const currency = App.currency || 'USD';
    const availableQty = inv.inStock;
    const availableValue = fin.currentInventoryValue;

    return `
      <div class="dashboard-section">
        <h2>Inventory Summary</h2>
        <div class="stats-grid">
          <div class="stat-card clickable" onclick="App.navigate('inventory')" title="View inventory">
            <div class="stat-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              </svg>
            </div>
            <div class="stat-value">${inv.totalProducts}</div>
            <div class="stat-label">Total Products</div>
          </div>
          <div class="stat-card clickable" onclick="App.navigate('inventory')" title="View inventory">
            <div class="stat-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <div class="stat-value">${inv.totalQuantity}</div>
            <div class="stat-label">Total Quantity</div>
          </div>
          <div class="stat-card clickable" onclick="DashboardPage.showDetail('Stock Value', DashboardPage.getStockValueDetailHtml)" title="Click for details">
            <div class="stat-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div class="stat-value">${availableQty}</div>
            <div class="stat-label">Available (In Stock)</div>
          </div>
          <div class="stat-card clickable" onclick="DashboardPage.showDetail('Reserved Stock', DashboardPage.getReservedDetailHtml)" title="Click for details">
            <div class="stat-icon yellow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div class="stat-value">${inv.reserved}</div>
            <div class="stat-label">Reserved</div>
          </div>
          <div class="stat-card clickable" onclick="DashboardPage.showDetail('Stock Value', DashboardPage.getStockValueDetailHtml)" title="Click for details">
            <div class="stat-icon yellow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </div>
            <div class="stat-value">${Formatters.formatCurrency(availableValue, currency)}</div>
            <div class="stat-label">Stock Value (Available)</div>
          </div>
          <div class="stat-card clickable" onclick="DashboardPage.showDetail('Returned Stock', DashboardPage.getReturnedDetailHtml)" title="Click for details">
            <div class="stat-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <path d="M3 12a9 9 0 1 0 9-9M3 3v6h6"/>
              </svg>
            </div>
            <div class="stat-value">${inv.returned}</div>
            <div class="stat-label">Returned (in stock)</div>
          </div>
          <div class="stat-card clickable" onclick="DashboardPage.showDetail('Damaged Stock', DashboardPage.getDamageDetailHtml)" title="Click for details">
            <div class="stat-icon red">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <line x1="18" y1="6" x2="6" y2="18"/><circle cx="12" cy="12" r="10"/>
              </svg>
            </div>
            <div class="stat-value">${inv.damaged}</div>
            <div class="stat-label">Damaged (in stock)</div>
          </div>
          <div class="stat-card clickable" onclick="DashboardPage.showDetail('Sold Quantity', DashboardPage.getSoldQtyDetailHtml)" title="Click for details">
            <div class="stat-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div class="stat-value">${inv.totalSoldFromSales}</div>
            <div class="stat-label">Sold (from sales)</div>
            <div class="stat-trend">${inv.totalReturnedFromReturns} returned via returns</div>
          </div>
        </div>
      </div>
    `;
  },

  renderConditionSummary(cond) {
    return `
      <div class="dashboard-section">
        <h2>Condition Summary</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <div class="stat-value">${cond.excellent}</div>
            <div class="stat-label">Excellent</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <div class="stat-value">${cond.good}</div>
            <div class="stat-label">Good</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon yellow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              </svg>
            </div>
            <div class="stat-value">${cond.fair}</div>
            <div class="stat-label">Fair</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon red">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/>
              </svg>
            </div>
            <div class="stat-value">${cond.damaged}</div>
            <div class="stat-label">Damaged</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;color:var(--text-muted);">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </div>
            <div class="stat-value">${cond.forParts}</div>
            <div class="stat-label">For Parts</div>
          </div>
        </div>
      </div>
    `;
  },

  renderActivity(activity) {
    return `
      <div class="dashboard-section">
        <h2>Recent Activity</h2>
        <div class="dashboard-grid">
          <div class="card">
            <div class="card-header"><h3>Recent Sales</h3></div>
            <div class="card-body">
              ${this.renderSalesList(activity.recentSales)}
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h3>Recent Payments</h3></div>
            <div class="card-body">
              ${this.renderPaymentsList(activity.recentPayments)}
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h3>Recent Returns</h3></div>
            <div class="card-body">
              ${this.renderReturnsList(activity.recentReturns)}
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h3>Recent Damages</h3></div>
            <div class="card-body">
              ${this.renderDamagesList(activity.recentDamages)}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderSalesList(items) {
    if (!items || items.length === 0) {
      return '<p style="color:var(--text-muted);text-align:center;padding:20px;">No sales yet.</p>';
    }
    const currency = App.currency || 'USD';
    return `<ul class="activity-list">${items.map(item => `
      <li class="activity-item">
        <div class="activity-icon added">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div class="activity-info">
          <div class="activity-title">${this.escapeHtml(item.reference_no)}</div>
          <div class="activity-subtitle">${this.escapeHtml(item.customer_name)} - ${Formatters.formatCurrency(item.total_amount, currency)}</div>
        </div>
        <div class="activity-time">${Formatters.formatRelativeTime(item.issue_date)}</div>
      </li>
    `).join('')}</ul>`;
  },

  renderPaymentsList(items) {
    if (!items || items.length === 0) {
      return '<p style="color:var(--text-muted);text-align:center;padding:20px;">No payments yet.</p>';
    }
    const currency = App.currency || 'USD';
    return `<ul class="activity-list">${items.map(item => `
      <li class="activity-item">
        <div class="activity-icon updated">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div class="activity-info">
          <div class="activity-title">${Formatters.formatCurrency(item.amount, currency)} received</div>
          <div class="activity-subtitle">${this.escapeHtml(item.customer_name)} - ${this.escapeHtml(item.sale_ref)} (${item.payment_method})</div>
        </div>
        <div class="activity-time">${Formatters.formatRelativeTime(item.payment_date)}</div>
      </li>
    `).join('')}</ul>`;
  },

  renderReturnsList(items) {
    if (!items || items.length === 0) {
      return '<p style="color:var(--text-muted);text-align:center;padding:20px;">No returns yet.</p>';
    }
    const currency = App.currency || 'USD';
    return `<ul class="activity-list">${items.map(item => `
      <li class="activity-item">
        <div class="activity-icon sold">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
        </div>
        <div class="activity-info">
          <div class="activity-title">${this.escapeHtml(item.reference_no)}</div>
          <div class="activity-subtitle">${this.escapeHtml(item.customer_name)} - ${Formatters.formatCurrency(item.total_return_amount, currency)}</div>
        </div>
        <div class="activity-time">${Formatters.formatRelativeTime(item.return_date)}</div>
      </li>
    `).join('')}</ul>`;
  },

  renderDamagesList(items) {
    if (!items || items.length === 0) {
      return '<p style="color:var(--text-muted);text-align:center;padding:20px;">No damages recorded.</p>';
    }
    const currency = App.currency || 'USD';
    return `<ul class="activity-list">${items.map(item => `
      <li class="activity-item">
        <div class="activity-icon sold">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/>
          </svg>
        </div>
        <div class="activity-info">
          <div class="activity-title">${this.escapeHtml(item.product_name)} x${item.quantity}</div>
          <div class="activity-subtitle">Ref: ${this.escapeHtml(item.reference_no)}</div>
        </div>
        <div class="activity-time">${Formatters.formatRelativeTime(item.recorded_date)}</div>
      </li>
    `).join('')}</ul>`;
  },

  // ==================== DETAIL MODAL METHODS ====================

  async showDetail(title, htmlFn) {
    const body = '<div class="loading"><div class="spinner" style="width:24px;height:24px;"></div></div>';
    const footer = '<button class="btn btn-secondary" onclick="window.Modal.close()">Close</button>';
    Modal.show({ title, body, footer, size: 'md' });

    try {
      const html = await htmlFn();
      const modalBody = document.querySelector('.modal-body');
      if (modalBody) modalBody.innerHTML = html;
    } catch(e) {
      const modalBody = document.querySelector('.modal-body');
      if (modalBody) modalBody.innerHTML = `<p style="color:var(--danger);">Error: ${e.message}</p>`;
    }
  },

  async getSalesDetailHtml() {
    const result = await window.api.getDashboardData();
    if (!result.success) throw new Error(result.error);
    const s = result.data.salesSummary;
    const currency = App.currency || 'USD';
    return `
      <div class="ledger-stats-grid" style="grid-template-columns:repeat(2,1fr);">
        <div class="ledger-stat-card stat-success">
          <div class="stat-value">${Formatters.formatCurrency(s.totalSales, currency)}</div>
          <div class="stat-label">Total Sales Value</div>
        </div>
        <div class="ledger-stat-card">
          <div class="stat-value">${s.totalTransactions}</div>
          <div class="stat-label">Total Transactions</div>
        </div>
        <div class="ledger-stat-card">
          <div class="stat-value">${Formatters.formatCurrency(s.todaySales, currency)}</div>
          <div class="stat-label">Today's Sales</div>
        </div>
        <div class="ledger-stat-card stat-success">
          <div class="stat-value">${s.paidCount}</div>
          <div class="stat-label">Paid</div>
        </div>
        <div class="ledger-stat-card stat-warning">
          <div class="stat-value">${s.partialCount}</div>
          <div class="stat-label">Partial</div>
        </div>
        <div class="ledger-stat-card stat-danger">
          <div class="stat-value">${s.outstandingCount}</div>
          <div class="stat-label">Outstanding</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn btn-primary btn-sm" onclick="Modal.close();App.navigate('sales')">New Sale</button>
        <button class="btn btn-secondary btn-sm" onclick="Modal.close();App.navigate('reports')">View Reports</button>
      </div>
    `;
  },

  async getCostDetailHtml() {
    const result = await window.api.getDashboardData();
    if (!result.success) throw new Error(result.error);
    const f = result.data.financialSummary;
    const currency = App.currency || 'USD';
    return `
      <div class="ledger-stats-grid" style="grid-template-columns:repeat(2,1fr);">
        <div class="ledger-stat-card">
          <div class="stat-value">${Formatters.formatCurrency(f.totalCOGS, currency)}</div>
          <div class="stat-label">Total COGS (Actual)</div>
        </div>
        <div class="ledger-stat-card">
          <div class="stat-value">${Formatters.formatCurrency(f.totalPurchaseValue, currency)}</div>
          <div class="stat-label">Total Purchase Value</div>
        </div>
      </div>
      <p style="margin-top:12px;color:var(--text-secondary);font-size:13px;">
        COGS is calculated from actual items sold (purchase price x quantity sold).
      </p>
    `;
  },

  async getProfitDetailHtml() {
    const result = await window.api.getDashboardData();
    if (!result.success) throw new Error(result.error);
    const f = result.data.financialSummary;
    const l = result.data.saleSummary;
    const currency = App.currency || 'USD';
    const netProfit = f.grossProfit - (l.totalReturnsValue || 0);
    return `
      <div class="ledger-stats-grid" style="grid-template-columns:repeat(2,1fr);">
        <div class="ledger-stat-card stat-success">
          <div class="stat-value">${Formatters.formatCurrency(f.totalSoldValue, currency)}</div>
          <div class="stat-label">Total Sales</div>
        </div>
        <div class="ledger-stat-card stat-danger">
          <div class="stat-value">${Formatters.formatCurrency(f.totalCOGS, currency)}</div>
          <div class="stat-label">Total COGS</div>
        </div>
        <div class="ledger-stat-card stat-success">
          <div class="stat-value">${Formatters.formatCurrency(f.grossProfit, currency)}</div>
          <div class="stat-label">Gross Profit</div>
        </div>
        <div class="ledger-stat-card stat-danger">
          <div class="stat-value">${Formatters.formatCurrency(l.totalReturnsValue, currency)}</div>
          <div class="stat-label">Returns Adjustment</div>
        </div>
      </div>
      <div style="margin-top:12px;padding:12px;background:var(--bg-tertiary);border-radius:var(--radius);text-align:center;">
        <span style="font-size:14px;color:var(--text-secondary);">Net Profit: </span>
        <span style="font-size:24px;font-weight:700;color:${netProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">${Formatters.formatCurrency(netProfit, currency)}</span>
      </div>
    `;
  },

  async getNetRevenueDetailHtml() {
    const result = await window.api.getDashboardData();
    if (!result.success) throw new Error(result.error);
    const f = result.data.financialSummary;
    const l = result.data.saleSummary;
    const currency = App.currency || 'USD';
    const netRevenue = f.totalSoldValue - (l.totalReturnsValue || 0);
    return `
      <div class="ledger-stats-grid" style="grid-template-columns:repeat(2,1fr);">
        <div class="ledger-stat-card stat-success">
          <div class="stat-value">${Formatters.formatCurrency(f.totalSoldValue, currency)}</div>
          <div class="stat-label">Gross Sales Revenue</div>
        </div>
        <div class="ledger-stat-card stat-danger">
          <div class="stat-value">${Formatters.formatCurrency(l.totalReturnsValue, currency)}</div>
          <div class="stat-label">Less: Returns and Credits</div>
        </div>
        <div class="ledger-stat-card stat-success" style="grid-column:1/-1;">
          <div class="stat-value">${Formatters.formatCurrency(netRevenue, currency)}</div>
          <div class="stat-label">Net Revenue (Actual Income)</div>
        </div>
      </div>
    `;
  },

  async getOutstandingDetailHtml() {
    const result = await window.api.getOutstandingReport();
    if (!result.success) throw new Error(result.error);
    const data = result.data || [];
    const currency = App.currency || 'USD';
    const totalOutstanding = data.reduce((sum, c) => sum + c.total_outstanding, 0);
    if (data.length === 0) {
      return '<p style="text-align:center;padding:20px;color:var(--success);">All customers have cleared their balances!</p>';
    }
    const safe = (str) => { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; };
    return `
      <div style="margin-bottom:12px;font-size:18px;font-weight:700;color:var(--danger);">
        Total Due: ${Formatters.formatCurrency(totalOutstanding, currency)} (${data.length} customers)
      </div>
      <table class="report-table">
        <thead><tr><th>Customer</th><th>Phone</th><th>Invoices</th><th>Outstanding</th></tr></thead>
        <tbody>
          ${data.map(c => `
            <tr>
              <td><strong>${safe(c.customer_name)}</strong></td>
              <td>${safe(c.phone) || '-'}</td>
              <td>${c.invoice_count}</td>
              <td style="font-weight:700;color:var(--danger);">${Formatters.formatCurrency(c.total_outstanding, currency)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="margin-top:12px;">
        <button class="btn btn-primary btn-sm" onclick="Modal.close();App.navigate('ledgers')">View All Sales</button>
      </div>
    `;
  },

  async getCollectedDetailHtml() {
    const result = await window.api.getDashboardData();
    if (!result.success) throw new Error(result.error);
    const s = result.data.salesSummary;
    const l = result.data.saleSummary;
    const currency = App.currency || 'USD';
    return `
      <div class="ledger-stats-grid" style="grid-template-columns:repeat(2,1fr);">
        <div class="ledger-stat-card stat-success">
          <div class="stat-value">${Formatters.formatCurrency(s.totalCollected, currency)}</div>
          <div class="stat-label">Total Collected</div>
        </div>
        <div class="ledger-stat-card">
          <div class="stat-value">${Formatters.formatCurrency(l.totalSaleCollected, currency)}</div>
          <div class="stat-label">From Invoices</div>
        </div>
        <div class="ledger-stat-card">
          <div class="stat-value">${Formatters.formatCurrency(s.todayCollected, currency)}</div>
          <div class="stat-label">Today Collections</div>
        </div>
        <div class="ledger-stat-card stat-danger">
          <div class="stat-value">${Formatters.formatCurrency(l.totalOutstanding, currency)}</div>
          <div class="stat-label">Still Outstanding</div>
        </div>
      </div>
    `;
  },

  async getDamageDetailHtml() {
    const result = await window.api.getDashboardData();
    if (!result.success) throw new Error(result.error);
    const d = result.data.damageSummary;
    const currency = App.currency || 'USD';
    return `
      <div class="ledger-stats-grid" style="grid-template-columns:repeat(2,1fr);">
        <div class="ledger-stat-card stat-danger">
          <div class="stat-value">${d.damagedStatusQty}</div>
          <div class="stat-label">Damaged Units (Status)</div>
        </div>
        <div class="ledger-stat-card stat-danger">
          <div class="stat-value">${Formatters.formatCurrency(d.damagedStatusValue, currency)}</div>
          <div class="stat-label">Damaged Stock Value</div>
        </div>
        <div class="ledger-stat-card">
          <div class="stat-value">${d.damagedProductsCount}</div>
          <div class="stat-label">Products with Damage Records</div>
        </div>
        <div class="ledger-stat-card">
          <div class="stat-value">${d.totalDamagedQty}</div>
          <div class="stat-label">Total Damage Records Qty</div>
        </div>
      </div>
      <p style="margin-top:12px;color:var(--text-secondary);font-size:13px;">
        Damaged stock is excluded from available-for-sale quantity.
      </p>
      <div style="margin-top:12px;">
        <button class="btn btn-primary btn-sm" onclick="Modal.close();App.navigate('inventory')">View Inventory</button>
      </div>
    `;
  },

  async getStockValueDetailHtml() {
    const result = await window.api.getDashboardData();
    if (!result.success) throw new Error(result.error);
    const f = result.data.financialSummary;
    const inv = result.data.inventorySummary;
    const currency = App.currency || 'USD';
    return `
      <div class="ledger-stats-grid" style="grid-template-columns:repeat(2,1fr);">
        <div class="ledger-stat-card">
          <div class="stat-value">${inv.inStock}</div>
          <div class="stat-label">In Stock Quantity</div>
        </div>
        <div class="ledger-stat-card stat-success">
          <div class="stat-value">${Formatters.formatCurrency(f.currentInventoryValue, currency)}</div>
          <div class="stat-label">Available Stock Value (Cost)</div>
        </div>
        <div class="ledger-stat-card">
          <div class="stat-value">${Formatters.formatCurrency(f.totalSellingValue, currency)}</div>
          <div class="stat-label">Total Selling Value (All Stock)</div>
        </div>
        <div class="ledger-stat-card stat-success">
          <div class="stat-value">${Formatters.formatCurrency(f.totalSellingValue - f.totalPurchaseValue, currency)}</div>
          <div class="stat-label">Potential Profit</div>
        </div>
      </div>
    `;
  },

  getReservedDetailHtml() {
    return Promise.resolve(`
      <p style="margin-bottom:12px;color:var(--text-secondary);">
        Reserved stock items are set aside for specific customers or orders but not yet sold.
        These items are not available for new sales.
      </p>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary btn-sm" onclick="Modal.close();App.navigate('inventory')">View Inventory</button>
      </div>
    `);
  },

  getReturnedDetailHtml() {
    return Promise.resolve(`
      <p style="margin-bottom:12px;color:var(--text-secondary);">
        Returned products are items that have been processed through the returns workflow
        and restored to available inventory.
      </p>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary btn-sm" onclick="Modal.close();App.navigate('returns')">View Returns</button>
      </div>
    `);
  },

  async getReturnsDetailHtml() {
    const result = await window.api.getDashboardData();
    if (!result.success) throw new Error(result.error);
    const l = result.data.saleSummary;
    const inv = result.data.inventorySummary;
    const currency = App.currency || 'USD';
    return `
      <div class="ledger-stats-grid" style="grid-template-columns:repeat(2,1fr);">
        <div class="ledger-stat-card stat-warning">
          <div class="stat-value">${Formatters.formatCurrency(l.totalReturnsValue, currency)}</div>
          <div class="stat-label">Total Return Value</div>
        </div>
        <div class="ledger-stat-card">
          <div class="stat-value">${l.totalReturns || 0}</div>
          <div class="stat-label">Return Transactions</div>
        </div>
        <div class="ledger-stat-card">
          <div class="stat-value">${inv.totalReturnedFromReturns}</div>
          <div class="stat-label">Units Returned (from returns table)</div>
        </div>
        <div class="ledger-stat-card">
          <div class="stat-value">${inv.totalSoldFromSales}</div>
          <div class="stat-label">Total Units Sold (from sales table)</div>
        </div>
      </div>
      <p style="margin-top:12px;color:var(--text-secondary);font-size:13px;">
        Return values are deducted from sales revenue and profit calculations.
        Stock is restored to inventory when returns are processed.
      </p>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn btn-primary btn-sm" onclick="Modal.close();App.navigate('returns')">View Returns</button>
      </div>
    `;
  },

  getSoldQtyDetailHtml() {
    return Promise.resolve(`
      <p style="margin-bottom:12px;color:var(--text-secondary);">
        Total quantity of products that have been sold via transactions.
        This shows the actual count from sale_issue_items table.
      </p>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary btn-sm" onclick="Modal.close();App.navigate('ledgers')">View Sales</button>
      </div>
    `);
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};