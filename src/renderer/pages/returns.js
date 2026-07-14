// Returns Page
const ReturnsPage = {
  currentFilters: {
    search: "",
    status: "",
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
          <h1>Returns</h1>
          <p>Manage product returns and credit adjustments</p>
        </div>
        <button class="btn btn-primary" onclick="ReturnsPage.showNewReturn()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
          New Return
        </button>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="filters-bar">
            <div class="search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" id="return-search" placeholder="Search by customer, sale reference..." oninput="ReturnsPage.onSearch()">
            </div>
            <div class="filter-group">
              <select id="filter-return-status" onchange="ReturnsPage.onFilter()">
                <option value="">All Status</option>
                <option value="Completed">Completed</option>
                <option value="Pending">Pending</option>
                <option value="Cancelled">Cancelled</option>
              </select>
              <input type="date" id="filter-return-date-from" onchange="ReturnsPage.onFilter()" title="From" style="padding:8px;border:1px solid var(--border-color);border-radius:var(--radius);font-size:13px;background:var(--card-bg);color:var(--text-primary);">
              <input type="date" id="filter-return-date-to" onchange="ReturnsPage.onFilter()" title="To" style="padding:8px;border:1px solid var(--border-color);border-radius:var(--radius);font-size:13px;background:var(--card-bg);color:var(--text-primary);">
            </div>
          </div>
          <div id="returns-table-container"><div class="loading"><div class="spinner"></div></div></div>
          <div id="returns-pagination"></div>
        </div>
      </div>
    `;
    await this.refresh();
  },

  async refresh() {
    await this.loadReturns();
  },

  async loadReturns() {
    const container = document.getElementById("returns-table-container");
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const result = await window.api.getAllReturns(this.currentFilters);
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${result.error}</p></div>`;
        return;
      }

      const data = result.data;
      if (!data.returns || data.returns.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No returns found</h3><p>Process a return from a previous sale/issue.</p></div>';
        return;
      }

      container.innerHTML = `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Sale Ref</th>
                <th>Date</th>
                <th>Items</th>
                <th>Total Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.returns.map(r => `
                <tr>
                  <td>${this.escapeHtml(r.customer_name) || 'N/A'}</td>
                  <td>${this.escapeHtml(r.sale_reference) || '-'}</td>
                  <td>${Formatters.formatDate(r.return_date)}</td>
                  <td>${(r.items || []).length} item(s)</td>
                  <td style="font-weight:600;">${Formatters.formatCurrency(r.total_return_amount, App.currency)}</td>
                  <td><span class="badge ${r.status === 'Completed' ? 'badge-paid' : r.status === 'Pending' ? 'badge-partial' : 'badge-lost'}">${r.status}</span></td>
                  <td>
                    <button class="btn btn-sm btn-primary" onclick="ReturnsPage.viewReturn(${r.id})" title="View">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      const paginationContainer = document.getElementById("returns-pagination");
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
        <button ${data.page <= 1 ? 'disabled' : ''} onclick="ReturnsPage.goToPage(${data.page - 1})">Prev</button>
        ${pages.map(p => `<button class="${p === data.page ? 'active' : ''}" onclick="ReturnsPage.goToPage(${p})">${p}</button>`).join('')}
        <button ${data.page >= data.totalPages ? 'disabled' : ''} onclick="ReturnsPage.goToPage(${data.page + 1})">Next</button>
        <span class="pagination-info">${data.total} total</span>
      </div>
    `;
  },

  goToPage(page) {
    this.currentFilters.page = page;
    this.loadReturns();
  },

  onSearch() {
    clearTimeout(this._searchTimeout);
    this._searchTimeout = setTimeout(() => {
      this.currentFilters.search = document.getElementById("return-search")?.value?.trim() || "";
      this.currentFilters.page = 1;
      this.loadReturns();
    }, 300);
  },

  onFilter() {
    this.currentFilters.status = document.getElementById("filter-return-status")?.value || "";
    this.currentFilters.date_from = document.getElementById("filter-return-date-from")?.value || "";
    this.currentFilters.date_to = document.getElementById("filter-return-date-to")?.value || "";
    this.currentFilters.page = 1;
    this.loadReturns();
  },

  async showNewReturn() {
    // Check for customers with sales first
    let customers = [];
    try {
      const res = await window.api.getAllCustomers({ status: "Active" });
      if (res.success) customers = res.data.customers || res.data || [];
    } catch(e) {}

    // Show a nested form: select customer -> select sale -> select items -> return qty
    const customerOptions = Array.isArray(customers)
      ? customers.map(c => `<option value="${c.id}">${this.escapeHtml(c.customer_name)}</option>`).join("")
      : "";

    const formHtml = `
      <form id="return-form" onsubmit="return false;">
        <div class="form-group">
          <label>Customer *</label>
          <select class="form-control" id="ret-customer" onchange="ReturnsPage.loadCustomerSales()">
            <option value="">Select Customer</option>
            ${customerOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Sale / Issue *</label>
          <select class="form-control" id="ret-sale" onchange="ReturnsPage.loadSaleItems()">
            <option value="">Select a customer first</option>
          </select>
        </div>
        <div class="form-group">
          <label>Return Date</label>
          <input type="date" class="form-control" id="ret-date" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Reason</label>
          <input type="text" class="form-control" id="ret-reason" placeholder="Reason for return...">
        </div>
        <div id="ret-items-container" style="margin-top:12px;">
          <p style="color:var(--text-muted);font-size:13px;">Select a sale to load items.</p>
        </div>
      </form>
    `;

    Modal.showForm("New Return", formHtml, async () => {
      const customerId = parseInt(document.getElementById("ret-customer")?.value);
      const saleId = parseInt(document.getElementById("ret-sale")?.value);
      const returnDate = document.getElementById("ret-date")?.value;
      const reason = document.getElementById("ret-reason")?.value?.trim() || "";

      if (!customerId || !saleId || !returnDate) {
        Toast.error("Please select customer, sale, and date.");
        return;
      }

      // Collect items
      const items = [];
      const itemRows = document.querySelectorAll(".return-item-row:not(.header)");
      for (const row of itemRows) {
        const productId = parseInt(row.dataset.productId);
        const qtyInput = row.querySelector(".ret-qty");
        const priceInput = row.querySelector(".ret-price");
        const qty = parseInt(qtyInput?.value) || 0;
        const price = parseFloat(priceInput?.value) || 0;
        if (productId && qty > 0) {
          items.push({ product_id: productId, quantity: qty, unit_price: price });
        }
      }

      if (items.length === 0) {
        Toast.error("Please add at least one item to return.");
        return;
      }

      try {
        const result = await window.api.createReturn({
          customer_id: customerId,
          sale_issue_id: saleId,
          return_date: returnDate,
          reason: reason,
          items: items,
        });
        if (result.success) {
          Toast.success("Return processed successfully.");
          Modal.close();
          this.loadReturns();
        } else {
          Toast.error(result.error || "Failed to process return.");
        }
      } catch (err) {
        Toast.error(err.message);
      }
    }, "lg");
  },

  async loadCustomerSales() {
    const customerId = document.getElementById("ret-customer")?.value;
    const saleSelect = document.getElementById("ret-sale");
    if (!customerId || !saleSelect) return;

    saleSelect.innerHTML = '<option value="">Loading...</option>';

    try {
      const result = await window.api.getSalesReport({ customer_id: parseInt(customerId) });
      if (result.success && result.data) {
        const sales = result.data;
        if (sales.length === 0) {
          saleSelect.innerHTML = '<option value="">No sales found for this customer</option>';
          return;
        }
        saleSelect.innerHTML = '<option value="">Select Sale/Issue</option>' +
          sales.map(s => `<option value="${s.id}">${this.escapeHtml(s.reference_no)} - ${Formatters.formatDate(s.issue_date)} (${Formatters.formatCurrency(s.total_amount, App.currency)})</option>`).join("");
      }
    } catch (err) {
      saleSelect.innerHTML = '<option value="">Error loading sales</option>';
    }
  },

  async loadSaleItems() {
    const saleId = document.getElementById("ret-sale")?.value;
    const container = document.getElementById("ret-items-container");
    if (!saleId || !container) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Select a sale to load items.</p>';
      return;
    }

    container.innerHTML = '<div class="loading"><div class="spinner" style="width:20px;height:20px;"></div></div>';

    try {
      // Find the ledger for this sale - use the sales report
      const salesResult = await window.api.getSalesReport({});
      if (!salesResult.success) {
        container.innerHTML = '<p style="color:var(--danger);">Failed to load sale items.</p>';
        return;
      }

      // Find the specific sale
      const sale = (salesResult.data || []).find(s => s.id === parseInt(saleId));
      if (!sale) {
        container.innerHTML = '<p style="color:var(--danger);">Sale not found.</p>';
        return;
      }

      // Get sale items directly
      const saleResult = await window.api.getSaleById(parseInt(saleId));
      if (!saleResult.success || !saleResult.data || !saleResult.data.items) {
        container.innerHTML = '<p style="color:var(--danger);">Could not load sale items.</p>';
        return;
      }

      const items = saleResult.data.items;
      if (items.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);">No items in this sale.</p>';
        return;
      }

      container.innerHTML = `
        <h4 style="margin-bottom:8px;">Items to Return</h4>
        <div class="return-item-row header">
          <span>Product</span>
          <span>Max Return</span>
          <span>Return Qty</span>
          <span>Price</span>
          <span></span>
        </div>
        ${items.map(item => `
          <div class="return-item-row" data-product-id="${item.product_id}">
            <span style="font-size:14px;">${this.escapeHtml(item.product_name)}</span>
            <span style="font-size:14px;text-align:center;">${item.quantity}</span>
            <input type="number" min="0" max="${item.quantity}" value="0" class="form-control ret-qty" style="font-size:13px;text-align:center;" onchange="ReturnsPage.updateReturnSummary()">
            <input type="number" step="0.01" min="0" value="${item.unit_price}" class="form-control ret-price" style="font-size:13px;text-align:right;">
            <span></span>
          </div>
        `).join('')}
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color);text-align:right;">
          <strong>Total Return Value: </strong><span id="ret-total-value">0</span>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<p style="color:var(--danger);">${err.message}</p>`;
    }
  },

  updateReturnSummary() {
    let total = 0;
    const rows = document.querySelectorAll(".return-item-row:not(.header)");
    for (const row of rows) {
      const qty = parseInt(row.querySelector(".ret-qty")?.value) || 0;
      const price = parseFloat(row.querySelector(".ret-price")?.value) || 0;
      total += qty * price;
    }
    const el = document.getElementById("ret-total-value");
    if (el) el.textContent = Formatters.formatCurrency(total, App.currency);
  },

  viewReturn(id) {
    // Navigate to the ledger that this return is linked to
    window.api.getAllReturns({ search: "", limit: 1000 }).then(result => {
      if (!result.success) return;
      const ret = (result.data.returns || []).find(r => r.id === id);
      if (!ret) return;

      // Show return details then open ledger
      const itemsHtml = (ret.items || []).map(item => `
        <tr>
          <td>${this.escapeHtml(item.product_name)}</td>
          <td>${item.quantity}</td>
          <td>${Formatters.formatCurrency(item.unit_price, App.currency)}</td>
          <td>${Formatters.formatCurrency(item.subtotal, App.currency)}</td>
        </tr>
      `).join("");

      const body = `
        <div class="ledger-details-grid">
          <div class="detail-field">
            <div class="detail-label">Customer</div>
            <div class="detail-value">${this.escapeHtml(ret.customer_name) || 'N/A'}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Sale Reference</div>
            <div class="detail-value">${this.escapeHtml(ret.sale_reference) || 'N/A'}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Return Date</div>
            <div class="detail-value">${Formatters.formatDate(ret.return_date)}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Total Amount</div>
            <div class="detail-value" style="color:var(--warning);font-weight:700;">-${Formatters.formatCurrency(ret.total_return_amount, App.currency)}</div>
          </div>
        </div>
        ${ret.reason ? `<p style="margin-top:8px;"><strong>Reason:</strong> ${this.escapeHtml(ret.reason)}</p>` : ''}
        <div style="margin-top:16px;">
          <h4 style="margin-bottom:8px;">Returned Items</h4>
          <table class="report-table">
            <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
            <tbody>${itemsHtml || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No items</td></tr>'}</tbody>
          </table>
        </div>
      `;

      Modal.show({ title: `Return Details`, body, size: "lg" });
    }).catch(err => Toast.error(err.message));
  },

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};