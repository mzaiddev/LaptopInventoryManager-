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
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" onclick="CustomersPage.importCsv()">Import CSV</button>
          <button class="btn btn-secondary" onclick="CustomersPage.exportCsv()">Export CSV</button>
          <button class="btn btn-secondary" onclick="CustomersPage.openPrintDialog()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print
          </button>
          <button class="btn btn-primary" onclick="CustomersPage.showAddCustomer()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Customer
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
              <input type="text" id="customer-search" placeholder="Search by name, phone, address..." oninput="CustomersPage.onSearch()">
            </div>
            <div class="filter-group">
              <select id="filter-customer-status" onchange="CustomersPage.onFilter()">
                <option value="">All Status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
              <select id="filter-customer-due" onchange="CustomersPage.onFilter()">
                <option value="">All balances</option>
                <option value="1">Has due</option>
              </select>
            </div>
          </div>
          ${BulkShare.barHtml('customers', 'CustomersPage.sendSelected()', 'CustomersPage.sendAll()', 'WhatsApp All Customers')}
          <div id="customers-table-container"><div class="loading"><div class="spinner"></div></div></div>
          <div id="customers-pagination"></div>
        </div>
      </div>
    `;
    const statusFilter = document.getElementById('filter-customer-status');
    const dueFilter = document.getElementById('filter-customer-due');
    const searchInput = document.getElementById('customer-search');
    if (statusFilter) statusFilter.value = this.currentFilters.status || '';
    if (dueFilter) dueFilter.value = this.currentFilters.hasDue ? '1' : '';
    if (searchInput) searchInput.value = this.currentFilters.search || '';
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

      BulkShare.register('customers', data.customers.map(c => ({ id: c.id, label: c.customer_name, phone: c.phone })));
      container.innerHTML = `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                ${BulkShare.headerCheckbox('customers')}
                <th>Name</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Due / Credit</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.customers.map(c => `
                <tr>
                  ${BulkShare.rowCheckbox('customers', c.id)}
                  <td><strong>${this.escapeHtml(c.customer_name)}</strong></td>
                  <td>${this.escapeHtml(c.phone) || '-'}</td>
                  <td>${this.escapeHtml(c.address) || '-'}</td>
                  <td>${Number(c.total_due || 0) > 0
                    ? `<strong style="color:var(--danger);">${Formatters.formatCurrency(c.total_due, App.currency)}</strong>`
                    : Number(c.ledger_balance || 0) < 0
                      ? `<span style="color:var(--success);">Credit ${Formatters.formatCurrency(Math.abs(c.ledger_balance), App.currency)}</span>`
                      : Formatters.formatCurrency(0, App.currency)}</td>
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
                      <button class="btn btn-sm btn-danger" onclick="CustomersPage.deleteCustomer(${c.id}, '${this.escapeHtml(c.customer_name)}')" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      BulkShare.refreshBar('customers');
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
    this.currentFilters.hasDue = document.getElementById("filter-customer-due")?.value === "1";
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
      const oldBalances = profile.old_balances || [];
      const ledgerEntries = profile.ledger_entries || [];

      // Sales history
      const salesHtml = profile.sales && profile.sales.length > 0
        ? profile.sales.map(sale => `
          <div class="profile-sale-item">
            <div class="profile-sale-header">
              <div class="profile-sale-ref">
                <strong>${this.escapeHtml(sale.reference_no)}</strong>
                <span class="profile-sale-meta">${Formatters.formatDate(sale.issue_date)} - ${this.escapeHtml(sale.transaction_type)}</span>
              </div>
              <div class="profile-sale-amounts">
                ${this.saleDiscount(sale) > 0 ? `<span class="profile-sale-meta" style="margin-right:8px;">Discount: &minus; ${Formatters.formatCurrency(this.saleDiscount(sale), currency)} (${ReportTheme.pct(this.saleDiscount(sale), this.saleGross(sale))})</span>` : ''}
                <span class="profile-sale-total">${Formatters.formatCurrency(sale.total_amount, currency)}</span>
              </div>
            </div>
            <div class="profile-sale-details" style="padding:10px 12px;">
              ${sale.items && sale.items.length > 0 ? `
                <table class="report-table" style="margin-top:4px;">
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
              ` : '<p style="color:var(--text-muted);font-size:12px;">No products listed.</p>'}
            </div>
          </div>
        `).join('')
        : '<p style="color:var(--text-muted);padding:10px;">No sales yet.</p>';

      // Ledger Entries HTML
      const ledgerHtml = ledgerEntries.length > 0 ? `
        <div style="margin-top:12px;">
          <table class="report-table" style="font-size:12px;">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th style="text-align:right;">Debit</th>
                <th style="text-align:right;">Credit</th>
                <th style="text-align:right;">Balance</th>
              </tr>
            </thead>
            <tbody>
              ${ledgerEntries.map(e => `
                <tr>
                  <td>${Formatters.formatDate(e.entry_date)}</td>
                  <td><span class="badge ${e.reference_type === 'Sale' ? 'badge-outstanding' : e.reference_type === 'Payment' ? 'badge-paid' : e.reference_type === 'Return' ? 'badge-partial' : 'badge-damaged'}">${this.escapeHtml(e.reference_type)}</span></td>
                  <td>${this.escapeHtml(e.description)}</td>
                  <td style="text-align:right;font-weight:600;color:var(--danger);">${e.debit > 0 ? Formatters.formatCurrency(e.debit, currency) : '-'}</td>
                  <td style="text-align:right;font-weight:600;color:var(--success);">${e.credit > 0 ? Formatters.formatCurrency(e.credit, currency) : '-'}</td>
                  <td style="text-align:right;font-weight:700;${e.running_balance > 0 ? 'color:var(--danger);' : 'color:var(--success);'}">${Formatters.formatCurrency(e.running_balance, currency)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p style="color:var(--text-muted);font-size:12px;margin-top:8px;">No ledger entries yet.</p>';

      const totalDue = balance.total_due || (balance.total_outstanding + (balance.old_balance_net || 0));
      const combinedCardClass = totalDue > 0 ? 'danger' : 'success';

      let oldBalanceCardHtml = '';
      if (balance.old_balance_net !== undefined) {
        const cardClass = balance.old_balance_net > 0 ? 'danger' : 'success';
        let labelText = '';
        if (balance.old_balance_debit > 0) labelText += 'Debit: ' + Formatters.formatCurrency(balance.old_balance_debit, currency);
        if (balance.old_balance_credit > 0) labelText += ' Credit: ' + Formatters.formatCurrency(balance.old_balance_credit, currency);
        oldBalanceCardHtml = '<div class="profile-balance-card ' + cardClass + '">' +
          '<div class="pbc-value" style="font-size:16px;">' + Formatters.formatCurrency(balance.old_balance_net, currency) + '</div>' +
          '<div class="pbc-label" style="font-size:10px;">Old Balance (' + labelText + ')</div></div>';
      }

      let oldBalancesSectionHtml = '';
      if (oldBalances.length > 0) {
        let itemsHtml = '';
        for (let oi = 0; oi < oldBalances.length; oi++) {
          const ob = oldBalances[oi];
          const isDebit = ob.balance_type === 'Debit';
          const color = isDebit ? 'var(--danger)' : 'var(--success)';
          const label = isDebit ? 'Debit (Owes)' : 'Credit (Owed)';
          const notesHtml = ob.notes ? '<span style="font-size:11px;color:var(--text-muted);">' + this.escapeHtml(ob.notes) + '</span>' : '';
          itemsHtml += '<div class="profile-old-balance-item" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid var(--border-color);border-radius:var(--radius);margin-bottom:6px;">' +
            '<div style="display:flex;flex-direction:column;gap:2px;">' +
              '<span style="font-weight:600;font-size:13px;color:' + color + ';">' + label + '</span>' +
              notesHtml +
              '<span style="font-size:10px;color:var(--text-muted);">' + Formatters.formatDate(ob.created_at) + '</span>' +
            '</div>' +
            '<span style="font-weight:700;font-size:15px;color:' + color + ';">' + Formatters.formatCurrency(ob.amount, currency) + '</span>' +
          '</div>';
        }
        oldBalancesSectionHtml = '<div class="profile-section">' +
          '<h4>Old Balances (' + oldBalances.length + ')</h4>' +
          itemsHtml + '</div>';
      }

      const body = `
        <div class="customer-profile">
          <div class="profile-header">
            <div class="profile-avatar">${(c.customer_name || '?')[0].toUpperCase()}</div>
            <div class="profile-info">
              <h3>${this.escapeHtml(c.customer_name)}</h3>
              <p>${this.escapeHtml(c.phone) || 'No phone'}${c.email ? ' | ' + this.escapeHtml(c.email) : ''}</p>
              ${c.address ? '<p style="color:var(--text-muted);font-size:12px;">' + this.escapeHtml(c.address) + '</p>' : ''}
            </div>
            <div class="profile-status">
              <span class="badge ${c.status === 'Active' ? 'badge-in-stock' : 'badge-lost'}">${c.status}</span>
            </div>
          </div>

          <div class="profile-balance-cards">
            <div class="profile-balance-card success">
              <div class="pbc-value">${Formatters.formatCurrency(balance.total_sales || 0, currency)}</div>
              <div class="pbc-label">Total Sales</div>
            </div>
            <div class="profile-balance-card">
              <div class="pbc-value">${Formatters.formatCurrency(balance.total_paid || 0, currency)}</div>
              <div class="pbc-label">Total Paid</div>
            </div>
            ${oldBalanceCardHtml}
            <div class="profile-balance-card ${totalDue > 0 ? 'danger' : 'success'}" style="border:2px solid ${totalDue > 0 ? 'var(--danger)' : 'var(--success)'};">
              <div class="pbc-value" style="font-size:18px;font-weight:800;">${Formatters.formatCurrency(totalDue, currency)}</div>
              <div class="pbc-label" style="font-size:10px;">Total Balance Due</div>
            </div>
          </div>
          <div style="margin-top:6px;font-size:10px;color:var(--text-muted);text-align:center;">
            Total Due = Total Sales − Total Paid + Old Balance
          </div>

          ${oldBalancesSectionHtml}

          <!-- Ledger Section -->
          <div class="profile-section">
            <h4>Unified Ledger (${ledgerEntries.length} entries)</h4>
            ${ledgerHtml}
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
                  ${r.reason ? '<span style="color:var(--text-muted);font-size:12px;">' + this.escapeHtml(r.reason) + '</span>' : ''}
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
        <button class="btn btn-success" onclick="window.Modal.close(); App.navigate('create-sale')">New Sale</button>
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

  // The account summary as simple lines that add up: old + sales - returns - payments = balance.
  summaryLines(s) {
    const lines = [];
    if (s.old_balance) lines.push({ sign: '', label: 'Old balance (before using our system)', amount: s.old_balance });
    lines.push({ sign: '+', label: 'Sales', amount: s.sales });
    if (s.returns) lines.push({ sign: '-', label: 'Returns', amount: s.returns });
    lines.push({ sign: '-', label: 'Payments received', amount: s.payments });
    if (s.other) lines.push({ sign: s.other > 0 ? '+' : '-', label: 'Other adjustments', amount: Math.abs(s.other) });
    const owes = s.balance >= 0;
    return { lines, totalLabel: owes ? 'TOTAL YOU OWE US' : 'CREDIT (we owe you)', total: Math.abs(s.balance) };
  },

  summaryTableHtml(s, currency) {
    const { lines, totalLabel, total } = this.summaryLines(s);
    const fx = (v) => Formatters.formatCurrency(v, currency, true);
    const row = (l) => '<tr><td class="sign">' + (l.sign === '-' ? '&minus;' : l.sign) + '</td><td>' + l.label + '</td><td class="num">' + fx(l.amount) + '</td></tr>';
    return '<table class="sum">' + lines.map(row).join('') +
      '<tr class="total"><td class="sign">=</td><td>' + totalLabel + '</td><td class="num">' + fx(total) + '</td></tr></table>';
  },

  // Everything taken off one sale: the per-item discounts plus the discount on the whole bill.
  saleDiscount(sl) {
    return (sl.discount_amount || 0) + (sl.items || []).reduce((s, i) => s + (i.discount_amount || 0), 0);
  },

  // What a sale would have cost before any discount.
  saleGross(sl) {
    return (sl.items || []).reduce((s, i) => s + i.quantity * i.unit_price, 0);
  },

  statementGross(stmt) {
    return (stmt.sales || []).reduce((s, sl) => s + this.saleGross(sl), 0);
  },

  statementDiscount(stmt) {
    return Math.round((stmt.sales || []).reduce((s, sl) => s + this.saleDiscount(sl), 0) * 100) / 100;
  },

  // Friendly names for the ledger entry types.
  _entryLabel(type) {
    return { Sale: 'Sale', Payment: 'Payment', OldBalanceDebit: 'Old balance', OldBalanceCredit: 'Old balance (credit)', Return: 'Return', Adjustment: 'Adjustment' }[type] || type;
  },

  // The inside of a statement (no page wrapper). Same markup for the screen, print and the WhatsApp PDF.
  statementBody(stmt, currency) {
    const T = ReportTheme;
    const esc = (v) => this.escapeHtml(v);
    const fx = (v) => Formatters.formatCurrency(v, currency, true);
    const shop = Object.assign({ shop_name: stmt.shopName }, stmt.shop);
    const bal = stmt.balance.statement.balance;
    const owes = bal > 0.005;
    const credit = bal < -0.005;
    const statusBadge = owes ? T.badge('bad', 'Payment due') : credit ? T.badge('ok', 'In credit') : T.badge('ok', 'All clear');
    const today = Formatters.formatDate(new Date().toISOString());

    const ledgerEntries = stmt.ledger_entries || [];
    const ledgerHtml = ledgerEntries.length ? T.section('Account activity') + '<table><thead><tr>' +
      '<th>Date</th><th>Type</th><th>Details</th><th class="num">Charged (+)</th><th class="num">Received (&minus;)</th><th class="num">Balance</th></tr></thead><tbody>' +
      ledgerEntries.map((e) => '<tr><td>' + Formatters.formatDate(e.entry_date) + '</td><td>' + esc(this._entryLabel(e.reference_type)) + '</td><td>' + esc(e.description) + '</td>' +
        '<td class="num ' + (e.debit > 0 ? 'neg' : 'muted') + '">' + (e.debit > 0 ? '+ ' + fx(e.debit) : '-') + '</td>' +
        '<td class="num ' + (e.credit > 0 ? 'pos' : 'muted') + '">' + (e.credit > 0 ? '&minus; ' + fx(e.credit) : '-') + '</td>' +
        '<td class="num strong">' + fx(e.running_balance) + '</td></tr>').join('') +
      '</tbody></table>' : '';

    const sales = stmt.sales || [];
    const salesHtml = sales.length ? T.section('Sales (' + sales.length + ')') + sales.map((sl) => {
      const items = sl.items && sl.items.length ? sl.items.map((i) => '<tr><td>' + esc(i.product_name) + (i.discount_amount > 0 ? '<div class="muted"><span>Discount on this item</span> (' + T.pct(i.discount_amount, i.quantity * i.unit_price) + '): &minus; ' + fx(i.discount_amount) + '</div>' : '') + '</td><td class="ctr">' + i.quantity + '</td><td class="num">' + fx(i.unit_price) + '</td><td class="num">' + fx(i.subtotal) + '</td></tr>').join('')
        : '<tr><td colspan="4" class="muted">No items</td></tr>';
      const discLine = this.saleDiscount(sl) > 0 ? '<div class="muted" style="margin-top:4px;"><span>Discount given</span> (' + T.pct(this.saleDiscount(sl), this.saleGross(sl)) + '): <b class="pos">&minus; ' + fx(this.saleDiscount(sl)) + '</b></div>' : '';
      const paidLine = discLine + (sl.paid_amount != null ? '<div class="muted" style="margin-top:4px;"><span>Paid:</span> <b>' + fx(sl.paid_amount) + '</b> &nbsp;|&nbsp; <span>Remaining:</span> <b>' + fx(sl.remaining_amount || 0) + '</b></div>' : '');
      return '<div class="sale"><div class="top"><div><b>' + esc(sl.reference_no) + '</b> <span class="muted">&middot; ' + Formatters.formatDate(sl.issue_date) + ' &middot; ' + esc(sl.transaction_type) + '</span></div>' +
        '<div>' + (sl.payment_status ? T.paymentBadge(sl.payment_status) + ' ' : '') + '<b>' + fx(sl.total_amount) + '</b></div></div>' +
        '<table><thead><tr><th>Product</th><th class="ctr">Qty</th><th class="num">Price</th><th class="num">Total</th></tr></thead><tbody>' + items + '</tbody></table>' + paidLine + '</div>';
    }).join('') : '';

    const returns = stmt.returns || [];
    const returnsHtml = returns.length ? T.section('Returns') + '<table><thead><tr><th>Date</th><th>Reference</th><th class="num">Amount returned</th></tr></thead><tbody>' +
      returns.map((r) => '<tr><td>' + Formatters.formatDate(r.return_date) + '</td><td>' + esc(r.reference_no) + '</td><td class="num pos">&minus; ' + fx(r.total_return_amount) + '</td></tr>').join('') + '</tbody></table>' : '';

    return T.header({ shop, title: 'Customer Statement', meta: [['Date', today]] }) +
      '<div class="info">' +
        '<div class="box"><div class="k">Customer</div><div class="v">' + esc(stmt.customer.customer_name) + '</div>' +
          '<div class="s">' + (esc(stmt.customer.phone) || '-') + (stmt.customer.address ? ' &middot; ' + esc(stmt.customer.address) : '') + '</div></div>' +
        '<div class="box" style="max-width:190px;"><div class="k">Account status</div><div class="v" style="margin-top:3px;">' + statusBadge + '</div></div>' +
      '</div>' +
      T.dueBox(owes
        ? { label: 'Total amount due', amount: fx(bal), note: 'Please pay this amount. Thank you.', tone: 'bad' }
        : credit
          ? { label: 'Credit balance (we owe you)', amount: fx(-bal), tone: 'ok' }
          : { label: 'Account settled', amount: fx(0), note: 'Nothing is due.', tone: 'ok' }) +
      T.section('Account summary') + this.summaryTableHtml(stmt.balance.statement, currency) +
      (this.statementDiscount(stmt) > 0 ? '<div class="muted" style="margin-top:6px;"><span>Total discount given to you:</span> <b class="pos">' + fx(this.statementDiscount(stmt)) + ' (' + T.pct(this.statementDiscount(stmt), this.statementGross(stmt)) + ')</b> <span>(already taken off the sales above)</span></div>' : '') +
      ledgerHtml + salesHtml + returnsHtml +
      (owes ? T.paymentBox(shop) : '') +
      T.footer({ shop, note: 'This is a computer-generated statement from ' + (stmt.shopName || '') });
  },

  // For the on-screen statement: the same look, styled by the shared stylesheet.
  buildStatementHtml(stmt, currency) {
    return ReportTheme.styleTag() + '<div class="rpt">' + this.statementBody(stmt, currency) + '</div>';
  },

  printStatementFromModal() {
    const modalBody = document.querySelector('.modal-body');
    if (!modalBody) return;
    const printContent = modalBody.innerHTML;
    const customerName = document.querySelector('.modal-header h2')?.textContent?.replace('Statement - ', '') || 'Customer';
    this._openPdfWindow(customerName, printContent);
  },

  // Full HTML page for a statement; autoPrint adds the toolbar and the print-on-load script for the print window.
  _statementDocument(customerName, printContent, autoPrint) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Statement - ' + this.escapeHtml(customerName) + '</title>' +
      '<style>body{margin:0;padding:14px;background:#fff;} @media print{body{padding:0;}}</style></head><body>' +
      (autoPrint ? '<div class="rpt-toolbar no-print" style="text-align:center;margin-bottom:12px;"><button onclick="window.print()">Print</button> <button onclick="window.print()">Save as PDF</button></div>' : '') +
      printContent +
      (autoPrint ? '<script>window.onload=function(){setTimeout(function(){window.print()},500)};<\/script>' : '') +
      '</body></html>';
  },

  _openPdfWindow(customerName, printContent) {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      Toast.error('Please allow pop-ups for printing.');
      return;
    }
    printWindow.document.write(I18n.translateHtml(this._statementDocument(customerName, printContent, true)));
    printWindow.document.close();
  },

  // Builds everything shareStatement needs for one customer: { html, customerName, phone, message }.
  async buildStatementShare(customerId) {
    const result = await window.api.getCustomerStatement(customerId);
    if (!result.success || !result.data) throw new Error('Failed to load statement.');

    const stmt = result.data;
    const currency = stmt.currency || App.currency || 'USD';
    const printContent = this.buildStatementHtml(stmt, currency);
    const customerName = stmt.customer.customer_name;
    const shopName = document.getElementById('shop-name')?.textContent || 'Laptop Inventory Manager';
    const dateStr = new Date().toLocaleDateString();
    const sum = this.summaryLines(stmt.balance.statement);
    const money = (n) => Formatters._formatCurrency(n, currency, true);
    const t = (s) => I18n.t(s); // the message is written in the language the app is in
    const pay = ShopInfo.paymentText(stmt.shop, t);
    const message =
      t('Dear ' + customerName + ',') + '\n\n' +
      t('Here is your account statement from ' + shopName + ' (' + dateStr + ').') + '\n\n' +
      sum.lines.map((l) => (l.sign ? l.sign + ' ' : '') + t(l.label) + ': ' + money(l.amount)).join('\n') + '\n' +
      '= ' + t(sum.totalLabel) + ': ' + money(sum.total) + '\n' +
      (this.statementDiscount(stmt) > 0 ? t('Total discount given to you:') + ' ' + money(this.statementDiscount(stmt)) + ' (' + ReportTheme.pct(this.statementDiscount(stmt), this.statementGross(stmt)) + ')\n' : '') + '\n' +
      (pay ? t('Payment Details') + ':\n' + pay + '\n\n' : '') +
      t('The attached PDF lists every entry. For any questions please contact us. Thank you!') + '\n- ' + shopName;
    return {
      html: I18n.translateHtml(this._statementDocument(customerName, printContent, false)),
      customerName,
      phone: stmt.customer.phone || '',
      message,
    };
  },

  async shareStatementWhatsApp(customerId) {
    try {
      const payload = await this.buildStatementShare(customerId);
      await WhatsAppLink.shareOne(payload);
    } catch (err) {
      Toast.error(err.message);
    }
  },

  sendSelected() {
    BulkShare.start({
      title: 'Send statements on WhatsApp',
      items: BulkShare.selectedItems('customers'),
      prepare: (item) => this.buildStatementShare(item.id),
    });
  },

  // Every customer matching the current search/status filter, not just this page.
  async sendAll() {
    try {
      const { search, status } = this.currentFilters;
      const result = await window.api.getAllCustomers({ search, status });
      if (!result.success) throw new Error(result.error);
      const list = Array.isArray(result.data) ? result.data : result.data.customers || [];
      BulkShare.start({
        title: 'Send statements on WhatsApp',
        items: list.map(c => ({ id: c.id, label: c.customer_name, phone: c.phone })),
        prepare: (item) => this.buildStatementShare(item.id),
      });
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

  deleteCustomer(id, name) {
    Modal.showConfirm(
      'Delete Customer',
      'Are you sure you want to delete "' + name + '"? This will permanently delete the customer and ALL their data (sales, returns, old balances, payments, ledger entries). Stock will be restored. This action cannot be undone.',
      async () => {
        try {
          const result = await window.api.deleteCustomer(id);
          if (result.success) {
            Toast.success('Customer deleted successfully.');
            this.loadCustomers();
          } else {
            Toast.error(result.error || 'Failed to delete customer.');
          }
        } catch (err) {
          Toast.error('Failed to delete customer: ' + err.message);
        }
      }
    );
  },

  importCsv() {
    CsvTools.openImport({
      title: "Import customers from CSV",
      templateName: "customers-import-template.csv",
      templateRows: [["customer_name", "phone", "address", "email", "opening_balance", "balance_type", "notes"], ["Example Traders", "03001234567", "Lahore", "", "1200", "Debit", "Old balance from register"]],
      run: (rows, dryRun) => window.api.importCustomers(rows, dryRun),
      onDone: () => this.refresh(),
    });
  },

  async exportCsv() {
    const r = await window.api.getAllCustomers({ limit: 5000 });
    if (!r.success) return Toast.error(r.error);
    const list = r.data.customers || [];
    CsvTools.download("customers-" + CsvTools.stamp() + ".csv", [
      ["Customer", "Phone", "Address", "Email", "Status", "Due", "Credit"],
      ...list.map((c) => [c.customer_name, c.phone, c.address, c.email, c.status, c.total_due || 0, c.ledger_balance < 0 ? -c.ledger_balance : 0]),
    ]);
  },

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },

  async openPrintDialog() {
    try {
      const result = await window.api.getAllCustomers({ limit: 10000 });
      if (!result.success) {
        Toast.error('Failed to load customers data.');
        return;
      }
      const customers = result.data?.customers || [];
      if (customers.length === 0) {
        Toast.warning('No customers to print.');
        return;
      }

      // All required totals are returned by the customer list query, avoiding
      // thousands of per-customer IPC calls for a large print job.
      const customerData = customers;

      const currency = App.currency || 'PKR';

      PrintService.showPrintDialog({
        title: 'Customers Report',
        data: customerData,
        columns: [
          { field: 'customer_name', label: 'Customer', width: '120px' },
          { field: 'phone', label: 'Phone', width: '100px' },
          { field: 'address', label: 'Address', width: '120px' },
          { field: 'status', label: 'Status', width: '60px' },
          { field: 'total_sales', label: 'Total Sales', width: '70px', align: 'right', format: 'currency' },
          { field: 'total_paid', label: 'Total Paid', width: '70px', align: 'right', format: 'currency' },
          { field: 'outstanding', label: 'Remaining', width: '70px', align: 'right', format: 'currency' },
          { field: 'old_balance', label: 'Old Balance', width: '70px', align: 'right', format: 'currency' },
          { field: 'sales_count', label: 'Transactions', width: '50px', align: 'center' },
          { field: 'total_due', label: 'Total Due', width: '70px', align: 'right', format: 'currency' },
          { field: 'ledger_balance', label: 'Ledger Balance', width: '70px', align: 'right', format: 'currency' },
        ],
        filters: {
          field: 'status',
          categories: ['Active', 'Inactive'],
          categoryLabel: 'Status',
          defaultFilter: { field:'total_due', operator:'gt', value:0, includeLabel:'Include customers with no due' },
        },
        landscape: false,
        showPrintOptions: true,
        subtitle: 'With related sales and payment history',
        getSummaryItems: (rows) => [
          { label: 'Selected Customers', value: rows.length },
          { label: 'Total Sales', value: Formatters.formatCurrency(rows.reduce((s, c) => s + Number(c.total_sales || 0), 0), currency) },
          { label: 'Total Collected', value: Formatters.formatCurrency(rows.reduce((s, c) => s + Number(c.total_paid || 0), 0), currency) },
          { label: 'Total Due', value: Formatters.formatCurrency(rows.reduce((s, c) => s + Number(c.total_due || 0), 0), currency) },
        ],
        getCompanyHeader: () => LedgersPage.getCompanyHeader()
      });
    } catch (err) {
      Toast.error('Print error: ' + err.message);
    }
  },
};
