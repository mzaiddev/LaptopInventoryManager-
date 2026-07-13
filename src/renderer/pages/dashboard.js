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
    const activity = data.recentActivity;

    return `
      ${this.renderInventorySummary(inv)}
      ${this.renderFinancialSummary(fin)}
      ${this.renderConditionSummary(cond)}
      ${this.renderActivity(activity)}
    `;
  },

  renderInventorySummary(inv) {
    return `
      <div class="dashboard-section">
        <h2>Inventory Summary</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              </svg>
            </div>
            <div class="stat-value">${inv.totalProducts}</div>
            <div class="stat-label">Total Products</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <div class="stat-value">${inv.totalQuantity}</div>
            <div class="stat-label">Total Quantity</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div class="stat-value">${inv.inStock}</div>
            <div class="stat-label">In Stock</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon yellow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div class="stat-value">${inv.reserved}</div>
            <div class="stat-label">Reserved</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div class="stat-value">${inv.sold}</div>
            <div class="stat-label">Sold</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon yellow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <path d="M3 12a9 9 0 1 0 9-9M3 3v6h6"/>
              </svg>
            </div>
            <div class="stat-value">${inv.returned}</div>
            <div class="stat-label">Returned</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon red">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <line x1="18" y1="6" x2="6" y2="18"/><circle cx="12" cy="12" r="10"/>
              </svg>
            </div>
            <div class="stat-value">${inv.damaged}</div>
            <div class="stat-label">Damaged</div>
          </div>
        </div>
      </div>
    `;
  },

  renderFinancialSummary(fin) {
    const currency = App.currency || 'USD';
    return `
      <div class="dashboard-section">
        <h2>Financial Summary</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon red">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <div class="stat-value">${Formatters.formatCurrency(fin.totalPurchaseValue, currency)}</div>
            <div class="stat-label">Total Purchase Value</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div class="stat-value">${Formatters.formatCurrency(fin.totalSoldValue, currency)}</div>
            <div class="stat-label">Total Sold Value</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon yellow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              </svg>
            </div>
            <div class="stat-value">${Formatters.formatCurrency(fin.currentInventoryValue, currency)}</div>
            <div class="stat-label">Current Inventory Value</div>
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
            <div class="card-header"><h3>Recently Added</h3></div>
            <div class="card-body">
              ${this.renderActivityList(activity.recentlyAdded, 'added', 'Added')}
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h3>Recently Updated</h3></div>
            <div class="card-body">
              ${this.renderActivityList(activity.recentlyUpdated, 'updated', 'Updated')}
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h3>Recently Sold</h3></div>
            <div class="card-body">
              ${this.renderActivityList(activity.recentlySold, 'sold', 'Sold')}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderActivityList(items, iconClass, label) {
    if (!items || items.length === 0) {
      return '<p style="color:var(--text-muted);text-align:center;padding:20px;">No activity yet.</p>';
    }

    const currency = App.currency || 'USD';
    return `<ul class="activity-list">${items.map(item => `
      <li class="activity-item">
        <div class="activity-icon ${iconClass}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
            <path d="M12 5v14"/><path d="M5 12h14"/>
          </svg>
        </div>
        <div class="activity-info">
          <div class="activity-title">${item.product_name}</div>
          <div class="activity-subtitle">${item.category || ''}${item.selling_price ? ' - ' + Formatters.formatCurrency(item.selling_price, currency) : ''}</div>
        </div>
        <div class="activity-time">${Formatters.formatRelativeTime(item.created_at || item.updated_at)}</div>
      </li>
    `).join('')}</ul>`;
  }
};