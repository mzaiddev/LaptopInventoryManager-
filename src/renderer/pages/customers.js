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
                <th>Credit Limit</th>
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
                  <td>${Formatters.formatCurrency(c.credit_limit, App.currency)}</td>
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

  viewCustomer(id) {
    window.api.getCustomerById(id).then(async result => {
      if (!result.success || !result.data) {
        Toast.error("Failed to load customer.");
        return;
      }
      const c = result.data;
      let balance = { opening_balance: 0, total_sales: 0, total_paid: 0, outstanding_balance: 0 };
      try {
        const balRes = await window.api.getCustomerBalance(id);
        if (balRes.success) balance = balRes.data;
      } catch(e) {}

      const body = `
        <div class="ledger-details-grid">
          <div class="detail-field">
            <div class="detail-label">Customer Name</div>
            <div class="detail-value">${this.escapeHtml(c.customer_name)}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Phone</div>
            <div class="detail-value">${this.escapeHtml(c.phone) || '-'}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Address</div>
            <div class="detail-value">${this.escapeHtml(c.address) || '-'}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Email</div>
            <div class="detail-value">${this.escapeHtml(c.email) || '-'}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Credit Limit</div>
            <div class="detail-value">${Formatters.formatCurrency(c.credit_limit, App.currency)}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Status</div>
            <div class="detail-value"><span class="badge ${c.status === 'Active' ? 'badge-in-stock' : 'badge-lost'}">${c.status}</span></div>
          </div>
        </div>
        <div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border-color);">
          <h4 style="margin-bottom:12px;">Balance Summary</h4>
          <div class="ledger-stats-grid" style="grid-template-columns:repeat(4,1fr);">
            <div class="ledger-stat-card">
              <div class="stat-value">${Formatters.formatCurrency(balance.opening_balance, App.currency)}</div>
              <div class="stat-label">Opening Balance</div>
            </div>
            <div class="ledger-stat-card stat-success">
              <div class="stat-value">${Formatters.formatCurrency(balance.total_sales, App.currency)}</div>
              <div class="stat-label">Total Sales</div>
            </div>
            <div class="ledger-stat-card">
              <div class="stat-value">${Formatters.formatCurrency(balance.total_paid, App.currency)}</div>
              <div class="stat-label">Total Paid</div>
            </div>
            <div class="ledger-stat-card ${balance.outstanding_balance > 0 ? 'stat-danger' : 'stat-success'}">
              <div class="stat-value">${Formatters.formatCurrency(balance.outstanding_balance, App.currency)}</div>
              <div class="stat-label">Outstanding</div>
            </div>
          </div>
        </div>
        <div style="margin-top:16px;">
          <p style="color:var(--text-muted);font-size:13px;">${this.escapeHtml(c.notes) || 'No notes.'}</p>
        </div>
      `;

      const footer = `
        <button class="btn btn-secondary" onclick="window.Modal.close()">Close</button>
        <button class="btn btn-primary" onclick="window.Modal.close(); CustomersPage.editCustomer(${c.id})">Edit</button>
        <button class="btn btn-success" onclick="window.Modal.close(); App.navigate('sales'); SalesPage.selectCustomer(${c.id}, '${this.escapeHtml(c.customer_name)}')">New Sale</button>
      `;

      Modal.show({ title: `Customer - ${this.escapeHtml(c.customer_name)}`, body, footer, size: "lg" });
    }).catch(err => Toast.error(err.message));
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
            <label>Credit Limit</label>
            <input type="number" step="0.01" min="0" class="form-control" id="cf-credit" value="${c.credit_limit || 0}">
          </div>
          <div class="form-group">
            <label>Opening Balance</label>
            <input type="number" step="0.01" class="form-control" id="cf-balance" value="${c.opening_balance || 0}">
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
      credit_limit: parseFloat(document.getElementById("cf-credit")?.value) || 0,
      opening_balance: parseFloat(document.getElementById("cf-balance")?.value) || 0,
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