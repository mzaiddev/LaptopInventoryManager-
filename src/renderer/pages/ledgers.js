// Ledgers Page
const LedgersPage = {
  currentFilters: {
    search: "",
    status: "",
    ledger_type: "",
    customer_id: "",
    date_from: "",
    date_to: "",
    sortBy: "l.created_at",
    sortOrder: "desc",
    page: 1,
    limit: 50,
  },

  async load() {
    const content = document.getElementById("page-content");
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Ledgers</h1>
          <p>View all transactions and track payments</p>
        </div>
        <button class="btn btn-primary" onclick="App.navigate('sales')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Sale / Issue
        </button>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="filters-bar">
            <div class="search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" id="ledger-search" placeholder="Search by customer, reference..." oninput="LedgersPage.onSearch()">
            </div>
            <div class="filter-group">
              <select id="filter-ledger-status" onchange="LedgersPage.onFilter()">
                <option value="">All Status</option>
                <option value="Paid">Paid</option>
                <option value="Partial">Partial</option>
                <option value="Outstanding">Outstanding</option>
              </select>
              <select id="filter-ledger-type" onchange="LedgersPage.onFilter()">
                <option value="">All Types</option>
                <option value="Cash">Cash</option>
                <option value="Loan">Loan</option>
              </select>
              <input type="date" id="filter-date-from" onchange="LedgersPage.onFilter()" title="Date From" style="padding:8px;border:1px solid var(--border-color);border-radius:var(--radius);font-size:13px;background:var(--card-bg);color:var(--text-primary);">
              <input type="date" id="filter-date-to" onchange="LedgersPage.onFilter()" title="Date To" style="padding:8px;border:1px solid var(--border-color);border-radius:var(--radius);font-size:13px;background:var(--card-bg);color:var(--text-primary);">
            </div>
          </div>
          <div id="ledgers-table-container"><div class="loading"><div class="spinner"></div></div></div>
          <div id="ledgers-pagination"></div>
        </div>
      </div>
    `;
    await this.refresh();
  },

  async refresh() {
    await this.loadLedgers();
  },

  async loadLedgers() {
    const container = document.getElementById("ledgers-table-container");
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const result = await window.api.getAllLedgers(this.currentFilters);
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${result.error}</p></div>`;
        return;
      }

      const data = result.data;
      if (!data.ledgers || data.ledgers.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No transactions found</h3><p>Create a sale or issue to see ledger entries.</p></div>';
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
                <th>Total</th>
                <th>Paid</th>
                <th>Remaining</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.ledgers.map(l => `
                <tr>
                  <td><strong>${this.escapeHtml(l.reference_no)}</strong></td>
                  <td>${this.escapeHtml(l.customer_name) || 'N/A'}</td>
                  <td>${Formatters.formatDate(l.transaction_date)}</td>
                  <td><span class="badge ${l.ledger_type === 'Cash' ? 'badge-cash' : 'badge-loan'}">${l.ledger_type}</span></td>
                  <td>${Formatters.formatCurrency(l.total_amount, App.currency)}</td>
                  <td>${Formatters.formatCurrency(l.paid_amount, App.currency)}</td>
                  <td style="font-weight:600;color:${l.remaining_amount > 0 ? 'var(--danger)' : 'var(--success)'};">${Formatters.formatCurrency(l.remaining_amount, App.currency)}</td>
                  <td><span class="badge ${l.status === 'Paid' ? 'badge-paid' : l.status === 'Partial' ? 'badge-partial' : 'badge-outstanding'}">${l.status}</span></td>
                  <td>
                    <div class="action-buttons">
                      <button class="btn btn-sm btn-primary" onclick="LedgersPage.viewLedger(${l.id})" title="View Details">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      ${l.remaining_amount > 0 ? `
                        <button class="btn btn-sm btn-success" onclick="LedgersPage.showAddPayment(${l.id})" title="Add Payment">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="20 6 9 17 4 12"/></svg>
                        </button>
                      ` : ''}
                      <button class="btn btn-sm btn-secondary" onclick="LedgersPage.printInvoice(${l.id})" title="Print Invoice">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      const paginationContainer = document.getElementById("ledgers-pagination");
      if (paginationContainer && data.totalPages > 1) {
        paginationContainer.innerHTML = this.renderPagination(data);
      } else if (paginationContainer) {
        paginationContainer.innerHTML = '';
      }
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  },

  renderPagination(data) {
    const pages = [];
    for (let i = 1; i <= data.totalPages; i++) pages.push(i);
    return `
      <div class="pagination">
        <button ${data.page <= 1 ? 'disabled' : ''} onclick="LedgersPage.goToPage(${data.page - 1})">Prev</button>
        ${pages.map(p => `<button class="${p === data.page ? 'active' : ''}" onclick="LedgersPage.goToPage(${p})">${p}</button>`).join('')}
        <button ${data.page >= data.totalPages ? 'disabled' : ''} onclick="LedgersPage.goToPage(${data.page + 1})">Next</button>
        <span class="pagination-info">${data.total} total</span>
      </div>
    `;
  },

  goToPage(page) {
    this.currentFilters.page = page;
    this.loadLedgers();
  },

  onSearch() {
    clearTimeout(this._searchTimeout);
    this._searchTimeout = setTimeout(() => {
      this.currentFilters.search = document.getElementById("ledger-search")?.value?.trim() || "";
      this.currentFilters.page = 1;
      this.loadLedgers();
    }, 300);
  },

  onFilter() {
    this.currentFilters.status = document.getElementById("filter-ledger-status")?.value || "";
    this.currentFilters.ledger_type = document.getElementById("filter-ledger-type")?.value || "";
    this.currentFilters.date_from = document.getElementById("filter-date-from")?.value || "";
    this.currentFilters.date_to = document.getElementById("filter-date-to")?.value || "";
    this.currentFilters.page = 1;
    this.loadLedgers();
  },

  async viewLedger(id) {
    try {
      const result = await window.api.getLedgerById(id);
      if (!result.success || !result.data) {
        Toast.error("Failed to load ledger details.");
        return;
      }

      const l = result.data;
      const currency = App.currency || "USD";

      const itemsHtml = l.items && l.items.length > 0 ? `
        <div style="margin-top:16px;">
          <h4 style="margin-bottom:8px;">Products</h4>
          <table class="report-table">
            <thead>
              <tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr>
            </thead>
            <tbody>
              ${l.items.map(item => `
                <tr>
                  <td>${this.escapeHtml(item.product_name)}</td>
                  <td>${item.quantity}</td>
                  <td>${Formatters.formatCurrency(item.unit_price, currency)}</td>
                  <td>${Formatters.formatCurrency(item.subtotal, currency)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '';

      const paymentsHtml = l.payments && l.payments.length > 0 ? `
        <div style="margin-top:16px;">
          <h4 style="margin-bottom:8px;">Payment History</h4>
          <div class="payment-history">
            ${l.payments.map(p => `
              <div class="payment-item">
                <div class="payment-info">
                  <div class="payment-date">${Formatters.formatDate(p.payment_date)}</div>
                  <div class="payment-method">${p.payment_method}${p.note ? ' - ' + this.escapeHtml(p.note) : ''}</div>
                </div>
                <div class="payment-amount">${Formatters.formatCurrency(p.amount, currency)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : '';

      const returnsHtml = l.returns && l.returns.length > 0 ? `
        <div style="margin-top:16px;">
          <h4 style="margin-bottom:8px;">Returns</h4>
          ${l.returns.map(r => `
            <div class="payment-item">
              <div class="payment-info">
                <div class="payment-date">${Formatters.formatDate(r.return_date)}</div>
                <div class="payment-method">${this.escapeHtml(r.reason) || 'No reason'}</div>
              </div>
              <div class="payment-amount" style="color:var(--warning);">-${Formatters.formatCurrency(r.total_return_amount, currency)}</div>
            </div>
          `).join('')}
        </div>
      ` : '';

      const body = `
        <div class="ledger-details-grid">
          <div class="detail-field">
            <div class="detail-label">Reference</div>
            <div class="detail-value">${this.escapeHtml(l.reference_no)}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Customer</div>
            <div class="detail-value">${this.escapeHtml(l.customer_name)}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Date</div>
            <div class="detail-value">${Formatters.formatDate(l.transaction_date)}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Type</div>
            <div class="detail-value"><span class="badge ${l.ledger_type === 'Cash' ? 'badge-cash' : 'badge-loan'}">${l.ledger_type}</span></div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Total Amount</div>
            <div class="detail-value">${Formatters.formatCurrency(l.total_amount, currency)}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Paid Amount</div>
            <div class="detail-value" style="color:var(--success);">${Formatters.formatCurrency(l.paid_amount, currency)}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Remaining</div>
            <div class="detail-value" style="color:${l.remaining_amount > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:700;">${Formatters.formatCurrency(l.remaining_amount, currency)}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Status</div>
            <div class="detail-value"><span class="badge ${l.status === 'Paid' ? 'badge-paid' : l.status === 'Partial' ? 'badge-partial' : 'badge-outstanding'}">${l.status}</span></div>
          </div>
        </div>
        ${l.description ? `<p style="margin-top:12px;color:var(--text-secondary);">${this.escapeHtml(l.description)}</p>` : ''}
        ${itemsHtml}
        ${paymentsHtml}
        ${returnsHtml}
      `;

      const footer = `
        <button class="btn btn-secondary" onclick="window.Modal.close()">Close</button>
        ${l.remaining_amount > 0 ? `<button class="btn btn-success" onclick="window.Modal.close(); LedgersPage.showAddPayment(${l.id})">Add Payment</button>` : ''}
        <button class="btn btn-primary" onclick="window.Modal.close(); LedgersPage.printInvoice(${l.id})">Print Invoice</button>
      `;

      Modal.show({ title: `Ledger - ${l.reference_no}`, body, footer, size: "lg" });
    } catch (err) {
      Toast.error(err.message);
    }
  },

  showAddPayment(ledgerId) {
    const formHtml = `
      <form id="payment-form" onsubmit="return false;">
        <div class="form-group">
          <label>Payment Date</label>
          <input type="date" class="form-control" id="pmt-date" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Amount *</label>
          <input type="number" step="0.01" min="0.01" class="form-control" id="pmt-amount" required>
        </div>
        <div class="form-group">
          <label>Payment Method</label>
          <select class="form-control" id="pmt-method">
            <option value="Cash">Cash</option>
            <option value="Bank">Bank</option>
            <option value="Online">Online</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>Note</label>
          <input type="text" class="form-control" id="pmt-note" placeholder="Optional note...">
        </div>
      </form>
    `;

    Modal.showForm("Add Payment", formHtml, async () => {
      const amount = parseFloat(document.getElementById("pmt-amount")?.value);
      if (!amount || amount <= 0) {
        Toast.error("Please enter a valid amount.");
        return;
      }
      try {
        const result = await window.api.addPayment({
          ledger_id: ledgerId,
          payment_date: document.getElementById("pmt-date")?.value || new Date().toISOString().split('T')[0],
          amount: amount,
          payment_method: document.getElementById("pmt-method")?.value || "Cash",
          note: document.getElementById("pmt-note")?.value?.trim() || "",
        });
        if (result.success) {
          Toast.success("Payment added successfully.");
          Modal.close();
          this.loadLedgers();
        } else {
          Toast.error(result.error || "Failed to add payment.");
        }
      } catch (err) {
        Toast.error(err.message);
      }
    }, "sm");
  },

  printInvoice(ledgerId) {
    window.api.getLedgerById(ledgerId).then(result => {
      if (!result.success || !result.data) {
        Toast.error("Failed to load ledger for printing.");
        return;
      }
      const l = result.data;
      const currency = App.currency || "USD";

      const printWindow = window.open('', '_blank', 'width=800,height=600');
      printWindow.document.write(`
        <html>
        <head>
          <title>Invoice - ${l.reference_no}</title>
          <style>
            body { font-family: 'Courier New', monospace; padding: 20px; color: #333; }
            .invoice-header { text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #333; }
            .invoice-header h2 { font-size: 22px; margin-bottom: 4px; }
            .invoice-header p { font-size: 13px; color: #555; margin: 2px 0; }
            .invoice-info { display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px; }
            table th { background: #f5f5f5; padding: 8px 10px; text-align: left; border: 1px solid #ddd; font-size: 12px; text-transform: uppercase; }
            table td { padding: 6px 10px; border: 1px solid #ddd; }
            .invoice-totals { text-align: right; font-size: 14px; margin-top: 10px; }
            .invoice-totals .total-line { padding: 4px 0; }
            .invoice-totals .grand-total { font-size: 18px; font-weight: 700; border-top: 2px solid #333; padding-top: 8px; margin-top: 4px; }
            .invoice-footer { text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="invoice-header">
            <h2>INVOICE</h2>
            <p>${this.escapeHtml(l.reference_no)}</p>
          </div>
          <div class="invoice-info">
            <div>
              <strong>Customer:</strong> ${this.escapeHtml(l.customer_name)}<br>
              <strong>Phone:</strong> ${this.escapeHtml(l.phone) || 'N/A'}<br>
              <strong>Address:</strong> ${this.escapeHtml(l.address) || 'N/A'}
            </div>
            <div style="text-align:right;">
              <strong>Date:</strong> ${Formatters.formatDate(l.transaction_date)}<br>
              <strong>Type:</strong> ${l.ledger_type}<br>
              <strong>Status:</strong> ${l.status}
            </div>
          </div>
          <table>
            <thead>
              <tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr>
            </thead>
            <tbody>
              ${(l.items || []).map(item => `
                <tr>
                  <td>${this.escapeHtml(item.product_name)}</td>
                  <td>${item.quantity}</td>
                  <td>${Formatters.formatCurrency(item.unit_price, currency)}</td>
                  <td>${Formatters.formatCurrency(item.subtotal, currency)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="invoice-totals">
            <div class="total-line">Total: ${Formatters.formatCurrency(l.total_amount, currency)}</div>
            <div class="total-line">Paid: ${Formatters.formatCurrency(l.paid_amount, currency)}</div>
            <div class="grand-total">${l.remaining_amount > 0 ? 'Due: ' + Formatters.formatCurrency(l.remaining_amount, currency) : 'PAID'}</div>
          </div>
          <div class="invoice-footer">
            <p>Thank you for your business!</p>
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          <\/script>
        </body>
        </html>
      `);
      printWindow.document.close();
    }).catch(err => Toast.error(err.message));
  },

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};