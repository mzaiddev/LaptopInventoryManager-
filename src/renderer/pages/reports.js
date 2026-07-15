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
        <button class="tab-item" data-tab="outstanding" onclick="ReportsPage.switchTab('outstanding')">Remaining Dues</button>
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
      const result = await window.api.getSalesSummary();
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
            <div class="stat-label">Remaining</div>
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
          <h3>Invoice Status Breakdown</h3>
          ${s.sale_counts && s.sale_counts.length > 0 ? `
            <table class="report-table">
              <thead><tr><th>Status</th><th>Count</th></tr></thead>
              <tbody>
                ${s.sale_counts.map(sc => `
                  <tr>
                    <td><span class="badge ${sc.payment_status === 'Paid' ? 'badge-paid' : sc.payment_status === 'Partial' ? 'badge-partial' : 'badge-outstanding'}">${sc.payment_status}</span></td>
                    <td>${sc.cnt}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<p style="color:var(--text-muted);">No invoice data yet.</p>'}
        </div>
        <div style="display:flex;gap:12px;margin-top:16px;">
          <button class="btn btn-primary" onclick="App.navigate('sales')">New Sale / Issue</button>
          <button class="btn btn-secondary" onclick="ReportsPage.switchTab('outstanding')">View Remaining Dues</button>
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
            <option value="Outstanding">Remaining</option>
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
          <div class="ledger-stat-card stat-danger"><div class="stat-value">${Formatters.formatCurrency(totalRemaining, currency)}</div><div class="stat-label">Remaining</div></div>
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
          <button class="btn btn-secondary" onclick="ReportsPage.printCurrentReport('sales')">🖨️ Print Report</button>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<p style="color:var(--danger);">${err.message}</p>`;
    }
  },

  async printCurrentReport(type) {
    try {
      // Get company info from settings
      const settingsResult = await window.api.getSettings();
      const company = settingsResult.success ? settingsResult.data : {};
      const shopName = company.shop_name || 'Laptop Inventory Manager';
      const shopAddress = company.shop_address || '';
      const shopPhone = company.phone_number || '';
      const dateStr = new Date().toLocaleDateString();
      
      const printWindow = window.open('', '_blank', 'width=1100,height=800');
      if (!printWindow) { Toast.error('Please allow pop-ups for printing.'); return; }

      const currency = App.currency || 'USD';
      const currencyFmt = (v) => Formatters.formatCurrency(v, currency);

      let title = '';
      let content = '';

      if (type === 'sales') {
        const filters = {
          date_from: document.getElementById("rpt-sales-from")?.value || "",
          date_to: document.getElementById("rpt-sales-to")?.value || "",
          payment_status: document.getElementById("rpt-sales-status")?.value || "",
        };
        const result = await window.api.getSalesReport(filters);
        const sales = result.success ? (result.data || []) : [];
        
        if (sales.length === 0) { Toast.warning('No data to print.'); printWindow.close(); return; }
        
        const totalAmount = sales.reduce((sum, s) => sum + s.total_amount, 0);
        const totalPaid = sales.reduce((sum, s) => sum + s.paid_amount, 0);
        const totalRemaining = sales.reduce((sum, s) => sum + s.remaining_amount, 0);
        
        title = 'Sales Report';
        
        content = `
        <table>
          <thead><tr>
            <th>Date</th><th>Reference</th><th>Customer</th><th>Type</th><th>Items</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${sales.map(s => `<tr>
              <td>${Formatters.formatDate(s.issue_date)}</td>
              <td>${this.escapeHtml(s.reference_no)}</td>
              <td>${this.escapeHtml(s.customer_name) || 'N/A'}</td>
              <td>${this.escapeHtml(s.transaction_type)}</td>
              <td>${this.escapeHtml(s.items_summary) || '-'}</td>
              <td style="text-align:right;">${currencyFmt(s.total_amount)}</td>
              <td style="text-align:right;">${currencyFmt(s.paid_amount)}</td>
              <td style="text-align:right;">${currencyFmt(s.remaining_amount)}</td>
              <td>${s.payment_status}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700;background:#f1f5f9;">
              <td colspan="5" style="text-align:right;">Totals:</td>
              <td style="text-align:right;">${currencyFmt(totalAmount)}</td>
              <td style="text-align:right;">${currencyFmt(totalPaid)}</td>
              <td style="text-align:right;">${currencyFmt(totalRemaining)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <div style="margin-top:10px;font-size:11px;color:#64748b;">
          <strong>Summary:</strong> ${sales.length} transactions | Total: ${currencyFmt(totalAmount)} | Collected: ${currencyFmt(totalPaid)} | Remaining: ${currencyFmt(totalRemaining)}
        </div>`;
      }

      if (type === 'outstanding') {
        const result = await window.api.getOutstandingReport();
        const data = result.success ? (result.data || []) : [];
        if (data.length === 0) { Toast.warning('No outstanding dues.'); printWindow.close(); return; }
        const totalOutstanding = data.reduce((sum, c) => sum + c.total_outstanding, 0);
        title = 'Remaining Dues Report';
        
        content = `
        <div style="margin-bottom:10px;font-size:14px;font-weight:700;color:#ef4444;">Total Remaining: ${currencyFmt(totalOutstanding)}</div>
        <table>
          <thead><tr>
            <th>Customer</th><th>Phone</th><th>Invoices</th><th>Total Sales</th><th>Total Paid</th><th>Remaining</th>
          </tr></thead>
          <tbody>
            ${data.map(c => `<tr>
              <td><strong>${this.escapeHtml(c.customer_name)}</strong></td>
              <td>${this.escapeHtml(c.phone) || '-'}</td>
              <td>${c.invoice_count}</td>
              <td style="text-align:right;">${currencyFmt(c.total_sales)}</td>
              <td style="text-align:right;">${currencyFmt(c.total_paid)}</td>
              <td style="text-align:right;font-weight:700;color:#ef4444;">${currencyFmt(c.total_outstanding)}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
      }

      if (type === 'customers') {
        const result = await window.api.getAllCustomers({ status: "Active", limit: 1000 });
        const customers = result.success ? (result.data.customers || []) : [];
        if (customers.length === 0) { Toast.warning('No customers.'); printWindow.close(); return; }
        
        const withBalances = [];
        for (const c of customers) {
          try {
            const bal = await window.api.getCustomerBalance(c.id);
            if (bal.success) withBalances.push({ ...c, ...bal.data });
          } catch(e) {}
        }
        
        title = 'Customer Report';
        const totalSales = withBalances.reduce((s, c) => s + (c.total_sales || 0), 0);
        const totalPaid = withBalances.reduce((s, c) => s + (c.total_paid || 0), 0);
        const totalOut = withBalances.reduce((s, c) => s + (c.outstanding_balance || 0), 0);
        
        content = `
        <table>
          <thead><tr>
            <th>Customer</th><th>Phone</th><th>Total Sales</th><th>Total Paid</th><th>Remaining</th>
          </tr></thead>
          <tbody>
            ${withBalances.map(c => `<tr>
              <td><strong>${this.escapeHtml(c.customer_name)}</strong></td>
              <td>${this.escapeHtml(c.phone) || '-'}</td>
              <td style="text-align:right;">${currencyFmt(c.total_sales)}</td>
              <td style="text-align:right;">${currencyFmt(c.total_paid)}</td>
              <td style="text-align:right;font-weight:700;color:${c.outstanding_balance > 0 ? '#ef4444' : '#22c55e'};">${currencyFmt(c.outstanding_balance)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700;background:#f1f5f9;">
              <td colspan="2" style="text-align:right;">Totals:</td>
              <td style="text-align:right;">${currencyFmt(totalSales)}</td>
              <td style="text-align:right;">${currencyFmt(totalPaid)}</td>
              <td style="text-align:right;">${currencyFmt(totalOut)}</td>
            </tr>
          </tfoot>
        </table>`;
      }

      if (type === 'damage') {
        const result = await window.api.getAllDamages({ limit: 1000 });
        const damages = result.success ? (result.data.damages || []) : [];
        if (damages.length === 0) { Toast.warning('No damage records.'); printWindow.close(); return; }
        const totalQty = damages.reduce((sum, d) => sum + d.quantity, 0);
        const totalValue = damages.reduce((sum, d) => sum + (d.quantity * (d.purchase_price || 0)), 0);
        title = 'Damage Report';
        
        content = `
        <div style="margin-bottom:10px;font-size:11px;color:#64748b;">${damages.length} records | Total Qty: ${totalQty} | Value Lost: ${currencyFmt(totalValue)}</div>
        <table>
          <thead><tr>
            <th>Ref</th><th>Product</th><th>Category</th><th>Qty</th><th>Type</th><th>Date</th><th>Reason</th><th>Value Lost</th>
          </tr></thead>
          <tbody>
            ${damages.map(d => `<tr>
              <td>${this.escapeHtml(d.reference_no)}</td>
              <td>${this.escapeHtml(d.product_name)}</td>
              <td>${this.escapeHtml(d.category) || '-'}</td>
              <td style="text-align:center;">${d.quantity}</td>
              <td>${this.escapeHtml(d.damage_type)}</td>
              <td>${Formatters.formatDate(d.recorded_date)}</td>
              <td>${this.escapeHtml(d.reason) || '-'}</td>
              <td style="text-align:right;">${currencyFmt(d.quantity * (d.purchase_price || 0))}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
      }

      const html = `<!DOCTYPE html>
<html>
<head><title>${title}</title>
<style>
  @page { margin: 12mm; size: A4 portrait; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; padding: 15px; background: #fff; font-size: 11px; }
  .header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
  .header h1 { font-size: 18px; color: #1e293b; margin-bottom: 2px; }
  .header .sub { font-size: 11px; color: #64748b; }
  .header .company-info { font-size: 12px; color: #475569; margin-top: 4px; }
  .footer { margin-top: 16px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #2563eb; color: #fff; padding: 5px 7px; text-align: left; font-weight: 600; white-space: nowrap; font-size: 10px; }
  td { padding: 4px 7px; border-bottom: 1px solid #e2e8f0; color: #334155; }
  tr:nth-child(even) { background: #f8fafc; }
  tfoot td { border-top: 2px solid #2563eb; }
  .print-actions { text-align: center; margin-bottom: 12px; }
  .print-actions button { padding: 8px 20px; margin: 0 6px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
  .btn-print { background: #2563eb; color: #fff; }
  .btn-pdf { background: #16a34a; color: #fff; }
  @media print { .print-actions { display: none; } }
</style>
</head>
<body>
  <div class="print-actions">
    <button class="btn-print" onclick="window.print()">🖨️ Print</button>
    <button class="btn-pdf" onclick="window.print()">📥 Download PDF</button>
  </div>
  <div class="header">
    <h1>${this.escapeHtml(shopName)}</h1>
    ${shopAddress ? `<div class="company-info">${this.escapeHtml(shopAddress)}</div>` : ''}
    ${shopPhone ? `<div class="company-info">Phone: ${this.escapeHtml(shopPhone)}</div>` : ''}
    <div class="sub">${this.escapeHtml(title)} | ${dateStr}</div>
  </div>
  ${content}
  <div class="footer">
    <p>Generated by Laptop Inventory Manager | ${dateStr}</p>
  </div>
</body>
</html>`;

      printWindow.document.write(html);
      printWindow.document.close();
    } catch (err) {
      Toast.error('Print error: ' + err.message);
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
            <h3>No Remaining Dues</h3>
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
            <h3 style="margin:0;">Remaining Dues Report</h3>
            <div style="font-size:18px;font-weight:700;color:var(--danger);">Total Due: ${Formatters.formatCurrency(totalOutstanding, currency)}</div>
          </div>
          <table class="report-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Invoices</th>
                <th>Total Sales</th>
                <th>Total Paid</th>
                <th>Remaining</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.map(c => `
                <tr>
                  <td><strong>${this.escapeHtml(c.customer_name)}</strong></td>
                  <td>${this.escapeHtml(c.phone) || '-'}</td>
                  <td>${c.invoice_count}</td>
                  <td>${Formatters.formatCurrency(c.total_sales, currency)}</td>
                  <td>${Formatters.formatCurrency(c.total_paid, currency)}</td>
                  <td style="font-weight:700;color:var(--danger);">${Formatters.formatCurrency(c.total_outstanding, currency)}</td>
                  <td>
                    <button class="btn btn-sm btn-primary" onclick="App.navigate('ledgers'); setTimeout(() => document.getElementById('ledger-search').value='${this.escapeHtml(c.customer_name)}' && LedgersPage.onSearch(), 300)">View Sales</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="no-print" style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-secondary" onclick="ReportsPage.printCurrentReport('outstanding')">🖨️ Print Report</button>
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
                <th>Remaining</th>
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
          <button class="btn btn-secondary" onclick="ReportsPage.printCurrentReport('customers')">🖨️ Print Report</button>
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
          <button class="btn btn-secondary" onclick="ReportsPage.printCurrentReport('damage')">🖨️ Print Report</button>
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