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
    const row = (l) => '<tr><td style="padding:7px 14px;border:1px solid #999;width:30px;text-align:center;font-weight:700;">' + l.sign + '</td>' +
      '<td style="padding:7px 14px;border:1px solid #999;">' + l.label + '</td>' +
      '<td style="padding:7px 14px;border:1px solid #999;text-align:right;">' + Formatters.formatCurrency(l.amount, currency, true) + '</td></tr>';
    return '<table style="width:100%;font-size:15px;border-collapse:collapse;color:#000;">' + lines.map(row).join('') +
      '<tr><td style="padding:9px 14px;border:2px solid #000;text-align:center;font-weight:700;">=</td>' +
      '<td style="padding:9px 14px;border:2px solid #000;font-weight:700;">' + totalLabel + '</td>' +
      '<td style="padding:9px 14px;border:2px solid #000;text-align:right;font-weight:700;font-size:17px;">' + Formatters.formatCurrency(total, currency, true) + '</td></tr></table>';
  },

  buildStatementHtml(stmt, currency) {
    // Build ledger entries table
    const ledgerEntries = stmt.ledger_entries || [];
    const ledgerHtml = ledgerEntries.length > 0 ? `
      <h4 style="font-size:18px;margin:20px 0 10px;color:#000;">Ledger Transactions</h4>
      <table style="width:100%;border-collapse:collapse;font-size:15px;">
        <thead>
          <tr style="background:transparent;">
            <th style="padding:9px 12px;border:1px solid #000;text-align:left;font-size:14px;text-transform:uppercase;color:#000;font-weight:700;">Date</th>
            <th style="padding:9px 12px;border:1px solid #000;text-align:left;font-size:14px;text-transform:uppercase;color:#000;font-weight:700;">Type</th>
            <th style="padding:9px 12px;border:1px solid #000;text-align:left;font-size:14px;text-transform:uppercase;color:#000;font-weight:700;">Description</th>
            <th style="padding:9px 12px;border:1px solid #000;text-align:right;font-size:14px;text-transform:uppercase;color:#000;font-weight:700;">Debit</th>
            <th style="padding:9px 12px;border:1px solid #000;text-align:right;font-size:14px;text-transform:uppercase;color:#000;font-weight:700;">Credit</th>
            <th style="padding:9px 12px;border:1px solid #000;text-align:right;font-size:14px;text-transform:uppercase;color:#000;font-weight:700;">Balance</th>
          </tr>
        </thead>
        <tbody>
          ${ledgerEntries.map(e => `<tr>
            <td style="padding:7px 12px;border:1px solid #999;font-size:14px;color:#000;">${Formatters.formatDate(e.entry_date)}</td>
            <td style="padding:7px 12px;border:1px solid #999;font-size:14px;color:#000;">${this.escapeHtml(e.reference_type)}</td>
            <td style="padding:7px 12px;border:1px solid #999;font-size:14px;color:#000;">${this.escapeHtml(e.description)}</td>
            <td style="padding:7px 12px;border:1px solid #999;font-size:14px;text-align:right;color:#000;">${e.debit > 0 ? Formatters.formatCurrency(e.debit, currency) : '-'}</td>
            <td style="padding:7px 12px;border:1px solid #999;font-size:14px;text-align:right;color:#000;">${e.credit > 0 ? Formatters.formatCurrency(e.credit, currency) : '-'}</td>
            <td style="padding:7px 12px;border:1px solid #999;font-size:14px;text-align:right;font-weight:700;color:#000;">${Formatters.formatCurrency(e.running_balance, currency)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    ` : '';

    const salesHtml = stmt.sales && stmt.sales.length > 0
      ? stmt.sales.map(s => {
          return `
            <div style="margin-bottom:16px;border:1px solid #000;border-radius:8px;padding:14px;background:transparent;">
              <div style="margin-bottom:10px;">
                <strong style="font-size:18px;color:#000;">${this.escapeHtml(s.reference_no)}</strong>
                <span style="color:#000;font-size:15px;margin-left:10px;">${Formatters.formatDate(s.issue_date)} - ${this.escapeHtml(s.transaction_type)}</span>
                <span style="float:right;font-size:16px;font-weight:700;color:#000;">${Formatters.formatCurrency(s.total_amount, currency)}</span>
              </div>
              <table style="width:100%;border-collapse:collapse;font-size:15px;">
                <thead>
                  <tr style="background:transparent;">
                    <th style="padding:7px 10px;border:1px solid #000;text-align:left;font-size:14px;text-transform:uppercase;color:#000;font-weight:700;">Product</th>
                    <th style="padding:7px 10px;border:1px solid #000;text-align:center;font-size:14px;text-transform:uppercase;color:#000;font-weight:700;">Qty</th>
                    <th style="padding:7px 10px;border:1px solid #000;text-align:right;font-size:14px;text-transform:uppercase;color:#000;font-weight:700;">Price</th>
                    <th style="padding:7px 10px;border:1px solid #000;text-align:right;font-size:14px;text-transform:uppercase;color:#000;font-weight:700;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${s.items ? s.items.map(i => `
                    <tr>
                      <td style="padding:6px 10px;border:1px solid #999;font-size:14px;color:#000;">${this.escapeHtml(i.product_name)}</td>
                      <td style="padding:6px 10px;border:1px solid #999;font-size:14px;text-align:center;color:#000;">${i.quantity}</td>
                      <td style="padding:6px 10px;border:1px solid #999;font-size:14px;text-align:right;color:#000;">${Formatters.formatCurrency(i.unit_price, currency)}</td>
                      <td style="padding:6px 10px;border:1px solid #999;font-size:14px;text-align:right;color:#000;">${Formatters.formatCurrency(i.subtotal, currency)}</td>
                    </tr>
                  `).join('') : '<tr><td colspan="4" style="padding:6px 10px;font-size:14px;color:#000;">No items</td></tr>'}
                </tbody>
              </table>
            </div>
          `;
        }).join('')
      : '<p style="color:#000;text-align:center;padding:20px;font-size:15px;">No transactions found.</p>';

    const returnsHtml = stmt.returns && stmt.returns.length > 0
      ? `
        <h4 style="font-size:18px;margin:16px 0 8px;color:#000;">Returns</h4>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:transparent;">
              <th style="padding:8px;border:1px solid #999;text-align:left;color:#000;font-weight:700;">Date</th>
              <th style="padding:8px;border:1px solid #999;text-align:left;color:#000;font-weight:700;">Reference</th>
              <th style="padding:8px;border:1px solid #999;text-align:right;color:#000;font-weight:700;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${stmt.returns.map(r => `<tr>
              <td style="padding:6px 8px;border:1px solid #999;font-size:14px;color:#000;">${Formatters.formatDate(r.return_date)}</td>
              <td style="padding:6px 8px;border:1px solid #999;font-size:14px;color:#000;">${this.escapeHtml(r.reference_no)}</td>
              <td style="padding:6px 8px;border:1px solid #999;font-size:14px;text-align:right;font-weight:700;color:#000;">-${Formatters.formatCurrency(r.total_return_amount, currency)}</td>
            </tr>`).join('')}
          </tbody>
        </table>`
      : '';

    return `
      <div class="customer-statement" style="font-family:Arial, Helvetica, sans-serif;padding:15px;">
        <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #000;">
          <h2 style="font-size:24px;margin-bottom:6px;color:#000;">${this.escapeHtml(stmt.shopName)}</h2>
          ${stmt.shopAddress ? '<p style="font-size:15px;color:#000;margin:2px 0;">' + this.escapeHtml(stmt.shopAddress) + '</p>' : ''}
          ${stmt.shopPhone ? '<p style="font-size:15px;color:#000;margin:2px 0;">Phone: ' + this.escapeHtml(stmt.shopPhone) + '</p>' : ''}
          <h3 style="margin-top:10px;font-size:24px;color:#000;">Customer Statement</h3>
        </div>
        <div style="margin-bottom:16px;font-size:15px;">
          <table style="width:100%;">
            <tr><td style="font-weight:700;width:120px;padding:4px 0;">Customer:</td><td>${this.escapeHtml(stmt.customer.customer_name)}</td></tr>
            <tr><td style="font-weight:700;padding:4px 0;">Phone:</td><td>${this.escapeHtml(stmt.customer.phone) || '-'}</td></tr>
            <tr><td style="font-weight:700;padding:4px 0;">Address:</td><td>${this.escapeHtml(stmt.customer.address) || '-'}</td></tr>
            <tr><td style="font-weight:700;padding:4px 0;">Date:</td><td>${Formatters.formatDate(new Date().toISOString())}</td></tr>
          </table>
        </div>
        <div style="margin-bottom:20px;">
          ${this.summaryTableHtml(stmt.balance.statement, currency)}
        </div>
        ${ledgerHtml}
        ${stmt.sales && stmt.sales.length > 0 ? `
        <h4 style="font-size:18px;margin:20px 0 10px;color:#000;">Sales History (${stmt.sales.length})</h4>
        ${salesHtml}
        ` : ''}
        ${returnsHtml}
        <div style="text-align:center;margin-top:30px;padding-top:16px;border-top:1px solid #000;font-size:13px;color:#000;">
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

  // Full HTML page for a statement; autoPrint adds the print-on-load script for the print window.
  _statementDocument(customerName, printContent, autoPrint) {
    return `
      <html>
      <head>
        <meta charset="utf-8">
        <title>Statement - ${this.escapeHtml(customerName)}</title>
        <style>
          @page { margin: 10mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; padding: 15px; color: #000; background: #fff; font-size: 15px; }
          table { width: 100%; border-collapse: collapse; }
          th { padding: 8px 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #000; border: 1px solid #000; background: transparent; text-align: left; font-weight: 700; }
          td { padding: 7px 10px; border: 1px solid #999; font-size: 14px; color: #000; }
          .badge { display: inline-block; padding: 3px 9px; border-radius: 10px; font-size: 12px; font-weight: 500; border: 1px solid #000; }
          .badge-in-stock { border-color: #166534; color: #000; }
          .badge-reserved { border-color: #92400e; color: #000; }
          .badge-damaged { border-color: #991b1b; color: #000; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${printContent}
        ${autoPrint ? '<script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };<\/script>' : ''}
      </body>
      </html>
    `;
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

  async shareStatementWhatsApp(customerId) {
    try {
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

      {
        const shopName = document.getElementById('shop-name')?.textContent || 'Laptop Inventory Manager';
        const dateStr = new Date().toLocaleDateString();
        const sum = this.summaryLines(stmt.balance.statement);
        const money = (n) => Formatters._formatCurrency(n, currency, true);
        const t = (s) => I18n.t(s); // the message is written in the language the app is in
        const message =
          t('Dear ' + customerName + ',') + '\n\n' +
          t('Here is your account statement from ' + shopName + ' (' + dateStr + ').') + '\n\n' +
          sum.lines.map((l) => (l.sign ? l.sign + ' ' : '') + t(l.label) + ': ' + money(l.amount)).join('\n') + '\n' +
          '= ' + t(sum.totalLabel) + ': ' + money(sum.total) + '\n\n' +
          t('The attached PDF lists every entry. For any questions please contact us. Thank you!') + '\n- ' + shopName;
        const r = await window.api.shareStatement({
          html: I18n.translateHtml(this._statementDocument(customerName, printContent, false)),
          customerName,
          phone,
          message,
        });
        if (!r.success) {
          Toast.error(r.error || 'Could not create the PDF.');
        } else if (r.data.chat === 'none') {
          Toast.warning('PDF saved. This customer has no valid phone number, so WhatsApp was not opened.');
        } else if (r.data.clipboardOk) {
          Toast.success('PDF copied. In the WhatsApp chat press Ctrl+V, then Send.');
        } else {
          Toast.warning('WhatsApp opened. The PDF is in the folder that just opened: drag it into the chat.');
        }
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

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },

  async openPrintDialog() {
    try {
      const result = await window.api.getAllCustomers({ limit: 5000 });
      if (!result.success) {
        Toast.error('Failed to load customers data.');
        return;
      }
      const customers = result.data?.customers || [];
      if (customers.length === 0) {
        Toast.warning('No customers to print.');
        return;
      }

      const customerPromises = customers.map(async c => {
        const salesResult = await window.api.getCustomerFullProfile(c.id);
        const sales = salesResult.success ? salesResult.data.sales || [] : [];
        const balance = salesResult.success ? salesResult.data.balance || {} : {};
        return {
          ...c,
          total_sales: balance.total_sales || 0,
          total_paid: balance.total_paid || 0,
          outstanding: balance.total_outstanding || 0,
          old_balance: balance.old_balance_net || 0,
          total_due: balance.total_due || 0,
          sales_count: sales.length,
        };
      });

      const customerData = await Promise.all(customerPromises);

      const currency = App.currency || 'PKR';
      const totalCustomers = customerData.length;
      const activeCount = customerData.filter(c => c.status === 'Active').length;
      const totalSales = customerData.reduce((s, c) => s + (c.total_sales || 0), 0);
      const totalPaid = customerData.reduce((s, c) => s + (c.total_paid || 0), 0);
      const totalOutstanding = customerData.reduce((s, c) => s + (c.outstanding || 0), 0);
      const totalOldBalance = customerData.reduce((s, c) => s + (c.old_balance || 0), 0);
      const totalCombinedDue = totalOutstanding + totalOldBalance;

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
        ],
        filters: {
          categories: ['Active', 'Inactive'],
          categoryLabel: 'Status'
        },
        landscape: false,
        showPrintOptions: true,
        subtitle: 'With related sales and payment history',
        summaryItems: [
          { label: 'Total Customers', value: totalCustomers },
          { label: 'Active Customers', value: activeCount },
          { label: 'Total Sales', value: Formatters.formatCurrency(totalSales, currency) },
          { label: 'Total Collected', value: Formatters.formatCurrency(totalPaid, currency) },
          { label: 'Total Remaining', value: Formatters.formatCurrency(totalOutstanding, currency) },
          { label: 'Total Old Balance', value: Formatters.formatCurrency(totalOldBalance, currency) },
          { label: 'Total Balance Due', value: Formatters.formatCurrency(totalCombinedDue, currency) },
        ],
        getCompanyHeader: () => LedgersPage.getCompanyHeader()
      });
    } catch (err) {
      Toast.error('Print error: ' + err.message);
    }
  },
};