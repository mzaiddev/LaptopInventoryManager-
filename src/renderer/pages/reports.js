// Reports Page
const ReportsPage = {
  async load() {
    const content = document.getElementById("page-content");
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Reports</h1>
          <p>Sales, outstanding, and ledger reports</p>
        </div>
      </div>
      <div class="tab-bar">
        <button class="tab-item active" data-tab="overview" onclick="ReportsPage.switchTab('overview')">Overview</button>
        <button class="tab-item" data-tab="sales" onclick="ReportsPage.switchTab('sales')">Sales Report</button>
        <button class="tab-item" data-tab="outstanding" onclick="ReportsPage.switchTab('outstanding')">Outstanding Dues</button>
        <button class="tab-item" data-tab="customers" onclick="ReportsPage.switchTab('customers')">Customer Report</button>
        <button class="tab-item" data-tab="damage" onclick="ReportsPage.switchTab('damage')">Damages</button>
      </div>
      <div id="reports-content">
        <div class="loading"><div class="spinner"></div></div>
      </div>
    `;
    await this.switchTab("overview");
  },

  async refresh() {
    const activeTab = document.querySelector(".tab-item.active");
    if (activeTab) {
      await this.switchTab(activeTab.dataset.tab);
    }
  },

  async switchTab(tab) {
    document.querySelectorAll(".tab-item").forEach(t => {
      t.classList.toggle("active", t.dataset.tab === tab);
    });

    const container = document.getElementById("reports-content");
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    switch (tab) {
      case "overview": await this.renderOverview(container); break;
      case "sales": await this.renderSalesReport(container); break;
      case "outstanding": await this.renderOutstanding(container); break;
      case "customers": await this.renderCustomerReport(container); break;
      case "damage": await this.renderDamageReport(container); break;
    }
  },

  async renderOverview(container) {
    try {
      const result = await window.api.getLedgerSummary();
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${result.error}</p></div>`;
        return;
      }
      const s = result.data;
      const currency = App.currency || "USD";

      container.innerHTML = `
        <div class="ledger-stats-grid">
          <div class="ledger-stat-card">
            <div class="stat-value">${Formatters.formatCurrency(s.total_sales, currency)}</div>
            <div class="stat-label">Total Sales</div>
          </div>
          <div class="ledger-stat-card stat-success">
            <div class="stat-value">${Formatters.formatCurrency(s.total_collected, currency)}</div>
            <div class="stat-label">Total Collected</div>
          </div>
          <div class="ledger-stat-card stat-danger">
            <div class="stat-value">${Formatters.formatCurrency(s.total_outstanding, currency)}</div>
            <div class="stat-label">Outstanding</div>
          </div>
          <div class="ledger-stat-card">
            <div class="stat-value">${s.active_customers}</div>
            <div class="stat-label">Active Customers</div>
          </div>
          <div class="ledger-stat-card stat-success">
            <div class="stat-value">${Formatters.formatCurrency(s.today_sales, currency)}</div>
            <div class="stat-label">Today's Sales</div>
          </div>
          <div class="ledger-stat-card">
            <div class="stat-value">${Formatters.formatCurrency(s.today_payments, currency)}</div>
            <div class="stat-label">Today's Payments</div>
          </div>
        </div>
        <div class="report-card">
          <h3>Ledger Status Breakdown</h3>
          ${s.ledger_counts && s.ledger_counts.length > 0 ? `
            <table class="report-table">
              <thead><tr><th>Status</th><th>Count</th></tr></thead>
              <tbody>
                ${s.ledger_counts.map(lc => `
                  <tr>
                    <td><span class="badge ${lc.status === 'Paid' ? 'badge-paid' : lc.status === 'Partial' ? 'badge-partial' : 'badge-outstanding'}">${lc.status}</span></td>
                    <td>${lc.cnt}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<p style="color:var(--text-muted);">No ledger data yet.</p>'}
        </div>
        <div style="display:flex;gap:12px;margin-top:16px;">
          <button class="btn btn-primary" onclick="App.navigate('sales')">New Sale / Issue</button>
          <button class="btn btn-secondary" onclick="ReportsPage.switchTab('outstanding')">View Outstanding</button>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  },

  async renderSalesReport(container) {
    const currency = App.currency || "USD";
    container.innerHTML = `
      <div class="report-card">
        <h3>Filter Sales</h3>
        <div class="filters-bar">
          <div class="filter-group">
            <label style="font-size:13px;margin-right:4px;">From:</label>
            <input type="date" id="rpt-sales-from" onchange="ReportsPage.loadSalesReport()" style="padding:8px;border:1px solid var(--border-color);border-radius:var(--radius);font-size:13px;background:var(--card-bg);color:var(--text-primary);">
            <label style="font-size:13px;margin:0 4px 0 12px;">To:</label>
            <input type="date" id="rpt-sales-to" onchange="ReportsPage.loadSalesReport()" style="padding:8px;border:1px solid var(--border-color);border-radius:var(--radius);font-size:13px;background:var(--card-bg);color:var(--text-primary);">
          </div>
          <select id="rpt-sales-status" onchange="ReportsPage.loadSalesReport()" style="padding:8px;border:1px solid var(--border-color);border-radius:var(--radius);font-size:13px;background:var(--card-bg);color:var(--text-primary);">
            <option value="">All Status</option>
            <option value="Paid">Paid</option>
            <option value="Partial">Partial</option>
            <option value="Outstanding">Outstanding</option>
          </select>
        </div>
      </div>
      <div id="sales-report-data"><div class="loading"><div class="spinner"></div></div></div>
    `;
    await this.loadSalesReport();
  },

  async loadSalesReport() {
    const container = document.getElementById("sales-report-data");
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const filters = {
        date_from: document.getElementById("rpt-sales-from")?.value || "",
        date_to: document.getElementById("rpt-sales-to")?.value || "",
        payment_status: document.getElementById("rpt-sales-status")?.value || "",
      };

      const result = await window.api.getSalesReport(filters);
      if (!result.success) {
        container.innerHTML = `<p style="color:var(--danger);">${result.error}</p>`;
        return;
      }

      const sales = result.data || [];
      if (sales.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);padding:20px;text-align:center;">No sales found for the selected filters.</p>';
        return;
      }

      const totalAmount = sales.reduce((sum, s) => sum + s.total_amount, 0);
      const totalPaid = sales.reduce((sum, s) => sum + s.paid_amount, 0);
      const totalRemaining = sales.reduce((sum, s) => sum + s.remaining_amount, 0);
      const currency = App.currency || "USD";

      container.innerHTML = `
        <div class="ledger-stats-grid" style="grid-template-columns:repeat(3,1fr);">
          <div class="ledger-stat-card"><div class="stat-value">${sales.length}</div><div class="stat-label">Transactions</div></div>
          <div class="ledger-stat-card stat-success"><div class="stat-value">${Formatters.formatCurrency(totalAmount, currency)}</div><div class="stat-label">Total Amount</div></div>
          <div class="ledger-stat-card stat-danger"><div class="stat-value">${Formatters.formatCurrency(totalRemaining, currency)}</div><div class="stat-label">Outstanding</div></div>
        </div>
        <div class="report-card">
          <table class="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Items</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${sales.map(s => `
                <tr>
                  <td>${Formatters.formatDate(s.issue_date)}</td>
                  <td>${this.escapeHtml(s.reference_no)}</td>
                  <td>${this.escapeHtml(s.customer_name) || 'N/A'}</td>
                  <td>${this.escapeHtml(s.transaction_type)}</td>
                  <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${this.escapeHtml(s.items_summary || '')}">${this.escapeHtml(s.items_summary) || '-'}</td>
                  <td>${Formatters.formatCurrency(s.total_amount, currency)}</td>
                  <td>${Formatters.formatCurrency(s.paid_amount, currency)}</td>
                  <td style="font-weight:600;color:${s.remaining_amount > 0 ? 'var(--danger)' : 'var(--success)'};">${Formatters.formatCurrency(s.remaining_amount, currency)}</td>
                  <td><span class="badge ${s.payment_status === 'Paid' ? 'badge-paid' : s.payment_status === 'Partial' ? 'badge-partial' : 'badge-outstanding'}">${s.payment_status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="no-print" style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-secondary" onclick="window.print()">Print Report</button>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<p style="color:var(--danger);">${err.message}</p>`;
    }
  },

  async renderOutstanding(container) {
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const result = await window.api.getOutstandingReport();
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${result.error}</p></div>`;
        return;
      }

      const data = result.data || [];
      if (data.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <h3>No Outstanding Dues</h3>
            <p>All customers have cleared their balances.</p>
          </div>
        `;
        return;
      }

      const totalOutstanding = data.reduce((sum, c) => sum + c.total_outstanding, 0);
      const currency = App.currency || "USD";

      container.innerHTML = `
        <div class="report-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="margin:0;">Outstanding Dues Report</h3>
            <div style="font-size:18px;font-weight:700;color:var(--danger);">Total Due: ${Formatters.formatCurrency(totalOutstanding, currency)}</div>
          </div>
          <table class="report-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Ledgers</th>
                <th>Total Sales</th>
                <th>Total Paid</th>
                <th>Outstanding</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.map(c => `
                <tr>
                  <td><strong>${this.escapeHtml(c.customer_name)}</strong></td>
                  <td>${this.escapeHtml(c.phone) || '-'}</td>
                  <td>${c.ledger_count}</td>
                  <td>${Formatters.formatCurrency(c.total_sales, currency)}</td>
                  <td>${Formatters.formatCurrency(c.total_paid, currency)}</td>
                  <td style="font-weight:700;color:var(--danger);">${Formatters.formatCurrency(c.total_outstanding, currency)}</td>
                  <td>
                    <button class="btn btn-sm btn-primary" onclick="App.navigate('ledgers'); setTimeout(() => document.getElementById('ledger-search').value='${this.escapeHtml(c.customer_name)}' && LedgersPage.onSearch(), 300)">View Ledgers</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="no-print" style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-secondary" onclick="window.print()">Print Report</button>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  },

  async renderCustomerReport(container) {
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const result = await window.api.getAllCustomers({ status: "Active", limit: 1000 });
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${result.error}</p></div>`;
        return;
      }

      const customers = result.data.customers || [];
      if (customers.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No customers found</h3></div>';
        return;
      }

      // Load balances for each customer
      const withBalances = [];
      for (const c of customers) {
        try {
          const bal = await window.api.getCustomerBalance(c.id);
          if (bal.success) {
            withBalances.push({ ...c, ...bal.data });
          }
        } catch(e) {}
      }

      const currency = App.currency || "USD";

      container.innerHTML = `
        <div class="report-card">
          <h3>Customer Statement Report</h3>
          <table class="report-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Total Sales</th>
                <th>Total Paid</th>
                <th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              ${withBalances.map(c => `
                <tr>
                  <td><strong>${this.escapeHtml(c.customer_name)}</strong></td>
                  <td>${this.escapeHtml(c.phone) || '-'}</td>
                  <td>${Formatters.formatCurrency(c.total_sales, currency)}</td>
                  <td>${Formatters.formatCurrency(c.total_paid, currency)}</td>
                  <td style="font-weight:600;color:${c.outstanding_balance > 0 ? 'var(--danger)' : 'var(--success)'};">${Formatters.formatCurrency(c.outstanding_balance, currency)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="no-print" style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-secondary" onclick="window.print()">Print Report</button>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  },

  async renderDamageReport(container) {
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const result = await window.api.getAllDamages({ limit: 1000 });
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${result.error}</p></div>`;
        return;
      }

      const data = result.data;
      const damages = data.damages || [];

      if (damages.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No Damage Records</h3><p>No damages have been recorded yet.</p></div>';
        return;
      }

      const totalQty = damages.reduce((sum, d) => sum + d.quantity, 0);
      const currency = App.currency || 'USD';
      const totalValue = damages.reduce((sum, d) => sum + (d.quantity * (d.purchase_price || 0)), 0);

      container.innerHTML = `
        <div class="ledger-stats-grid" style="grid-template-columns:repeat(3,1fr);">
          <div class="ledger-stat-card stat-danger">
            <div class="stat-value">${damages.length}</div>
            <div class="stat-label">Damage Records</div>
          </div>
          <div class="ledger-stat-card stat-danger">
            <div class="stat-value">${totalQty}</div>
            <div class="stat-label">Total Damaged Quantity</div>
          </div>
          <div class="ledger-stat-card stat-danger">
            <div class="stat-value">${Formatters.formatCurrency(totalValue, currency)}</div>
            <div class="stat-label">Total Value Lost</div>
          </div>
        </div>
        <div class="report-card">
          <table class="report-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Product</th>
                <th>Category</th>
                <th>Qty</th>
                <th>Type</th>
                <th>Date</th>
                <th>Reason</th>
                <th>Value Lost</th>
              </tr>
            </thead>
            <tbody>
              ${damages.map(d => `
                <tr>
                  <td>${this.escapeHtml(d.reference_no)}</td>
                  <td>${this.escapeHtml(d.product_name)}</td>
                  <td>${this.escapeHtml(d.category) || '-'}</td>
                  <td>${d.quantity}</td>
                  <td><span class="badge badge-damaged">${this.escapeHtml(d.damage_type)}</span></td>
                  <td>${Formatters.formatDate(d.recorded_date)}</td>
                  <td style="max-width:150px;">${this.escapeHtml(d.reason) || '-'}</td>
                  <td style="font-weight:600;color:var(--danger);">${Formatters.formatCurrency(d.quantity * (d.purchase_price || 0), currency)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="no-print" style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-secondary" onclick="window.print()">Print Report</button>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  },

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};