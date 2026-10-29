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
          ${BulkShare.barHtml('sales', 'SalesHistoryPage.sendSelected()', 'SalesHistoryPage.sendAll()', 'WhatsApp All Invoices')}
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

      BulkShare.register('sales', data.sales.map(l => ({ id: l.sale_id, label: l.sale_reference + ' - ' + (l.customer_name || 'N/A'), phone: l.customer_phone })));
      container.innerHTML = `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                ${BulkShare.headerCheckbox('sales')}
                <th>Reference</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Type</th>
                <th>Items</th>
                <th style="text-align:right;">Discount</th>
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
                  ${BulkShare.rowCheckbox('sales', l.sale_id)}
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
                  <td style="text-align:right;color:${l.total_discount > 0 ? 'var(--success)' : 'var(--text-muted)'};">${l.total_discount > 0 ? '&minus; ' + Formatters.formatCurrency(l.total_discount, App.currency) + '<div style="font-size:11px;">' + ReportTheme.pct(l.total_discount, l.gross_amount) + ' off</div>' : '-'}</td>
                  <td style="text-align:right;font-weight:700;">${Formatters.formatCurrency(l.total_amount, App.currency)}</td>
                  <td style="text-align:right;font-weight:600;color:var(--success);">${Formatters.formatCurrency(l.display_paid, App.currency)}</td>
                  <td style="text-align:right;font-weight:700;${l.display_remaining > 0 ? 'color:var(--danger);' : 'color:var(--success);'}">${Formatters.formatCurrency(l.display_remaining, App.currency)}</td>
                  <td>
                    <span class="badge ${l.display_status === 'Paid' ? 'badge-in-stock' : l.display_status === 'Partial' ? 'badge-reserved' : 'badge-damaged'}">${l.display_status}</span>
                    <span class="ledger-indicator" title="Authoritative balance from customer ledger: ${Formatters.formatCurrency(l.ledger_balance, App.currency)}">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;vertical-align:-1px;"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                      Ledger
                    </span>
                  </td>
                  <td>
                    <div class="action-buttons">
                      <button class="btn btn-sm btn-secondary" onclick="SalesHistoryPage.printInvoice(${l.sale_id})" title="Print Invoice">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      </button>
                      <button class="btn btn-sm btn-success" onclick="SalesHistoryPage.printInvoice(${l.sale_id}, true)" title="Send invoice on WhatsApp">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.1-5.2A8.5 8.5 0 1 1 21 11.5z"/></svg>
                      </button>
                      <button class="btn btn-sm btn-success" onclick="SalesHistoryPage.editSale(${l.sale_id})" title="Edit Sale">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
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

      BulkShare.refreshBar('sales');
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

  async editSale(saleId) {
    try {
      const result = await window.api.getSaleById(saleId);
      if (!result.success || !result.data) {
        Toast.error("Failed to load sale.");
        return;
      }
      const sale = result.data;
      const hasReturns = (sale.returns || []).length > 0;

      // Load customers and products for the form
      let customers = [];
      let products = [];
      try {
        const custRes = await window.api.getAllCustomers({ limit: 5000 });
        if (custRes.success) customers = custRes.data?.customers || [];
        const prodRes = await window.api.getProducts({ limit: 5000 });
        if (prodRes.success) products = prodRes.data?.products || [];
      } catch (err) {
        console.error("Failed to load form data:", err);
      }

      const customerOptions = customers.map(c =>
        `<option value="${c.id}" ${c.id === sale.customer_id ? "selected" : ""}>${this.escapeHtml(c.customer_name)}</option>`
      ).join("");

      const paidGroupStyle = sale.ledger_type === "Loan" ? "" : "display:none;";
      const oldestPayment = (sale.payments || [])[(sale.payments || []).length - 1];
      const paidVia = oldestPayment && oldestPayment.payment_method === "Cash" ? "Cash" : oldestPayment ? "Bank Transfer" : "Cash";

      const itemsSection = hasReturns ? `
        <div class="edit-sale-notice">This sale has returns — products cannot be edited. You can still update customer, date, type, payment, and notes.</div>
        <div class="edit-sale-items-readonly">
          ${(sale.items || []).map(it => `
            <div class="edit-item-row">
              <span style="font-weight:600;">${this.escapeHtml(it.product_name)}</span>
              <span>Qty: ${it.quantity}</span>
              <span>${Formatters.formatCurrency(it.subtotal, App.currency)}</span>
            </div>`).join("")}
        </div>
      ` : `
        <div class="product-row-header">
          <span class="prd-col">Product</span>
          <span class="qty-col">Qty</span>
          <span class="price-col">Unit Price</span>
          <span class="disc-col">Discount</span>
          <span class="sub-col">Subtotal</span>
          <span class="act-col"></span>
        </div>
        <div id="es-items-list"></div>
        <button type="button" class="btn btn-sm btn-secondary add-product-btn" onclick="SalesHistoryPage.addEditProductRow()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Product
        </button>
      `;

      const formHtml = `
        <form id="edit-sale-form" class="sale-form" onsubmit="return false;">
          <div class="form-section">
            <h3>1. Customer</h3>
            <div class="form-group">
              <label>Customer *</label>
              <select class="form-control" id="es-customer">
                <option value="">Select Customer</option>
                ${customerOptions}
              </select>
            </div>
          </div>
          <div class="form-section">
            <h3>2. Transaction Details</h3>
            <div class="form-row">
              <div class="form-group">
                <label>Date</label>
                <input type="date" class="form-control" id="es-date" value="${sale.issue_date || ''}">
              </div>
              <div class="form-group">
                <label>Type</label>
                <select class="form-control" id="es-type">
                  <option value="Sale" ${sale.transaction_type === 'Sale' ? 'selected' : ''}>Sale</option>
                  <option value="Issue" ${sale.transaction_type === 'Issue' ? 'selected' : ''}>Issue</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Payment Terms</label>
                <select class="form-control" id="es-ledger-type" onchange="SalesHistoryPage.onEditLedgerTypeChange()">
                  <option value="Cash" ${sale.ledger_type === 'Cash' ? 'selected' : ''}>Full Payment</option>
                  <option value="Loan" ${sale.ledger_type === 'Loan' ? 'selected' : ''}>Loan (Remaining Balance)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Paid Via</label>
                <select class="form-control" id="es-pay-method">
                  <option value="Cash" ${paidVia === 'Cash' ? 'selected' : ''}>Cash</option>
                  <option value="Bank Transfer" ${paidVia === 'Bank Transfer' ? 'selected' : ''}>Bank Transfer</option>
                </select>
              </div>
              <div class="form-group" id="es-paid-amount-group" style="${paidGroupStyle}">
                <label>Initial Payment</label>
                <input type="number" step="0.01" min="0" class="form-control" id="es-paid-amount" value="${sale.paid_amount || 0}">
              </div>
            </div>
          </div>
          <div class="form-section">
            <h3>3. Products</h3>
            ${itemsSection}
          </div>
          <div class="form-section">
            <div class="form-group">
              <label>Notes</label>
              <textarea class="form-control" id="es-notes" rows="2">${this.escapeHtml(sale.notes || '')}</textarea>
            </div>
          </div>
          <div class="sale-summary">
            ${hasReturns ? '' : `<div class="summary-row">
              <span>Discount on whole sale</span>
              <span style="display:flex;gap:6px;">
                <select class="form-control" id="es-disc-type" onchange="SalesHistoryPage.updateEditSummary()" style="width:110px;">
                  <option value="none" ${sale.discount_type === 'none' || !sale.discount_type ? 'selected' : ''}>None</option>
                  <option value="amount" ${sale.discount_type === 'amount' ? 'selected' : ''}>Amount</option>
                  <option value="percent" ${sale.discount_type === 'percent' ? 'selected' : ''}>Percent %</option>
                </select>
                <input type="number" min="0" step="0.01" class="form-control" id="es-disc-value" value="${sale.discount_value || 0}" oninput="SalesHistoryPage.updateEditSummary()" style="width:110px;">
              </span>
            </div>`}
            <div class="form-error" id="es-summary-error"></div>
            <div class="summary-row total">
              <span>Total Amount</span>
              <span id="es-total-amount">${Formatters.formatCurrency(sale.total_amount, App.currency)}</span>
            </div>
          </div>
        </form>
      `;

      this.editSaleState = {
        saleId,
        hasReturns,
        products,
        items: (sale.items || []).map(it => ({
          product_id: it.product_id,
          product_name: it.product_name,
          quantity: it.quantity,
          unit_price: it.unit_price,
          discount_amount: it.discount_amount || 0,
          subtotal: it.subtotal
        }))
      };

      Modal.showForm("Edit Sale", formHtml, () => this.saveEditSale(), "lg");

      if (!hasReturns) {
        this.editSaleState.items.forEach((it, i) => this.addEditProductRow(it, i));
        this.updateEditSummary();
      }
    } catch (err) {
      Toast.error(err.message);
    }
  },

  onEditLedgerTypeChange() {
    const type = document.getElementById("es-ledger-type")?.value;
    const group = document.getElementById("es-paid-amount-group");
    if (group) group.style.display = type === "Loan" ? "" : "none";
  },

  addEditProductRow(item = null, forcedIndex = null) {
    const st = this.editSaleState;
    if (!st) return;
    const container = document.getElementById("es-items-list");
    if (!container) return;
    const index = forcedIndex !== null ? forcedIndex : st.items.length;
    const data = item || { product_id: null, product_name: "", quantity: 1, unit_price: 0, discount_amount: 0, subtotal: 0 };
    if (forcedIndex === null) st.items.push(data);

    const options = st.products.map(p => {
      const selected = data.product_id === p.id ? "selected" : "";
      const name = this.escapeHtml(p.product_name);
      return `<option value="${p.id}" data-price="${p.selling_price || 0}" data-name="${name}" ${selected}>${name} (Qty: ${p.quantity})</option>`;
    }).join("");

    const row = document.createElement("div");
    row.className = "product-row";
    row.dataset.index = index;
    row.innerHTML = `
      <div class="product-row-fields">
        <div class="prd-col">
          <select class="form-control" onchange="SalesHistoryPage.onEditProductSelect(${index})" style="font-size:13px;width:100%;">
            <option value="">-- Select Product --</option>
            ${options}
          </select>
        </div>
        <div class="qty-col">
          <input type="number" min="1" value="${data.quantity || 1}" class="form-control" onchange="SalesHistoryPage.updateEditRow(${index})" style="font-size:13px;text-align:center;width:100%;">
        </div>
        <div class="price-col">
          <input type="number" step="0.01" min="0" value="${data.unit_price || 0}" class="form-control" onchange="SalesHistoryPage.updateEditRow(${index})" style="font-size:13px;text-align:right;width:100%;">
        </div>
        <div class="disc-col">
          <input type="number" step="0.01" min="0" value="${data.discount_amount || 0}" class="form-control" onchange="SalesHistoryPage.updateEditRow(${index})" style="font-size:13px;text-align:right;width:100%;">
        </div>
        <div class="sub-col" style="font-size:14px;font-weight:600;text-align:right;padding:8px 4px;">${Formatters.formatCurrency(data.subtotal || 0, App.currency)}</div>
        <div class="act-col">
          <button type="button" class="remove-item-btn" onclick="SalesHistoryPage.removeEditProductRow(${index})" title="Remove">&times;</button>
        </div>
      </div>
    `;
    container.appendChild(row);
    this.updateEditRow(index);
    this.updateEditSummary();
  },

  onEditProductSelect(index) {
    const row = document.querySelector(`.product-row[data-index="${index}"]`);
    if (!row) return;
    const select = row.querySelector("select");
    const option = select.options[select.selectedIndex];
    const st = this.editSaleState;
    if (!st || !st.items[index]) return;
    if (option && option.value) {
      const price = parseFloat(option.dataset.price) || 0;
      st.items[index].product_id = parseInt(option.value);
      st.items[index].product_name = option.dataset.name || "";
      st.items[index].unit_price = price;
      const priceInput = row.querySelectorAll("input")[1];
      if (priceInput) priceInput.value = price;
    } else {
      st.items[index].product_id = null;
      st.items[index].product_name = "";
    }
    this.updateEditRow(index);
    this.updateEditSummary();
  },

  updateEditRow(index) {
    const row = document.querySelector(`.product-row[data-index="${index}"]`);
    if (!row) return;
    const st = this.editSaleState;
    if (!st || !st.items[index]) return;
    const inputs = row.querySelectorAll("input");
    const qty = parseInt(inputs[0].value) || 0;
    const price = parseFloat(inputs[1].value) || 0;
    const discount = parseFloat(inputs[2].value) || 0;
    const subtotal = qty * price - discount;
    st.items[index].quantity = qty;
    st.items[index].unit_price = price;
    st.items[index].discount_amount = discount;
    st.items[index].subtotal = subtotal;
    const subEl = row.querySelector(".sub-col");
    if (subEl) subEl.textContent = Formatters.formatCurrency(subtotal, App.currency);
    this.updateEditSummary();
  },

  removeEditProductRow(index) {
    const row = document.querySelector(`.product-row[data-index="${index}"]`);
    if (row) row.remove();
    const st = this.editSaleState;
    if (st && st.items[index]) st.items[index] = null;
    this.updateEditSummary();
  },

  updateEditSummary() {
    const st = this.editSaleState;
    if (!st) return;
    if (st.hasReturns) return;
    const valid = st.items.filter(i => i && i.product_id && i.quantity > 0);
    const type = document.getElementById("es-disc-type")?.value || "none";
    const value = parseFloat(document.getElementById("es-disc-value")?.value) || 0;
    let total = 0;
    let error = "";
    if (valid.length > 0) {
      try {
        total = computeSaleTotals(valid.map(i => ({ quantity: i.quantity, unit_price: i.unit_price, discount_amount: i.discount_amount || 0 })), type, value).total;
      } catch (err) {
        error = err.message;
        total = valid.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
      }
    }
    const errEl = document.getElementById("es-summary-error");
    if (errEl) errEl.textContent = error;
    const el = document.getElementById("es-total-amount");
    if (el) el.textContent = Formatters.formatCurrency(total, App.currency);
  },

  async saveEditSale() {
    const st = this.editSaleState;
    if (!st) return;
    const customerId = parseInt(document.getElementById("es-customer")?.value);
    if (!customerId) {
      Toast.error("Please select a customer.");
      return;
    }
    const date = document.getElementById("es-date")?.value;
    if (!date) {
      Toast.error("Please select a date.");
      return;
    }
    const ledgerType = document.getElementById("es-ledger-type")?.value || "Cash";
    const paidAmount = ledgerType === "Cash"
      ? undefined
      : (parseFloat(document.getElementById("es-paid-amount")?.value) || 0);

    const data = {
      customer_id: customerId,
      issue_date: date,
      transaction_type: document.getElementById("es-type")?.value || "Sale",
      ledger_type: ledgerType,
      paid_amount: paidAmount,
      payment_method: document.getElementById("es-pay-method")?.value || "Cash",
      notes: document.getElementById("es-notes")?.value?.trim() || ""
    };

    if (!st.hasReturns) {
      const items = st.items.filter(i => i && i.product_id && i.quantity > 0).map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
        discount_amount: i.discount_amount || 0
      }));
      if (items.length === 0) {
        Toast.error("Please add at least one product.");
        return;
      }
      data.items = items;
      data.discount_type = document.getElementById("es-disc-type")?.value || "none";
      data.discount_value = parseFloat(document.getElementById("es-disc-value")?.value) || 0;
    }

    const btn = document.getElementById("modal-save-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }
    try {
      const updateResult = await window.api.updateSale(st.saleId, data);
      if (updateResult.success) {
        Toast.success("Sale updated successfully.");
        Modal.close();
        await this.loadSales();
      } else {
        Toast.error(updateResult.error || "Failed to update sale.");
      }
    } catch (err) {
      Toast.error(err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Save"; }
    }
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

  sendSelected() {
    BulkShare.start({
      title: 'Send invoices on WhatsApp',
      items: BulkShare.selectedItems('sales'),
      prepare: (item) => this.printInvoice(item.id, true, true),
    });
  },

  // Every invoice matching the current filters, not just this page.
  async sendAll() {
    try {
      const result = await window.api.getAllSales({ ...this.currentFilters, page: 1, limit: 5000 });
      if (!result.success) throw new Error(result.error);
      BulkShare.start({
        title: 'Send invoices on WhatsApp',
        items: result.data.sales.map(l => ({ id: l.sale_id, label: l.sale_reference + ' - ' + (l.customer_name || 'N/A'), phone: l.customer_phone })),
        prepare: (item) => this.printInvoice(item.id, true, true),
      });
    } catch (err) {
      Toast.error(err.message);
    }
  },

  // share=true: save the invoice as PDF and open WhatsApp instead of printing.
  async printInvoice(saleId, share = false, payloadOnly = false) {
    try {
      const settingsResult = await window.api.getSettings();
      const company = settingsResult.success ? settingsResult.data : {};
      const shopName = company.shop_name || 'Laptop Inventory Manager';
      const result = await window.api.getSaleById(saleId);
      if (!result.success || !result.data) {
        if (payloadOnly) throw new Error('Failed to load sale.');
        Toast.error("Failed to load sale for printing.");
        return;
      }
      const l = result.data;
      const currency = App.currency || "USD";
      const T = ReportTheme;
      const fx = (v) => Formatters.formatCurrency(v, currency, true);
      const items = l.items || [];
      const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
      const itemDisc = items.reduce((sum, i) => sum + (i.discount_amount || 0), 0);
      const totalDisc = itemDisc + (l.discount_amount || 0);
      const grossTotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
      const totalPct = T.pct(totalDisc, grossTotal);
      const remaining = l.remaining_amount || 0;
      const status = remaining <= 0.005 ? 'paid' : (l.paid_amount > 0 ? 'partial' : 'unpaid');
      const body =
        T.header({ shop: company, title: 'Invoice', meta: [['Invoice no.', l.reference_no], ['Date', Formatters.formatDate(l.issue_date || l.transaction_date)], ['Type', l.ledger_type]] }) +
        '<div class="info">' +
          '<div class="box"><div class="k">Bill to</div><div class="v">' + this.escapeHtml(l.customer_name) + '</div>' +
            '<div class="s">' + (this.escapeHtml(l.phone) || '-') + (l.address ? ' &middot; ' + this.escapeHtml(l.address) : '') + '</div></div>' +
          '<div class="box" style="max-width:190px;"><div class="k">Payment status</div><div class="v" style="margin-top:3px;">' + T.paymentBadge(status) + '</div></div>' +
        '</div>' +
        '<table><thead><tr><th class="ctr" style="width:32px;">#</th><th>Product</th><th class="ctr">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead><tbody>' +
          items.map((i, n) => '<tr><td class="ctr muted">' + (n + 1) + '</td><td>' + this.escapeHtml(i.product_name) + (i.discount_amount > 0 ? '<div class="muted"><span>Discount on this item</span> (' + T.pct(i.discount_amount, i.quantity * i.unit_price) + '): &minus; ' + fx(i.discount_amount) + '</div>' : '') +
            '</td><td class="ctr">' + i.quantity + '</td><td class="num">' + fx(i.unit_price) + '</td><td class="num strong">' + fx(i.subtotal) + '</td></tr>').join('') +
        '</tbody></table>' +
        '<div class="totals">' +
          (l.discount_amount > 0 ? '<div class="row"><span>Subtotal</span><span>' + fx(subtotal) + '</span></div>' +
            '<div class="row"><span><span>Extra discount on bill</span> (' + (l.discount_type === 'percent' ? l.discount_value + '%' : T.pct(l.discount_amount, subtotal)) + ')</span><span class="pos">&minus; ' + fx(l.discount_amount) + '</span></div>' : '') +
          '<div class="row grand"><span>Total</span><span>' + fx(l.total_amount) + '</span></div>' +
          (totalDisc > 0 ? '<div class="row"><span>You saved (total discount)</span><span class="pos">' + fx(totalDisc) + (totalPct ? ' (' + totalPct + ')' : '') + '</span></div>' : '') +
          '<div class="row"><span>Paid</span><span class="pos">' + fx(l.paid_amount) + '</span></div>' +
          '<div class="row ' + (remaining > 0.005 ? 'due' : '') + '"><span>' + (remaining > 0.005 ? 'Balance due' : 'Balance') + '</span><span>' + fx(remaining) + '</span></div>' +
        '</div>' +
        (remaining > 0.005 ? T.dueBox({ label: 'Balance due', amount: fx(remaining), note: 'Please pay this amount. Thank you.' }) + T.paymentBox(company) : '') +
        '<div class="rpt-thanks">Thank you for your business!</div>' +
        T.footer({ shop: company });
      const html = T.wrap({ title: 'Invoice - ' + l.reference_no, body, toolbar: false, autoPrint: !share });
      if (!share) {
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write(I18n.translateHtml(html));
        printWindow.document.close();
        return;
      }
      const t = (s) => I18n.t(s);
      const money = (n) => Formatters._formatCurrency(n, currency, true);
      const message =
        t('Dear ' + l.customer_name + ',') + '\n\n' + t('Invoice ' + l.reference_no + ' (' + Formatters.formatDate(l.issue_date) + ')') + '\n' +
        (totalDisc > 0 ? t('Discount given:') + ' ' + money(totalDisc) + (totalPct ? ' (' + totalPct + ')' : '') + '\n' : '') +
        t('Total:') + ' ' + money(l.total_amount) + '\n' +
        t('Paid:') + ' ' + money(l.paid_amount) + '\n' +
        t('Balance:') + ' ' + money(l.remaining_amount) + '\n\n' +
        (ShopInfo.hasPayment(company) ? t('Payment Details') + ':\n' + ShopInfo.paymentText(company, t) + '\n\n' : '') +
        t('Thank you!') + '\n- ' + shopName;
      const payload = { html: I18n.translateHtml(html), customerName: 'Invoice-' + l.reference_no, phone: l.phone || '', message };
      if (payloadOnly) return payload;
      await WhatsAppLink.shareOne(payload);
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
          { field: 'sale_reference', label: 'Reference', width: '17%' },
          { field: 'customer_name', label: 'Customer', width: '13%' },
          { field: 'transaction_date', label: 'Date', width: '10%', format: 'date' },
          { field: 'display_type', label: 'Type', width: '9%' },
          { field: 'total_discount', label: 'Discount', width: '8%', align: 'right', format: 'currency' },
          { field: 'total_amount', label: 'Total', width: '8%', align: 'right', format: 'currency' },
          { field: 'paid_amount', label: 'Total Paid', width: '9%', align: 'right', format: 'currency' },
          { field: 'remaining_amount', label: 'Remaining', width: '9%', align: 'right', format: 'currency' },
          { field: 'items_summary', label: 'Items', width: '17%' },
        ],
        landscape: false, showPrintOptions: true, subtitle: 'All sales and issue records',
        summaryItems: [
          { label: 'Total Sales', value: sales.length },
          { label: 'Cash Sales', value: cashCount },
          { label: 'Loan Sales', value: loanCount },
          { label: 'Discounts Given', value: Formatters.formatCurrency(sales.reduce((s, l) => s + (l.total_discount || 0), 0), currency) },
          { label: 'Total Amount', value: Formatters.formatCurrency(totalAmount, currency) },
          { label: 'Total Paid', value: Formatters.formatCurrency(sales.reduce((s, l) => s + (l.paid_amount || 0), 0), currency) },
          { label: 'Remaining', value: Formatters.formatCurrency(sales.reduce((s, l) => s + (l.remaining_amount || 0), 0), currency) },
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