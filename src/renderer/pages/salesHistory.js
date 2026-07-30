// Sales History Page - View all sales records (products only, no payments)
// This is PURELY for viewing what was sold to whom
// All payment/balance management is in the Ledger module
const SalesHistoryPage = {
  currentFilters: {
    search: "",
    customer_id: "",
    date_from: "",
    date_to: "",
    page: 1,
    limit: 50,
  },

  async load() {
    const content = document.getElementById("page-content");
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Sales History</h1>
          <p>View all sales and issue records. Payments & balances managed in Ledger.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="SalesHistoryPage.openPrintDialog()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print
          </button>
          <button class="btn btn-primary" onclick="App.navigate('create-sale')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Sale / Issue
          </button>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="filters-bar">
            <div class="search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" id="sale-search" placeholder="Search by customer or reference..." oninput="SalesHistoryPage.onSearch()">
            </div>
            <div class="filter-group">
              <select id="filter-sale-customer" onchange="SalesHistoryPage.onFilter()">
                <option value="">All Customers</option>
              </select>
              <input type="date" id="filter-sale-date-from" onchange="SalesHistoryPage.onFilter()" title="Date From" style="padding:8px;border:1px solid var(--border-color);border-radius:var(--radius);font-size:13px;background:var(--card-bg);color:var(--text-primary);">
              <input type="date" id="filter-sale-date-to" onchange="SalesHistoryPage.onFilter()" title="Date To" style="padding:8px;border:1px solid var(--border-color);border-radius:var(--radius);font-size:13px;background:var(--card-bg);color:var(--text-primary);">
            </div>
          </div>
          <div id="sales-table-container"><div class="loading"><div class="spinner"></div></div></div>
          <div id="sales-pagination"></div>
        </div>
      </div>
    `;

    await this.loadCustomerFilter();
    await this.refresh();
  },

  async refresh() {
    await this.loadSales();
  },

  async loadCustomerFilter() {
    try {
      const result = await window.api.getAllCustomers({ limit: 5000 });
      if (!result.success) return;
      const customers = result.data?.customers || [];
      const select = document.getElementById("filter-sale-customer");
      if (select) {
        select.innerHTML = '<option value="">All Customers</option>' +
          customers.map(c => `<option value="${c.id}">${this.escapeHtml(c.customer_name)}</option>`).join('');
      }
    } catch (err) {
      console.error(err);
    }
  },

  async loadSales() {
    const container = document.getElementById("sales-table-container");
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const result = await window.api.getAllSales(this.currentFilters);
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${result.error}</p></div>`;
        return;
      }

      const data = result.data;
      if (!data.sales || data.sales.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No sales found</h3><p>Create a new sale to see entries here.</p></div>';
        return;
      }

      container.innerHTML = `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Type</th>
                <th>Items</th>
                <th style="text-align:right;">Total</th>
                <th style="text-align:right;">Paid</th>
                <th style="text-align:right;">Remaining</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.sales.map(l => `
                <tr>
                  <td><strong>${this.escapeHtml(l.sale_reference)}</strong></td>
                  <td>
                    <a href="#" onclick="SalesHistoryPage.viewCustomerLedger(${l.customer_id});return false;" style="color:var(--primary);text-decoration:none;">
                      ${this.escapeHtml(l.customer_name) || 'N/A'}
                    </a>
                  </td>
                  <td>${Formatters.formatDate(l.transaction_date)}</td>
                  <td>
                    <span class="badge ${l.ledger_type === 'Cash' ? 'badge-cash' : 'badge-loan'}">${l.ledger_type}</span>
                    <span style="font-size:11px;color:var(--text-muted);margin-left:4px;">${this.escapeHtml(l.transaction_type)}</span>
                  </td>
                  <td style="font-size:12px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${this.escapeHtml(l.items_summary || '')}">
                    ${this.escapeHtml(l.items_summary) || '-'}
                  </td>
                  <td style="text-align:right;font-weight:700;">${Formatters.formatCurrency(l.total_amount, App.currency)}</td>
                  <td style="text-align:right;font-weight:600;color:var(--success);">${Formatters.formatCurrency(l.paid_amount, App.currency)}</td>
                  <td style="text-align:right;font-weight:700;${l.remaining_amount > 0 ? 'color:var(--danger);' : 'color:var(--success);'}">${Formatters.formatCurrency(l.remaining_amount, App.currency)}</td>
                  <td><span class="badge ${l.status === 'Paid' ? 'badge-in-stock' : l.status === 'Partial' ? 'badge-reserved' : 'badge-damaged'}">${l.status}</span></td>
                  <td>
                    <div class="action-buttons">
                      <button class="btn btn-sm btn-secondary" onclick="SalesHistoryPage.printInvoice(${l.sale_id})" title="Print Invoice">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      </button>
                      <button class="btn btn-sm btn-danger" onclick="SalesHistoryPage.deleteSaleConfirm(${l.sale_id})" title="Delete Sale">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="3 6 5 6 21 0"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      const paginationContainer = document.getElementById("sales-pagination");
      if (paginationContainer && data.totalPages > 1) {
        paginationContainer.innerHTML = this.renderPagination(data);
      } else if (paginationContainer) {
        paginationContainer.innerHTML = '';
      }
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  },

  viewCustomerLedger(customerId) {
    LedgersPage.currentCustomerId = customerId;
    App.navigate("ledgers");
  },

  renderPagination(data) {
    const pages = [];
    for (let i = 1; i <= data.totalPages; i++) pages.push(i);
    return `
      <div class="pagination">
        <button ${data.page <= 1 ? 'disabled' : ''} onclick="SalesHistoryPage.goToPage(${data.page - 1})">Prev</button>
        ${pages.map(p => `<button class="${p === data.page ? 'active' : ''}" onclick="SalesHistoryPage.goToPage(${p})">${p}</button>`).join('')}
        <button ${data.page >= data.totalPages ? 'disabled' : ''} onclick="SalesHistoryPage.goToPage(${data.page + 1})">Next</button>
        <span class="pagination-info">${data.total} total</span>
      </div>
    `;
  },

  goToPage(page) {
    this.currentFilters.page = page;
    this.loadSales();
  },

  onSearch() {
    clearTimeout(this._searchTimeout);
    this._searchTimeout = setTimeout(() => {
      this.currentFilters.search = document.getElementById("sale-search")?.value?.trim() || "";
      this.currentFilters.page = 1;
      this.loadSales();
    }, 300);
  },

  onFilter() {
    this.currentFilters.customer_id = document.getElementById("filter-sale-customer")?.value || "";
    this.currentFilters.date_from = document.getElementById("filter-sale-date-from")?.value || "";
    this.currentFilters.date_to = document.getElementById("filter-sale-date-to")?.value || "";
    this.currentFilters.page = 1;
    this.loadSales();
  },

  async deleteSaleConfirm(saleId) {
    const confirmed = confirm("Are you sure you want to delete this sale? Products will be restored to inventory. This action cannot be undone.");
    if (!confirmed) return;
    try {
      const result = await window.api.deleteSale(saleId);
      if (result.success) {
        Toast.success("Sale deleted successfully.");
        this.loadSales();
      } else {
        Toast.error(result.error || "Failed to delete sale.");
      }
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async printInvoice(saleId) {
    try {
      const settingsResult = await window.api.getSettings();
      const company = settingsResult.success ? settingsResult.data : {};
      const shopName = company.shop_name || 'Laptop Inventory Manager';
      const shopAddress = company.shop_address || '';
      const shopPhone = company.phone_number || '';
      const result = await window.api.getSaleById(saleId);
      if (!result.success || !result.data) {
        Toast.error("Failed to load sale for printing.");
        return;
      }
      const l = result.data;
      const currency = App.currency || "USD";
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      printWindow.document.write(`
        <html><head><title>Invoice - ${l.reference_no}</title>
        <style>
          @page { margin: 10mm; }
          body { font-family: 'Courier New', monospace; padding: 20px; color: #333; }
          .shop-header { text-align: center; margin-bottom: 12px; }
          .shop-header h1 { font-size: 20px; margin-bottom: 2px; }
          .shop-header p { font-size: 12px; color: #555; margin: 1px 0; }
          .invoice-header { text-align: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #333; }
          .invoice-header h2 { font-size: 22px; margin-bottom: 4px; }
          .invoice-info { display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px; }
          table th { background: #f5f5f5; padding: 8px 10px; text-align: left; border: 1px solid #ddd; font-size: 12px; text-transform: uppercase; }
          table td { padding: 6px 10px; border: 1px solid #ddd; }
          .invoice-totals { text-align: right; font-size: 14px; margin-top: 10px; }
          .grand-total { font-size: 18px; font-weight: 700; border-top: 2px solid #333; padding-top: 8px; margin-top: 4px; }
          .invoice-footer { text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
          @media print { body { padding: 0; } }
        </style></head>
        <body>
          <div class="shop-header"><h1>${this.escapeHtml(shopName)}</h1>
            ${shopAddress ? `<p>${this.escapeHtml(shopAddress)}</p>` : ''}
            ${shopPhone ? `<p>Phone: ${this.escapeHtml(shopPhone)}</p>` : ''}
          </div>
          <div class="invoice-header"><h2>INVOICE</h2><p>${this.escapeHtml(l.reference_no)}</p></div>
          <div class="invoice-info">
            <div><strong>Customer:</strong> ${this.escapeHtml(l.customer_name)}<br>
              <strong>Phone:</strong> ${this.escapeHtml(l.phone) || 'N/A'}<br>
              <strong>Address:</strong> ${this.escapeHtml(l.address) || 'N/A'}
            </div>
            <div style="text-align:right;"><strong>Date:</strong> ${Formatters.formatDate(l.issue_date || l.transaction_date)}<br><strong>Type:</strong> ${l.ledger_type}</div>
          </div>
          <table><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
            <tbody>${(l.items || []).map(item => `<tr><td>${this.escapeHtml(item.product_name)}</td><td>${item.quantity}</td><td>${Formatters.formatCurrency(item.unit_price, currency)}</td><td>${Formatters.formatCurrency(item.subtotal, currency)}</td></tr>`).join('')}</tbody>
          </table>
          <div class="invoice-totals"><div class="grand-total">Total: ${Formatters.formatCurrency(l.total_amount, currency)}</div></div>
          <div class="invoice-footer"><p>Thank you for your business!</p></div>
          <script>window.onload=function(){setTimeout(function(){window.print()},300)};<\/script>
        </body></html>
      `);
      printWindow.document.close();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async openPrintDialog() {
    try {
      const result = await window.api.getAllSales({ limit: 5000 });
      if (!result.success) { Toast.error('Failed to load sales data.'); return; }
      const sales = result.data?.sales || [];
      if (sales.length === 0) { Toast.warning('No sales to print.'); return; }
      const currency = App.currency || 'PKR';
      const totalAmount = sales.reduce((s, l) => s + (l.total_amount || 0), 0);
      const cashCount = sales.filter(l => l.ledger_type === 'Cash').length;
      const loanCount = sales.filter(l => l.ledger_type === 'Loan').length;
      PrintService.showPrintDialog({
        title: 'Sales History Report',
        data: sales.map(l => ({ ...l, display_type: `${l.ledger_type} (${l.transaction_type})` })),
        columns: [
          { field: 'sale_reference', label: 'Reference', width: '100px' },
          { field: 'customer_name', label: 'Customer', width: '120px' },
          { field: 'transaction_date', label: 'Date', width: '70px', format: 'date' },
          { field: 'display_type', label: 'Type', width: '80px' },
          { field: 'total_amount', label: 'Total', width: '70px', align: 'right', format: 'currency' },
          { field: 'items_summary', label: 'Items', width: '150px' },
        ],
        landscape: true, showPrintOptions: true, subtitle: 'All sales and issue records',
        summaryItems: [
          { label: 'Total Sales', value: sales.length },
          { label: 'Cash Sales', value: cashCount },
          { label: 'Loan Sales', value: loanCount },
          { label: 'Total Amount', value: Formatters.formatCurrency(totalAmount, currency) },
        ],
        getCompanyHeader: () => LedgersPage.getCompanyHeader()
      });
    } catch (err) { Toast.error('Print error: ' + err.message); }
  },

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};