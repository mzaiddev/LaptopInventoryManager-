// Ledgers Page
const LedgersPage = {
  currentFilters: {
    search: "",
    status: "",
    ledger_type: "",
    customer_id: "",
    date_from: "",
    date_to: "",
    sortBy: "si.created_at",
    sortOrder: "desc",
    page: 1,
    limit: 50,
  },

  async load() {
    const content = document.getElementById("page-content");
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Sales & Ledgers</h1>
          <p>View all sales with their payment history</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="LedgersPage.openPrintDialog()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print
          </button>
          <button class="btn btn-primary" onclick="App.navigate('sales')">
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
              <input type="text" id="ledger-search" placeholder="Search by customer, sale reference..." oninput="LedgersPage.onSearch()">
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
      const result = await window.api.getAllSales(this.currentFilters);
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${result.error}</p></div>`;
        return;
      }

      const data = result.data;
      if (!data.sales || data.sales.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No transactions found</h3><p>Create a sale or issue to see entries.</p></div>';
        return;
      }

      container.innerHTML = `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th style="width:30px;"></th>
                <th>Sale Ref</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Type</th>
                <th>Items</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Remaining</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.sales.map((l, idx) => `
                <tr style="cursor:pointer;" onclick="LedgersPage.toggleSaleDetails('${l.sale_id}')">
                  <td><span class="ledger-toggle-icon" id="toggle-icon-${l.sale_id}">&#9654;</span></td>
                  <td><strong>${this.escapeHtml(l.sale_reference)}</strong></td>
                  <td>${this.escapeHtml(l.customer_name) || 'N/A'}</td>
                  <td>${Formatters.formatDate(l.transaction_date)}</td>
                  <td>
                    <span class="badge ${l.ledger_type === 'Cash' ? 'badge-cash' : 'badge-loan'}">${l.ledger_type}</span>
                    <span style="font-size:11px;color:var(--text-muted);margin-left:4px;">${this.escapeHtml(l.transaction_type)}</span>
                  </td>
                  <td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${this.escapeHtml(l.items_summary || '')}">${this.escapeHtml(l.items_summary) || '-'}</td>
                  <td>${Formatters.formatCurrency(l.total_amount, App.currency)}</td>
                  <td>${Formatters.formatCurrency(l.paid_amount, App.currency)}</td>
                  <td style="font-weight:600;color:${l.remaining_amount > 0 ? 'var(--danger)' : 'var(--success)'};">${Formatters.formatCurrency(l.remaining_amount, App.currency)}</td>
                  <td><span class="badge ${l.status === 'Paid' ? 'badge-paid' : l.status === 'Partial' ? 'badge-partial' : 'badge-outstanding'}">${l.status}</span></td>
                  <td onclick="event.stopPropagation();">
                    <div class="action-buttons">
                      <button class="btn btn-sm btn-primary" onclick="LedgersPage.viewSale(${l.sale_id})" title="View Full Details">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      ${l.remaining_amount > 0 ? `
                        <button class="btn btn-sm btn-success" onclick="LedgersPage.showAddPayment(${l.sale_id})" title="Add Payment">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="20 6 9 17 4 12"/></svg>
                        </button>
                      ` : ''}
                      <button class="btn btn-sm btn-secondary" onclick="LedgersPage.printInvoice(${l.sale_id})" title="Print Invoice">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      </button>
                      <button class="btn btn-sm btn-warning" onclick="LedgersPage.editSale(${l.sale_id})" title="Edit Sale">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 0-3 0L12 9l4 11 4.5-4.5z"/></svg>
                      </button>
                      <button class="btn btn-sm btn-danger" onclick="LedgersPage.deleteSaleConfirm(${l.sale_id})" title="Delete Sale">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="3 6 5 6 21 0"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
                <tr id="sale-details-row-${l.sale_id}" style="display:none;">
                  <td colspan="11" style="padding:0;">
                    <div style="padding:12px 16px;background:var(--bg-secondary);border-top:1px solid var(--border-color);">
                      <div style="margin-bottom:10px;">
                        <strong style="font-size:13px;color:#475569;">Products in this Sale:</strong>
                        <div style="font-size:12px;color:#64748b;margin-top:4px;">${this.escapeHtml(l.items_summary) || 'N/A'}</div>
                      </div>
                      <div>
                        <strong style="font-size:13px;color:#475569;">Payment History:</strong>
                        ${l.payments && l.payments.length > 0 ? `
                          <table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:12px;">
                            <thead>
                              <tr style="background:#f1f5f9;">
                                <th style="padding:4px 8px;border:1px solid #e2e8f0;text-align:left;color:#64748b;font-size:10px;text-transform:uppercase;">Date</th>
                                <th style="padding:4px 8px;border:1px solid #e2e8f0;text-align:left;color:#64748b;font-size:10px;text-transform:uppercase;">Method</th>
                                <th style="padding:4px 8px;border:1px solid #e2e8f0;text-align:right;color:#64748b;font-size:10px;text-transform:uppercase;">Paid</th>
                                <th style="padding:4px 8px;border:1px solid #e2e8f0;text-align:right;color:#64748b;font-size:10px;text-transform:uppercase;">Remaining</th>
                                <th style="padding:4px 8px;border:1px solid #e2e8f0;text-align:left;color:#64748b;font-size:10px;text-transform:uppercase;">Note</th>
                                <th style="padding:4px 8px;border:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:10px;text-transform:uppercase;">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${l.payments.map(p => `
                                <tr>
                                  <td style="padding:4px 8px;border:1px solid #e2e8f0;">${Formatters.formatDate(p.payment_date)}</td>
                                  <td style="padding:4px 8px;border:1px solid #e2e8f0;">${this.escapeHtml(p.payment_method)}</td>
                                  <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:right;font-weight:600;color:#22c55e;">${Formatters.formatCurrency(p.amount, App.currency)}</td>
                                  <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:right;color:${p.remaining_after > 0 ? '#ef4444' : '#22c55e'};font-weight:600;">${Formatters.formatCurrency(p.remaining_after, App.currency)}</td>
                                  <td style="padding:4px 8px;border:1px solid #e2e8f0;">${this.escapeHtml(p.note) || '-'}</td>
                                  <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:center;">
                                    <button class="btn btn-sm btn-warning" onclick="LedgersPage.editPayment(${p.id}, ${l.sale_id})" title="Edit Payment" style="padding:2px 6px;font-size:10px;">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 0-3 0L12 9l4 11 4.5-4.5z"/></svg>
                                    </button>
                                    <button class="btn btn-sm btn-danger" onclick="LedgersPage.deletePaymentConfirm(${p.id}, ${l.sale_id})" title="Delete Payment" style="padding:2px 6px;font-size:10px;margin-left:4px;">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px;"><polyline points="3 6 5 6 21 0"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                    </button>
                                  </td>
                                </tr>
                              `).join('')}
                            </tbody>
                          </table>
                        ` : '<div style="font-size:12px;color:#94a3b8;padding:6px 0;">No payments recorded.</div>'}
                      </div>
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

  toggleSaleDetails(saleId) {
    const row = document.getElementById(`sale-details-row-${saleId}`);
    const icon = document.getElementById(`toggle-icon-${saleId}`);
    if (row) {
      const isVisible = row.style.display !== 'none';
      row.style.display = isVisible ? 'none' : 'table-row';
      if (icon) {
        icon.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(90deg)';
        icon.style.display = 'inline-block';
        icon.style.transition = 'transform 0.2s ease';
      }
    }
  },

  async viewSale(id) {
    try {
      const result = await window.api.getSaleById(id);
      if (!result.success || !result.data) {
        Toast.error("Failed to load sale details.");
        return;
      }

      const l = result.data;
      const currency = App.currency || "USD";

      const itemsHtml = l.items && l.items.length > 0 ? `
        <div style="margin-top:16px;">
          <h4 style="margin-bottom:8px;font-size:14px;">Products in Sale</h4>
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
          <h4 style="margin-bottom:8px;font-size:14px;">Payment History</h4>
          <table class="report-table">
            <thead>
              <tr><th>Date</th><th>Method</th><th style="text-align:right;">Amount</th><th>Note</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${l.payments.map(p => `
                <tr>
                  <td>${Formatters.formatDate(p.payment_date)}</td>
                  <td>${this.escapeHtml(p.payment_method)}</td>
                  <td style="text-align:right;font-weight:600;color:var(--success);">${Formatters.formatCurrency(p.amount, currency)}</td>
                  <td>${this.escapeHtml(p.note) || '-'}</td>
                  <td>
                    <button class="btn btn-sm btn-warning" onclick="LedgersPage.editPayment(${p.id}, ${l.id})" title="Edit Payment" style="padding:2px 6px;font-size:10px;">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 0-3 0L12 9l4 11 4.5-4.5z"/></svg>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="LedgersPage.deletePaymentConfirm(${p.id}, ${l.id})" title="Delete Payment" style="padding:2px 6px;font-size:10px;margin-left:4px;">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px;"><polyline points="3 6 5 6 21 0"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div style="margin-top:16px;"><p style="color:var(--text-muted);">No payments recorded yet.</p></div>';

      const returnsHtml = l.returns && l.returns.length > 0 ? `
        <div style="margin-top:16px;">
          <h4 style="margin-bottom:8px;font-size:14px;">Returns</h4>
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
            <div class="detail-label">Sale Reference</div>
            <div class="detail-value">${this.escapeHtml(l.reference_no)}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Customer</div>
            <div class="detail-value">${this.escapeHtml(l.customer_name)}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Date</div>
            <div class="detail-value">${Formatters.formatDate(l.issue_date || l.transaction_date)}</div>
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
            <div class="detail-value"><span class="badge ${l.payment_status === 'Paid' ? 'badge-paid' : l.payment_status === 'Partial' ? 'badge-partial' : 'badge-outstanding'}">${l.payment_status}</span></div>
          </div>
        </div>
        ${itemsHtml}
        ${paymentsHtml}
        ${returnsHtml}
      `;

      const footer = `
        <button class="btn btn-secondary" onclick="window.Modal.close()">Close</button>
        ${l.remaining_amount > 0 ? `<button class="btn btn-success" onclick="window.Modal.close(); LedgersPage.showAddPayment(${l.id})">Add Payment</button>` : ''}
        <button class="btn btn-warning" onclick="window.Modal.close(); LedgersPage.editSale(${l.id})">Edit Sale</button>
        <button class="btn btn-danger" onclick="window.Modal.close(); LedgersPage.deleteSaleConfirm(${l.id})">Delete Sale</button>
        <button class="btn btn-primary" onclick="window.Modal.close(); LedgersPage.printInvoice(${l.id})">Print Invoice</button>
      `;

      Modal.show({ title: `Sale - ${l.reference_no}`, body, footer, size: "lg" });
    } catch (err) {
      Toast.error(err.message);
    }
  },

  showAddPayment(saleId) {
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
          sale_issue_id: saleId,
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

  // ==================== DELETE SALE ====================
  async deleteSaleConfirm(saleId) {
    const confirmed = confirm("Are you sure you want to delete this sale? This will restore all products to inventory and remove all payment records. This action cannot be undone.");
    if (!confirmed) return;
    
    try {
      const result = await window.api.deleteSale(saleId);
      if (result.success) {
        Toast.success("Sale deleted successfully.");
        this.loadLedgers();
      } else {
        Toast.error(result.error || "Failed to delete sale.");
      }
    } catch (err) {
      Toast.error(err.message);
    }
  },

  // ==================== EDIT SALE ====================
  async editSale(saleId) {
    try {
      const result = await window.api.getSaleById(saleId);
      if (!result.success || !result.data) {
        Toast.error("Failed to load sale details.");
        return;
      }
      
      const l = result.data;
      const customersResult = await window.api.getAllCustomers({});
      const customers = customersResult.success ? customersResult.data.customers || [] : [];
      
      const formHtml = `
        <form id="edit-sale-form" onsubmit="return false;">
          <div class="form-group">
            <label>Customer</label>
            <select class="form-control" id="edit-sale-customer">
              ${customers.map(c => `<option value="${c.id}" ${c.id === l.customer_id ? 'selected' : ''}>${this.escapeHtml(c.customer_name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Date</label>
              <input type="date" class="form-control" id="edit-sale-date" value="${l.issue_date || new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
              <label>Transaction Type</label>
              <select class="form-control" id="edit-sale-type">
                <option value="Sale" ${l.transaction_type === 'Sale' ? 'selected' : ''}>Sale</option>
                <option value="Issue" ${l.transaction_type === 'Issue' ? 'selected' : ''}>Issue</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Notes</label>
            <input type="text" class="form-control" id="edit-sale-notes" value="${this.escapeHtml(l.notes || '')}">
          </div>
        </form>
      `;

      Modal.showForm("Edit Sale", formHtml, async () => {
        try {
          const updateResult = await window.api.updateSale(saleId, {
            customer_id: parseInt(document.getElementById("edit-sale-customer")?.value),
            issue_date: document.getElementById("edit-sale-date")?.value,
            transaction_type: document.getElementById("edit-sale-type")?.value,
            notes: document.getElementById("edit-sale-notes")?.value?.trim() || ""
          });
          
          if (updateResult.success) {
            Toast.success("Sale updated successfully.");
            Modal.close();
            this.loadLedgers();
          } else {
            Toast.error(updateResult.error || "Failed to update sale.");
          }
        } catch (err) {
          Toast.error(err.message);
        }
      }, "sm");
    } catch (err) {
      Toast.error(err.message);
    }
  },

  // ==================== EDIT PAYMENT ====================
  async editPayment(paymentId, saleId) {
    try {
      const result = await window.api.getSaleById(saleId);
      if (!result.success || !result.data) {
        Toast.error("Failed to load sale details.");
        return;
      }
      
      const l = result.data;
      const payment = l.payments?.find(p => p.id === paymentId);
      if (!payment) {
        Toast.error("Payment not found.");
        return;
      }
      
      const formHtml = `
        <form id="edit-payment-form" onsubmit="return false;">
          <div class="form-group">
            <label>Payment Date</label>
            <input type="date" class="form-control" id="edit-pmt-date" value="${payment.payment_date}">
          </div>
          <div class="form-group">
            <label>Amount *</label>
            <input type="number" step="0.01" min="0.01" class="form-control" id="edit-pmt-amount" value="${payment.amount}" required>
          </div>
          <div class="form-group">
            <label>Payment Method</label>
            <select class="form-control" id="edit-pmt-method">
              <option value="Cash" ${payment.payment_method === 'Cash' ? 'selected' : ''}>Cash</option>
              <option value="Bank" ${payment.payment_method === 'Bank' ? 'selected' : ''}>Bank</option>
              <option value="Online" ${payment.payment_method === 'Online' ? 'selected' : ''}>Online</option>
              <option value="Other" ${payment.payment_method === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>Note</label>
            <input type="text" class="form-control" id="edit-pmt-note" value="${this.escapeHtml(payment.note || '')}">
          </div>
        </form>
      `;

      Modal.showForm("Edit Payment", formHtml, async () => {
        const amount = parseFloat(document.getElementById("edit-pmt-amount")?.value);
        if (!amount || amount <= 0) {
          Toast.error("Please enter a valid amount.");
          return;
        }
        
        try {
          const updateResult = await window.api.updatePayment(paymentId, {
            payment_date: document.getElementById("edit-pmt-date")?.value,
            amount: amount,
            payment_method: document.getElementById("edit-pmt-method")?.value,
            note: document.getElementById("edit-pmt-note")?.value?.trim() || ""
          });
          
          if (updateResult.success) {
            Toast.success("Payment updated successfully.");
            Modal.close();
            this.loadLedgers();
          } else {
            Toast.error(updateResult.error || "Failed to update payment.");
          }
        } catch (err) {
          Toast.error(err.message);
        }
      }, "sm");
    } catch (err) {
      Toast.error(err.message);
    }
  },

  // ==================== DELETE PAYMENT ====================
  async deletePaymentConfirm(paymentId, saleId) {
    const confirmed = confirm("Are you sure you want to delete this payment? This will recalculate the sale balance. This action cannot be undone.");
    if (!confirmed) return;
    
    try {
      const result = await window.api.deletePayment(paymentId);
      if (result.success) {
        Toast.success("Payment deleted successfully.");
        this.loadLedgers();
      } else {
        Toast.error(result.error || "Failed to delete payment.");
      }
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async openPrintDialog() {
    try {
      // Load all sales for printing with a large limit
      const result = await window.api.getAllSales({ limit: 5000 });
      if (!result.success) {
        Toast.error('Failed to load sales data.');
        return;
      }
      const sales = result.data?.sales || [];
      if (sales.length === 0) {
        Toast.warning('No sales to print.');
        return;
      }

      const currency = App.currency || 'PKR';
      const totalAmount = sales.reduce((s, l) => s + (l.total_amount || 0), 0);
      const totalPaid = sales.reduce((s, l) => s + (l.paid_amount || 0), 0);
      const totalRemaining = sales.reduce((s, l) => s + (l.remaining_amount || 0), 0);
      const paidCount = sales.filter(l => l.status === 'Paid').length;
      const outstandingCount = sales.filter(l => l.status === 'Outstanding').length;
      const partialCount = sales.filter(l => l.status === 'Partial').length;

      // Build a combined data array with payment info included
      const printData = sales.map(sale => {
        // Build payment summary string
        let paymentSummary = '';
        if (sale.payments && sale.payments.length > 0) {
          paymentSummary = sale.payments.map(p => 
            `${Formatters.formatDate(p.payment_date)}: ${Formatters.formatCurrency(p.amount, currency)} (${p.payment_method})`
          ).join('; ');
        } else {
          paymentSummary = 'No payments';
        }
        
        return {
          ...sale,
          category: sale.ledger_type, // Map ledger_type to category for filter
          payment_summary: paymentSummary,
          payment_count: (sale.payments || []).length,
          display_status: sale.status,
          display_type: `${sale.ledger_type} (${sale.transaction_type})`,
        };
      });

      PrintService.showPrintDialog({
        title: 'Sales & Ledgers Report',
        data: printData,
        columns: [
          { field: 'sale_reference', label: 'Sale Ref', width: '100px' },
          { field: 'customer_name', label: 'Customer', width: '120px' },
          { field: 'transaction_date', label: 'Date', width: '70px', format: 'date' },
          { field: 'display_type', label: 'Type', width: '80px' },
          { field: 'total_amount', label: 'Total', width: '70px', align: 'right', format: 'currency' },
          { field: 'paid_amount', label: 'Paid', width: '70px', align: 'right', format: 'currency' },
          { field: 'remaining_amount', label: 'Remaining', width: '70px', align: 'right', format: 'currency' },
          { field: 'display_status', label: 'Status', width: '60px' },
          { field: 'payment_count', label: 'Payments', width: '50px', align: 'center' },
          { field: 'items_summary', label: 'Items', width: '120px' },
        ],
        filters: {
          categories: ['Cash', 'Loan'],
          categoryLabel: 'Ledger Type'
        },
        landscape: false,
        showPrintOptions: true,
        subtitle: 'With full payment history',
        summaryItems: [
          { label: 'Total Sales', value: sales.length },
          { label: 'Paid', value: paidCount },
          { label: 'Partial', value: partialCount },
          { label: 'Outstanding', value: outstandingCount },
          { label: 'Total Amount', value: Formatters.formatCurrency(totalAmount, currency) },
          { label: 'Total Paid', value: Formatters.formatCurrency(totalPaid, currency) },
          { label: 'Total Due', value: Formatters.formatCurrency(totalRemaining, currency) },
        ],
        getCompanyHeader: () => this.getCompanyHeader()
      });
    } catch (err) {
      Toast.error('Print error: ' + err.message);
    }
  },

  async printInvoice(saleId) {
    try {
      // Load company info
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
        <html>
        <head>
          <title>Invoice - ${l.reference_no}</title>
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
            .invoice-totals .total-line { padding: 4px 0; }
            .invoice-totals .grand-total { font-size: 18px; font-weight: 700; border-top: 2px solid #333; padding-top: 8px; margin-top: 4px; }
            .invoice-footer { text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="shop-header">
            <h1>${this.escapeHtml(shopName)}</h1>
            ${shopAddress ? `<p>${this.escapeHtml(shopAddress)}</p>` : ''}
            ${shopPhone ? `<p>Phone: ${this.escapeHtml(shopPhone)}</p>` : ''}
          </div>
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
              <strong>Date:</strong> ${Formatters.formatDate(l.issue_date || l.transaction_date)}<br>
              <strong>Type:</strong> ${l.ledger_type}<br>
              <strong>Status:</strong> ${l.payment_status}
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
            window.onload = function() { setTimeout(function() { window.print(); }, 300); }
          <\/script>
        </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async getCompanyHeader() {
    try {
      const result = await window.api.getSettings();
      if (result.success) {
        return {
          shopName: result.data.shop_name || 'Laptop Inventory Manager',
          address: result.data.shop_address || '',
          phone: result.data.phone_number || '',
          email: result.data.email || ''
        };
      }
    } catch(e) {}
    return { shopName: 'Laptop Inventory Manager', address: '', phone: '', email: '' };
  },

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};