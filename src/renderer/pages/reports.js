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
        <button class="tab-item" data-tab="ageing" onclick="ReportsPage.switchTab('ageing')">Overdue Ageing</button>
        <button class="tab-item" data-tab="profit" onclick="ReportsPage.switchTab('profit')">Profit by Product</button>
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
      case "ageing": await this.renderAgeing(container); break;
      case "profit": await this.renderProfit(container); break;
      case "customers": await this.renderCustomerReport(container); break;
      case "damage": await this.renderDamageReport(container); break;
    }
  },

  // Who owes how much, and for how long. Payments clear the oldest charges first.
  // What each product earned between two dates. Needs the super-password, because it works from purchase prices.
  profitRange: null,

  async renderProfit(container) {
    if (!App.costVisible) {
      container.innerHTML = '<div class="card"><div class="card-body"><div class="empty-state"><h3>Profit is hidden</h3><p>Enter the super-password to see what each product earned.</p><button class="btn btn-primary" style="margin-top:12px;" onclick="App.toggleCost()">Unlock</button></div></div></div>';
      return;
    }
    if (!this.profitRange) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      this.profitRange = { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to: now.toLocaleDateString("sv-SE") };
    }
    const res = await window.api.getProductProfit(this.profitRange);
    if (!res.success) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${this.escapeHtml(res.error)}</p></div>`;
      return;
    }
    const { rows, totals } = res.data;
    const money = (v) => Formatters.formatCurrency(v, App.currency || "USD");
    this._profitRows = rows;
    container.innerHTML = `
      <div class="card" style="margin-bottom:16px;"><div class="card-body"><div class="form-row">
        <div class="form-group"><label>From</label><input type="date" class="form-control" id="pp-from" value="${this.profitRange.from}" onchange="ReportsPage.onProfitRange()"></div>
        <div class="form-group"><label>To</label><input type="date" class="form-control" id="pp-to" value="${this.profitRange.to}" onchange="ReportsPage.onProfitRange()"></div>
        <div class="form-group" style="align-self:flex-end;"><button class="btn btn-secondary" onclick="ReportsPage.exportProfit()">Export CSV</button></div>
      </div></div></div>
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:16px;">
        <div class="stat-card"><div class="stat-value" style="font-size:22px;">${money(totals.revenue)}</div><div class="stat-label">Sales (after discounts and returns)</div></div>
        <div class="stat-card"><div class="stat-value" style="font-size:22px;">${money(totals.cogs)}</div><div class="stat-label">Cost of goods</div></div>
        <div class="stat-card"><div class="stat-value" style="font-size:22px;color:${totals.profit >= 0 ? "var(--success)" : "var(--danger)"};">${money(totals.profit)}</div><div class="stat-label">Profit on products</div></div>
      </div>
      ${rows.length ? `<div class="card"><div class="card-body"><div class="table-wrapper"><table>
        <thead><tr><th>Product</th><th>Category</th><th style="text-align:right;">Sold</th><th style="text-align:right;">Sales</th><th style="text-align:right;">Cost</th><th style="text-align:right;">Profit</th><th style="text-align:right;">Margin</th></tr></thead>
        <tbody>${rows.map((x) => `<tr>
          <td><strong>${this.escapeHtml(x.product_name)}</strong></td><td>${this.escapeHtml(x.category)}</td>
          <td style="text-align:right;">${x.qty}</td><td style="text-align:right;">${money(x.revenue)}</td><td style="text-align:right;">${money(x.cogs)}</td>
          <td style="text-align:right;font-weight:600;color:${x.profit >= 0 ? "var(--success)" : "var(--danger)"};">${money(x.profit)}</td><td style="text-align:right;">${x.margin}%</td>
        </tr>`).join("")}</tbody></table></div></div></div>` : '<div class="empty-state"><h3>No sales in this period</h3><p>Change the dates to see more.</p></div>'}`;
  },

  onProfitRange() {
    this.profitRange = { from: document.getElementById("pp-from").value, to: document.getElementById("pp-to").value };
    this.renderProfit(document.getElementById("reports-content"));
  },

  exportProfit() {
    CsvTools.download("profit-by-product-" + CsvTools.stamp() + ".csv", [
      ["Product", "Category", "Sold", "Sales", "Cost", "Profit", "Margin %"],
      ...(this._profitRows || []).map((x) => [x.product_name, x.category, x.qty, x.revenue, x.cogs, x.profit, x.margin]),
    ]);
  },

  async exportAgeing() {
    const r = await window.api.getAgeing();
    if (!r.success) return Toast.error(r.error);
    CsvTools.download("overdue-ageing-" + CsvTools.stamp() + ".csv", [
      ["Customer", "Phone", "0-30 days", "31-60 days", "61-90 days", "Over 90 days", "Total due", "Oldest (days)"],
      ...r.data.rows.map((x) => [x.customer_name, x.phone, x.buckets.current, x.buckets.d31_60, x.buckets.d61_90, x.buckets.d90_plus, x.total, x.oldest_days]),
    ]);
  },

  async renderAgeing(container) {
    const result = await window.api.getAgeing();
    if (!result.success) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${this.escapeHtml(result.error)}</p></div>`;
      return;
    }
    const { rows, totals } = result.data;
    const money = (v) => (v ? Formatters.formatCurrency(v, App.currency || "USD") : "-");
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state"><h3>Nobody owes you anything</h3><p>Every customer account is settled.</p></div>';
      return;
    }
    const kpi = (label, value, tone) => `<div class="stat-card"><div class="stat-value" style="font-size:22px;color:${tone || "inherit"};">${money(value)}</div><div class="stat-label">${label}</div></div>`;
    container.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px;"><button class="btn btn-secondary btn-sm" onclick="ReportsPage.exportAgeing()">Export CSV</button></div>
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:16px;">
        ${kpi("Total due", totals.total, "var(--danger)")}
        ${kpi("0 to 30 days", totals.buckets.current)}
        ${kpi("31 to 60 days", totals.buckets.d31_60, "var(--warning)")}
        ${kpi("61 to 90 days", totals.buckets.d61_90, "var(--warning)")}
        ${kpi("Over 90 days", totals.buckets.d90_plus, "var(--danger)")}
      </div>
      <div class="card"><div class="card-body"><div class="table-wrapper"><table>
        <thead><tr><th>Customer</th><th>Phone</th><th style="text-align:right;">0-30</th><th style="text-align:right;">31-60</th><th style="text-align:right;">61-90</th><th style="text-align:right;">90+</th><th style="text-align:right;">Total due</th><th style="text-align:right;">Oldest</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td><strong>${this.escapeHtml(r.customer_name)}</strong></td>
          <td>${this.escapeHtml(r.phone) || "-"}</td>
          <td style="text-align:right;">${money(r.buckets.current)}</td>
          <td style="text-align:right;">${money(r.buckets.d31_60)}</td>
          <td style="text-align:right;">${money(r.buckets.d61_90)}</td>
          <td style="text-align:right;${r.buckets.d90_plus ? "color:var(--danger);font-weight:600;" : ""}">${money(r.buckets.d90_plus)}</td>
          <td style="text-align:right;"><strong>${money(r.total)}</strong></td>
          <td style="text-align:right;">${r.oldest_days} days</td>
        </tr>`).join("")}</tbody>
      </table></div></div></div>`;
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
        <div class="ledger-stats-grid" style="grid-template-columns:repeat(4,1fr);">
          <div class="ledger-stat-card"><div class="stat-value">${sales.length}</div><div class="stat-label">Transactions</div></div>
          <div class="ledger-stat-card"><div class="stat-value">${Formatters.formatCurrency(sales.reduce((sum, s) => sum + (s.total_discount || 0), 0), currency)}</div><div class="stat-label">Discounts Given</div></div>
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
                <th>Discount</th>
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
                  <td style="color:${s.total_discount > 0 ? 'var(--success)' : 'var(--text-muted)'};">${s.total_discount > 0 ? '&minus; ' + Formatters.formatCurrency(s.total_discount, currency) + ' <small>(' + ReportTheme.pct(s.total_discount, s.gross_amount) + ')</small>' : '-'}</td>
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
      const dateStr = new Date().toLocaleDateString();
      
      const printWindow = window.open('', '_blank', 'width=1100,height=800');
      if (!printWindow) { Toast.error('Please allow pop-ups for printing.'); return; }

      const currency = App.currency || 'USD';
      const currencyFmt = (v) => Formatters.formatCurrency(v, currency, true);

      let title = '';
      let content = '';
      let kpis = '';
      const T = ReportTheme;

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
        const totalDiscount = sales.reduce((sum, s) => sum + (s.total_discount || 0), 0);

        title = 'Sales Report';
        
        content = `
        <table>
          <thead><tr>
            <th>Date</th><th>Reference</th><th>Customer</th><th>Type</th><th>Items</th><th class="num">Discount</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${sales.map(s => `<tr>
              <td>${Formatters.formatDate(s.issue_date)}</td>
              <td>${this.escapeHtml(s.reference_no)}</td>
              <td>${this.escapeHtml(s.customer_name) || 'N/A'}</td>
              <td>${this.escapeHtml(s.transaction_type)}</td>
              <td>${this.escapeHtml(s.items_summary) || '-'}</td>
              <td class="num ${s.total_discount > 0 ? 'pos' : 'muted'}">${s.total_discount > 0 ? '&minus; ' + currencyFmt(s.total_discount) + ' <span class="muted">(' + T.pct(s.total_discount, s.gross_amount) + ')</span>' : '-'}</td>
              <td class="num strong">${currencyFmt(s.total_amount)}</td>
              <td class="num pos">${currencyFmt(s.paid_amount)}</td>
              <td class="num ${s.remaining_amount > 0 ? 'neg' : ''}">${currencyFmt(s.remaining_amount)}</td>
              <td>${T.paymentBadge(s.payment_status)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700;background:transparent;">
              <td colspan="5" style="text-align:right;">Totals:</td>
              <td style="text-align:right;">${currencyFmt(totalDiscount)}</td>
              <td style="text-align:right;">${currencyFmt(totalAmount)}</td>
              <td style="text-align:right;">${currencyFmt(totalPaid)}</td>
              <td style="text-align:right;">${currencyFmt(totalRemaining)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>`;
        kpis = T.kpis([
          { label: 'Transactions', value: sales.length },
          { label: 'Total sales', value: currencyFmt(totalAmount) },
          { label: 'Discounts given', value: currencyFmt(totalDiscount) },
          { label: 'Collected', value: currencyFmt(totalPaid), tone: 'ok' },
          { label: 'Remaining', value: currencyFmt(totalRemaining), tone: totalRemaining > 0 ? 'bad' : 'ok' },
        ]);
      }

      if (type === 'outstanding') {
        const result = await window.api.getOutstandingReport();
        const data = result.success ? (result.data || []) : [];
        if (data.length === 0) { Toast.warning('No outstanding dues.'); printWindow.close(); return; }
        const totalOutstanding = data.reduce((sum, c) => sum + c.total_outstanding, 0);
        title = 'Remaining Dues Report';
        
        content = `
        ${T.dueBox({ label: 'Total remaining dues', amount: currencyFmt(totalOutstanding), note: data.length + ' customers still owe money' })}
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
              <td class="num neg">${currencyFmt(c.total_outstanding)}</td>
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
        
        kpis = T.kpis([
          { label: 'Customers', value: withBalances.length },
          { label: 'Total sales', value: currencyFmt(totalSales) },
          { label: 'Collected', value: currencyFmt(totalPaid), tone: 'ok' },
          { label: 'Remaining', value: currencyFmt(totalOut), tone: totalOut > 0 ? 'bad' : 'ok' },
        ]);
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
              <td class="num ${c.outstanding_balance > 0 ? 'neg' : 'pos'}">${currencyFmt(c.outstanding_balance)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700;background:transparent;">
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
        const showCost = App.costVisible;
        title = 'Damage Report';
        kpis = T.kpis([
          { label: 'Records', value: damages.length },
          { label: 'Total quantity', value: totalQty, tone: 'warn' },
          ...(showCost ? [{ label: 'Value lost', value: currencyFmt(totalValue), tone: 'bad' }] : []),
        ]);
        content = `
                <table>
          <thead><tr>
            <th>Ref</th><th>Product</th><th>Category</th><th>Qty</th><th>Type</th><th>Date</th><th>Reason</th>${showCost ? '<th>Value Lost</th>' : ''}
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
              ${showCost ? `<td style="text-align:right;">${currencyFmt(d.quantity * (d.purchase_price || 0))}</td>` : ''}
            </tr>`).join('')}
          </tbody>
        </table>`;
      }

      const body = T.header({ shop: company, title, meta: [['Date', Formatters.formatDate(new Date().toISOString())]] }) + kpis + content + T.footer({ shop: company });
      const html = T.wrap({ title, body, landscape: type === 'sales' });

      printWindow.document.write(I18n.translateHtml(html));
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
            <div class="stat-value">${App.costVisible ? Formatters.formatCurrency(totalValue, currency) : "••••"}</div>
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
                  <td style="font-weight:600;color:var(--danger);">${App.costVisible ? Formatters.formatCurrency(d.quantity * (d.purchase_price || 0), currency) : "••••"}</td>
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