// Customers Page
const CustomersPage = {
  currentFilters: {
    search: "",
    status: "",
    page: 1,
    limit: 50,
  },

  async load() {
    const content = document.getElementById("page-content");
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Customers</h1>
          <p>Manage your customers and track balances</p>
        </div>
        <button class="btn btn-primary" onclick="CustomersPage.showAddCustomer()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Customer
        </button>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="filters-bar">
            <div class="search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" id="customer-search" placeholder="Search by name, phone, address..." oninput="CustomersPage.onSearch()">
            </div>
            <div class="filter-group">
              <select id="filter-customer-status" onchange="CustomersPage.onFilter()">
                <option value="">All Status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div id="customers-table-container"><div class="loading"><div class="spinner"></div></div></div>
          <div id="customers-pagination"></div>
        </div>
      </div>
    `;
    await this.refresh();
  },

  async refresh() {
    await this.loadCustomers();
  },

  async loadCustomers() {
    const container = document.getElementById("customers-table-container");
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const result = await window.api.getAllCustomers(this.currentFilters);
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${result.error}</p></div>`;
        return;
      }

      const data = result.data;
      if (!data.customers || data.customers.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No customers found</h3><p>Add your first customer to get started.</p></div>';
        return;
      }

      container.innerHTML = `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.customers.map(c => `
                <tr>
                  <td><strong>${this.escapeHtml(c.customer_name)}</strong></td>
                  <td>${this.escapeHtml(c.phone) || '-'}</td>
                  <td>${this.escapeHtml(c.address) || '-'}</td>
                  <td><span class="badge ${c.status === 'Active' ? 'badge-in-stock' : 'badge-lost'}">${c.status}</span></td>
                  <td>${Formatters.formatDate(c.created_at)}</td>
                  <td>
                    <div class="action-buttons">
                      <button class="btn btn-sm btn-primary" onclick="CustomersPage.viewCustomer(${c.id})" title="View">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      <button class="btn btn-sm btn-success" onclick="CustomersPage.editCustomer(${c.id})" title="Edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button class="btn btn-sm btn-warning" onclick="CustomersPage.showCustomerStatement(${c.id})" title="View Statement">
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

      // Pagination
      const paginationContainer = document.getElementById("customers-pagination");
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
    for (let i = 1; i <= data.totalPages; i++) {
      pages.push(i);
    }
    return `
      <div class="pagination">
        <button ${data.page <= 1 ? 'disabled' : ''} onclick="CustomersPage.goToPage(${data.page - 1})">Prev</button>
        ${pages.map(p => `<button class="${p === data.page ? 'active' : ''}" onclick="CustomersPage.goToPage(${p})">${p}</button>`).join('')}
        <button ${data.page >= data.totalPages ? 'disabled' : ''} onclick="CustomersPage.goToPage(${data.page + 1})">Next</button>
        <span class="pagination-info">${data.total} total</span>
      </div>
    `;
  },

  goToPage(page) {
    this.currentFilters.page = page;
    this.loadCustomers();
  },

  onSearch() {
    clearTimeout(this._searchTimeout);
    this._searchTimeout = setTimeout(() => {
      this.currentFilters.search = document.getElementById("customer-search")?.value?.trim() || "";
      this.currentFilters.page = 1;
      this.loadCustomers();
    }, 300);
  },

  onFilter() {
    this.currentFilters.status = document.getElementById("filter-customer-status")?.value || "";
    this.currentFilters.page = 1;
    this.loadCustomers();
  },

  showAddCustomer() {
    Modal.showForm("Add Customer", this.getCustomerFormHtml(), () => {
      const data = this.collectCustomerForm();
      if (!data.customer_name.trim()) {
        Toast.error("Customer name is required.");
        return;
      }
      window.api.addCustomer(data).then(result => {
        if (result.success) {
          Toast.success("Customer added successfully.");
          Modal.close();
          this.loadCustomers();
        } else {
          Toast.error(result.error || "Failed to add customer.");
        }
      }).catch(err => Toast.error(err.message));
    }, "lg");
  },

  editCustomer(id) {
    window.api.getCustomerById(id).then(result => {
      if (!result.success || !result.data) {
        Toast.error("Failed to load customer.");
        return;
      }
      const c = result.data;
      Modal.showForm("Edit Customer", this.getCustomerFormHtml(c), () => {
        const data = this.collectCustomerForm();
        if (!data.customer_name.trim()) {
          Toast.error("Customer name is required.");
          return;
        }
        window.api.updateCustomer(id, data).then(res => {
          if (res.success) {
            Toast.success("Customer updated successfully.");
            Modal.close();
            this.loadCustomers();
          } else {
            Toast.error(res.error || "Failed to update customer.");
          }
        }).catch(err => Toast.error(err.message));
      }, "lg");
    }).catch(err => Toast.error(err.message));
  },

  async viewCustomer(id) {
    try {
      const result = await window.api.getCustomerFullProfile(id);
      if (!result.success || !result.data) {
        Toast.error("Failed to load customer profile.");
        return;
      }

      const profile = result.data;
      const c = profile.customer;
      const balance = profile.balance;
      const currency = App.currency || 'USD';

      // Sales history
      const salesHtml = profile.sales && profile.sales.length > 0
        ? profile.sales.map(sale => `
          <div class="profile-sale-item">
            <div class="profile-sale-header" onclick="CustomersPage.toggleSalePayments(${sale.id})">
              <div class="profile-sale-ref">
                <strong>${this.escapeHtml(sale.reference_no)}</strong>
                <span class="profile-sale-meta">${Formatters.formatDate(sale.issue_date)} - ${this.escapeHtml(sale.transaction_type)}</span>
              </div>
              <div class="profile-sale-amounts">
                <span class="profile-sale-total">${Formatters.formatCurrency(sale.total_amount, currency)}</span>
                <span class="profile-sale-paid">Paid: ${Formatters.formatCurrency(sale.paid_amount, currency)}</span>
                <span class="profile-sale-remaining ${sale.remaining_amount > 0 ? 'text-danger' : 'text-success'}">Rem: ${Formatters.formatCurrency(sale.remaining_amount, currency)}</span>
                <span class="badge ${sale.payment_status === 'Paid' ? 'badge-paid' : sale.payment_status === 'Partial' ? 'badge-partial' : 'badge-outstanding'}">${sale.payment_status}</span>
              </div>
              <span class="profile-toggle-icon">&#9654;</span>
            </div>
            <div class="profile-sale-details" id="sale-details-${sale.id}" style="display:none;">
              ${sale.items && sale.items.length > 0 ? `
                <table class="report-table" style="margin-top:8px;">
                  <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
                  <tbody>
                    ${sale.items.map(item => `
                      <tr>
                        <td>${this.escapeHtml(item.product_name)}</td>
                        <td>${item.quantity}</td>
                        <td>${Formatters.formatCurrency(item.unit_price, currency)}</td>
                        <td>${Formatters.formatCurrency(item.subtotal, currency)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : ''}
              ${sale.payments && sale.payments.length > 0 ? `
                <div class="profile-payments">
                  <strong style="font-size:13px;">Payment History:</strong>
                  ${sale.payments.map(p => `
                    <div class="profile-payment-item">
                      <span>${Formatters.formatDate(p.payment_date)}</span>
                      <span>${this.escapeHtml(p.payment_method)}</span>
                      <span style="font-weight:600;color:var(--success);">${Formatters.formatCurrency(p.amount, currency)}</span>
                      ${p.note ? `<span style="color:var(--text-muted);font-size:12px;">${this.escapeHtml(p.note)}</span>` : ''}
                    </div>
                  `).join('')}
                </div>
              ` : '<p style="color:var(--text-muted);font-size:12px;margin-top:8px;">No payments recorded.</p>'}
            </div>
          </div>
        `).join('')
        : '<p style="color:var(--text-muted);padding:10px;">No sales yet.</p>';

      const body = `
        <div class="customer-profile">
          <div class="profile-header">
            <div class="profile-avatar">${(c.customer_name || '?')[0].toUpperCase()}</div>
            <div class="profile-info">
              <h3>${this.escapeHtml(c.customer_name)}</h3>
              <p>${this.escapeHtml(c.phone) || 'No phone'}${c.email ? ' | ' + this.escapeHtml(c.email) : ''}</p>
              ${c.address ? `<p style="color:var(--text-muted);font-size:12px;">${this.escapeHtml(c.address)}</p>` : ''}
            </div>
            <div class="profile-status">
              <span class="badge ${c.status === 'Active' ? 'badge-in-stock' : 'badge-lost'}">${c.status}</span>
            </div>
          </div>

          <div class="profile-balance-cards">
            <div class="profile-balance-card success">
              <div class="pbc-value">${Formatters.formatCurrency(balance.total_sales, currency)}</div>
              <div class="pbc-label">Total Sales</div>
            </div>
            <div class="profile-balance-card">
              <div class="pbc-value">${Formatters.formatCurrency(balance.total_paid, currency)}</div>
              <div class="pbc-label">Total Paid</div>
            </div>
            <div class="profile-balance-card ${balance.total_outstanding > 0 ? 'danger' : 'success'}">
              <div class="pbc-value">${Formatters.formatCurrency(balance.total_outstanding, currency)}</div>
              <div class="pbc-label">Outstanding Balance</div>
            </div>
          </div>

          <div class="profile-section">
            <h4>Sales History (${profile.sales ? profile.sales.length : 0})</h4>
            ${salesHtml}
          </div>

          ${profile.returns && profile.returns.length > 0 ? `
          <div class="profile-section">
            <h4>Returns (${profile.returns.length})</h4>
            ${profile.returns.map(r => `
              <div class="profile-return-item">
                <div class="profile-return-info">
                  <strong>${Formatters.formatDate(r.return_date)}</strong>
                  <span>${this.escapeHtml(r.sale_reference) || '-'}</span>
                  ${r.reason ? `<span style="color:var(--text-muted);font-size:12px;">${this.escapeHtml(r.reason)}</span>` : ''}
                </div>
                <span style="font-weight:600;color:var(--warning);">-${Formatters.formatCurrency(r.total_return_amount, currency)}</span>
              </div>
            `).join('')}
          </div>
          ` : ''}

          ${profile.damages && profile.damages.length > 0 ? `
          <div class="profile-section">
            <h4>Related Damages (${profile.damages.length})</h4>
            ${profile.damages.map(d => `
              <div class="profile-damage-item">
                <span>${this.escapeHtml(d.product_name)}</span>
                <span>Qty: ${d.quantity}</span>
                <span>${Formatters.formatDate(d.recorded_date)}</span>
                <span class="badge badge-damaged">${this.escapeHtml(d.damage_type)}</span>
              </div>
            `).join('')}
          </div>
          ` : ''}

          ${c.notes ? `
          <div class="profile-section">
            <h4>Notes</h4>
            <p style="color:var(--text-secondary);font-size:13px;">${this.escapeHtml(c.notes)}</p>
          </div>
          ` : ''}
        </div>
      `;

      const footer = `
        <button class="btn btn-secondary" onclick="window.Modal.close()">Close</button>
        <button class="btn btn-primary" onclick="window.Modal.close(); CustomersPage.editCustomer(${c.id})">Edit</button>
        <button class="btn btn-success" onclick="window.Modal.close(); App.navigate('sales'); SalesPage.selectCustomer(${c.id}, '${this.escapeHtml(c.customer_name)}')">New Sale</button>
        <button class="btn btn-warning" onclick="window.Modal.close(); CustomersPage.showCustomerStatement(${c.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Statement
        </button>
      `;

      Modal.show({ title: `Customer Profile - ${this.escapeHtml(c.customer_name)}`, body, footer, size: "lg" });
    } catch (err) {
      Toast.error(err.message);
    }
  },

  toggleSalePayments(saleId) {
    const details = document.getElementById(`sale-details-${saleId}`);
    if (details) {
      const isVisible = details.style.display !== 'none';
      details.style.display = isVisible ? 'none' : 'block';
      const header = details.previousElementSibling;
      if (header) {
        const icon = header.querySelector('.profile-toggle-icon');
        if (icon) {
          icon.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(90deg)';
        }
      }
    }
  },

  async showCustomerStatement(id) {
    try {
      const result = await window.api.getCustomerStatement(id);
      if (!result.success || !result.data) {
        Toast.error("Failed to generate statement.");
        return;
      }

      const stmt = result.data;
      const currency = stmt.currency || App.currency || 'USD';

      const printContent = this.buildStatementHtml(stmt, currency);

      const footer = `
        <button class="btn btn-secondary" onclick="window.Modal.close()">Close</button>
        <button class="btn btn-primary" onclick="CustomersPage.printStatementFromModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Print Statement
        </button>
        <button class="btn btn-success" onclick="CustomersPage.shareStatementWhatsApp(${stmt.customer.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z"/><path d="M8 8h8M8 12h6M8 16h4"/></svg>
          Share as PDF
        </button>
      `;

      Modal.show({ title: `Statement - ${this.escapeHtml(stmt.customer.customer_name)}`, body: printContent, footer, size: "lg" });
    } catch (err) {
      Toast.error(err.message);
    }
  },

  buildStatementHtml(stmt, currency) {
    // Generate payment rows for a sale with running balance
    const buildPaymentsTable = (sale) => {
      if (!sale.payments || sale.payments.length === 0) {
        return '<p style="color:#94a3b8;font-size:12px;padding:6px 0;">No payments recorded for this sale.</p>';
      }
      let rows = sale.payments.map(p => {
        const remaining = p.remaining_after !== undefined ? p.remaining_after : sale.remaining_amount;
        return `<tr>
          <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px;">${Formatters.formatDate(p.payment_date)}</td>
          <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px;">${this.escapeHtml(p.payment_method)}</td>
          <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px;text-align:right;font-weight:600;color:#22c55e;">${Formatters.formatCurrency(p.amount, currency)}</td>
          <td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px;text-align:right;color:${remaining > 0 ? '#ef4444' : '#22c55e'};font-weight:600;">${Formatters.formatCurrency(remaining, currency)}</td>
          ${p.note ? `<td style="padding:4px 8px;border:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">${this.escapeHtml(p.note)}</td>` : ''}
        </tr>`;
      }).join('');
      return `
        <table style="width:100%;border-collapse:collapse;margin-top:4px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px;text-align:left;color:#64748b;text-transform:uppercase;">Date</th>
              <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px;text-align:left;color:#64748b;text-transform:uppercase;">Method</th>
              <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px;text-align:right;color:#64748b;text-transform:uppercase;">Paid</th>
              <th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px;text-align:right;color:#64748b;text-transform:uppercase;">Remaining</th>
              ${sale.payments.some(p => p.note) ? '<th style="padding:4px 8px;border:1px solid #e2e8f0;font-size:10px;text-align:left;color:#64748b;text-transform:uppercase;">Note</th>' : ''}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    };

    // Build sales HTML with payment history under each sale
    const salesHtml = stmt.sales && stmt.sales.length > 0
      ? stmt.sales.map(s => {
          const payTable = buildPaymentsTable(s);
          return `
            <div style="margin-bottom:12px;border:1px solid #e2e8f0;border-radius:6px;padding:10px;background:#fff;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div>
                  <strong style="font-size:14px;">${this.escapeHtml(s.reference_no)}</strong>
                  <span style="color:#64748b;font-size:12px;margin-left:8px;">${Formatters.formatDate(s.issue_date)} - ${this.escapeHtml(s.transaction_type)}</span>
                </div>
                <span class="badge ${s.payment_status === 'Paid' ? 'badge-in-stock' : s.payment_status === 'Partial' ? 'badge-reserved' : 'badge-damaged'}">${s.payment_status}</span>
              </div>
              <div style="display:flex;gap:16px;font-size:13px;margin-bottom:8px;padding:6px 0;border-bottom:1px solid #f1f5f9;">
                <span><strong>Total:</strong> ${Formatters.formatCurrency(s.total_amount, currency)}</span>
                <span style="color:#22c55e;"><strong>Paid:</strong> ${Formatters.formatCurrency(s.paid_amount, currency)}</span>
                <span style="color:${s.remaining_amount > 0 ? '#ef4444' : '#22c55e'};font-weight:600;"><strong>Balance:</strong> ${Formatters.formatCurrency(s.remaining_amount, currency)}</span>
              </div>
              <div style="font-size:12px;color:#64748b;margin-bottom:4px;">
                <strong>Items:</strong> ${s.items ? s.items.map(i => `${this.escapeHtml(i.product_name)} x${i.quantity}`).join(', ') : 'N/A'}
              </div>
              <div style="margin-top:8px;">
                <div style="font-size:12px;font-weight:600;color:#475569;margin-bottom:4px;">Payment History:</div>
                ${payTable}
              </div>
            </div>
          `;
        }).join('')
      : '<p style="color:#94a3b8;text-align:center;padding:20px;">No transactions found.</p>';

    // Build returns table
    const returnsHtml = stmt.returns && stmt.returns.length > 0
      ? `
        <h4 style="font-size:15px;margin:16px 0 8px;color:#475569;">Returns</h4>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px;border:1px solid #e2e8f0;text-align:left;">Date</th>
              <th style="padding:8px;border:1px solid #e2e8f0;text-align:left;">Reference</th>
              <th style="padding:8px;border:1px solid #e2e8f0;text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${stmt.returns.map(r => `<tr>
              <td style="padding:6px 8px;border:1px solid #e2e8f0;">${Formatters.formatDate(r.return_date)}</td>
              <td style="padding:6px 8px;border:1px solid #e2e8f0;">${this.escapeHtml(r.reference_no)}</td>
              <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;color:#f59e0b;">-${Formatters.formatCurrency(r.total_return_amount, currency)}</td>
            </tr>`).join('')}
          </tbody>
        </table>`
      : '';

    return `
      <div class="customer-statement" style="font-family:'Courier New',monospace;padding:10px;">
        <!-- Header -->
        <div style="text-align:center;margin-bottom:18px;padding-bottom:12px;border-bottom:3px solid #2563eb;">
          <h2 style="font-size:20px;margin-bottom:4px;color:#1e293b;">${this.escapeHtml(stmt.shopName)}</h2>
          ${stmt.shopAddress ? `<p style="font-size:12px;color:#555;">${this.escapeHtml(stmt.shopAddress)}</p>` : ''}
          ${stmt.shopPhone ? `<p style="font-size:12px;color:#555;">Phone: ${this.escapeHtml(stmt.shopPhone)}</p>` : ''}
          <h3 style="margin-top:8px;font-size:16px;color:#475569;">Customer Statement</h3>
        </div>

        <!-- Customer Info -->
        <div style="margin-bottom:12px;font-size:13px;">
          <table style="width:100%;">
            <tr><td style="font-weight:600;width:100px;padding:2px 0;">Customer:</td><td>${this.escapeHtml(stmt.customer.customer_name)}</td></tr>
            <tr><td style="font-weight:600;padding:2px 0;">Phone:</td><td>${this.escapeHtml(stmt.customer.phone) || '-'}</td></tr>
            <tr><td style="font-weight:600;padding:2px 0;">Address:</td><td>${this.escapeHtml(stmt.customer.address) || '-'}</td></tr>
            <tr><td style="font-weight:600;padding:2px 0;">Date:</td><td>${Formatters.formatDate(new Date().toISOString())}</td></tr>
          </table>
        </div>

        <!-- Balance Summary -->
        <div style="margin-bottom:16px;">
          <table style="width:100%;font-size:13px;border-collapse:collapse;">
            <tr style="background:#f1f5f9;">
              <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;">Total Sales</th>
              <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;">Total Paid</th>
              <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;">Outstanding</th>
            </tr>
            <tr>
              <td style="padding:6px 10px;border:1px solid #e2e8f0;">${Formatters.formatCurrency(stmt.balance.total_sales, currency)}</td>
              <td style="padding:6px 10px;border:1px solid #e2e8f0;">${Formatters.formatCurrency(stmt.balance.total_paid, currency)}</td>
              <td style="padding:6px 10px;border:1px solid #e2e8f0;font-weight:700;${stmt.balance.total_outstanding > 0 ? 'color:#ef4444;' : 'color:#22c55e;'}">${Formatters.formatCurrency(stmt.balance.total_outstanding, currency)}</td>
            </tr>
          </table>
        </div>

        <!-- Sales with Payment History -->
        ${stmt.sales && stmt.sales.length > 0 ? `
        <h4 style="font-size:15px;margin:0 0 10px;color:#475569;">Transaction History (${stmt.sales.length})</h4>
        ${salesHtml}
        ` : ''}

        ${returnsHtml}

        <!-- Footer -->
        <div style="text-align:center;margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">
          <p>Generated on ${Formatters.formatDateTime(new Date().toISOString())}</p>
          <p>This is a computer-generated statement from ${this.escapeHtml(stmt.shopName)}</p>
        </div>
      </div>
    `;
  },

  printStatementFromModal() {
    const modalBody = document.querySelector('.modal-body');
    if (!modalBody) return;
    const printContent = modalBody.innerHTML;
    const customerName = document.querySelector('.modal-header h2')?.textContent?.replace('Statement - ', '') || 'Customer';
    this._openPdfWindow(customerName, printContent);
  },

  _openPdfWindow(customerName, printContent) {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      Toast.error('Please allow pop-ups for printing.');
      return;
    }
    printWindow.document.write(`
      <html>
      <head>
        <title>Statement - ${customerName}</title>
        <style>
          @page { margin: 10mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Courier New', Courier, monospace; padding: 15px; color: #1e293b; background: #fff; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; }
          th { padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; border: 1px solid #e2e8f0; background: #f8fafc; text-align: left; }
          td { padding: 5px 8px; border: 1px solid #e2e8f0; font-size: 12px; color: #334155; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 500; }
          .badge-in-stock { background: #dcfce7; color: #166534; }
          .badge-reserved { background: #fef3c7; color: #92400e; }
          .badge-damaged { background: #fee2e2; color: #991b1b; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${printContent}
        <script>
          window.onload = function() { setTimeout(function() { window.print(); }, 500); };
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  },

  async shareStatementWhatsApp(customerId) {
    try {
      // First load the full statement data
      const result = await window.api.getCustomerStatement(customerId);
      if (!result.success || !result.data) {
        Toast.error('Failed to load statement.');
        return;
      }

      const stmt = result.data;
      const currency = stmt.currency || App.currency || 'USD';
      const printContent = this.buildStatementHtml(stmt, currency);
      const customerName = stmt.customer.customer_name;
      const phone = stmt.customer.phone || '';

      // Open the printable PDF window first
      this._openPdfWindow(customerName, printContent);

      // Also open WhatsApp with message
      if (phone) {
        const shopName = document.getElementById('shop-name')?.textContent || 'Laptop Inventory Manager';
        const dateStr = new Date().toLocaleDateString();
        const message = encodeURIComponent(
          `Dear ${customerName},\n\n` +
          `Please find attached your detailed account statement from ${shopName}.\n\n` +
          `Summary:\n` +
          `Total Sales: ${Formatters.formatCurrency(stmt.balance.total_sales, currency)}\n` +
          `Total Paid: ${Formatters.formatCurrency(stmt.balance.total_paid, currency)}\n` +
          `Outstanding Balance: ${Formatters.formatCurrency(stmt.balance.total_outstanding, currency)}\n\n` +
          `For any queries, please contact us. Thank you for your business!\n\n` +
          `- ${shopName} | ${dateStr}`
        );
        const waUrl = `https://wa.me/${phone.replace(/[^\d]/g, '')}?text=${message}`;
        window.open(waUrl, '_blank');
      } else {
        Toast.warning('Customer has no phone number. WhatsApp cannot be opened.');
      }
    } catch (err) {
      Toast.error(err.message);
    }
  },

  getCustomerFormHtml(c = {}) {
    return `
      <form id="customer-form" onsubmit="return false;">
        <div class="form-row">
          <div class="form-group">
            <label>Customer Name *</label>
            <input type="text" class="form-control" id="cf-name" value="${this.escapeHtml(c.customer_name || '')}" required>
          </div>
          <div class="form-group">
            <label>Phone</label>
            <input type="text" class="form-control" id="cf-phone" value="${this.escapeHtml(c.phone || '')}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Address</label>
            <input type="text" class="form-control" id="cf-address" value="${this.escapeHtml(c.address || '')}">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" class="form-control" id="cf-email" value="${this.escapeHtml(c.email || '')}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Status</label>
            <select class="form-control" id="cf-status">
              <option value="Active" ${c.status === 'Active' ? 'selected' : ''}>Active</option>
              <option value="Inactive" ${c.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea class="form-control" id="cf-notes" rows="3">${this.escapeHtml(c.notes || '')}</textarea>
        </div>
      </form>
    `;
  },

  collectCustomerForm() {
    return {
      customer_name: document.getElementById("cf-name")?.value?.trim() || "",
      phone: document.getElementById("cf-phone")?.value?.trim() || "",
      address: document.getElementById("cf-address")?.value?.trim() || "",
      email: document.getElementById("cf-email")?.value?.trim() || "",
      status: document.getElementById("cf-status")?.value || "Active",
      notes: document.getElementById("cf-notes")?.value?.trim() || "",
    };
  },

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};