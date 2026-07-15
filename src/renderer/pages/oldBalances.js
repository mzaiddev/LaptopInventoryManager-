// Old Balances Page
const OldBalancesPage = {
  currentFilters: {
    search: "",
    balance_type: "",
    page: 1,
    limit: 50,
  },

  async load() {
    const content = document.getElementById("page-content");
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Old Balances</h1>
          <p>Manage pre-existing customer balances from before using this software</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" onclick="OldBalancesPage.openPrintDialog()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print
          </button>
          <button class="btn btn-primary" onclick="OldBalancesPage.showAddOldBalance()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Old Balance
          </button>
        </div>
      </div>
      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px;" id="ob-stats">
        <div class="stat-card"><div class="stat-label">Total Old Debit</div><div class="stat-value" style="display:flex;align-items:center;justify-content:center;padding:10px;"><div class="spinner" style="width:20px;height:20px;"></div></div></div>
        <div class="stat-card"><div class="stat-label">Total Old Credit</div><div class="stat-value" style="display:flex;align-items:center;justify-content:center;padding:10px;"><div class="spinner" style="width:20px;height:20px;"></div></div></div>
        <div class="stat-card"><div class="stat-label">Customers with Old Balances</div><div class="stat-value" style="display:flex;align-items:center;justify-content:center;padding:10px;"><div class="spinner" style="width:20px;height:20px;"></div></div></div>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="filters-bar">
            <div class="search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" id="ob-search" placeholder="Search by customer name, phone, notes..." oninput="OldBalancesPage.onSearch()">
            </div>
            <div class="filter-group">
              <select id="filter-ob-type" onchange="OldBalancesPage.onFilter()">
                <option value="">All Types</option>
                <option value="Debit">Debit (Customer Owes)</option>
                <option value="Credit">Credit (You Owe Customer)</option>
              </select>
            </div>
          </div>
          <div id="old-balances-table-container"><div class="loading"><div class="spinner"></div></div></div>
          <div id="old-balances-pagination"></div>
        </div>
      </div>
    `;
    await this.refresh();
  },

  async refresh() {
    await this.loadStats();
    await this.loadOldBalances();
  },

  async loadStats() {
    try {
      const result = await window.api.getOldBalanceSummary();
      if (!result.success) return;
      const d = result.data;
      const currency = App.currency || 'USD';
      const statsContainer = document.getElementById('ob-stats');
      if (!statsContainer) return;
      statsContainer.innerHTML = `
        <div class="stat-card">
          <div class="stat-icon red">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <div class="stat-value">${Formatters.formatCurrency(d.total_debit, currency)}</div>
          <div class="stat-label">Total Old Debit (Customer Owes)</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon yellow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <div class="stat-value">${Formatters.formatCurrency(d.total_credit, currency)}</div>
          <div class="stat-label">Total Old Credit (You Owe)</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            </svg>
          </div>
          <div class="stat-value">${d.total_customers}</div>
          <div class="stat-label">Customers with Old Balances (${d.total_records} records)</div>
        </div>
      `;
    } catch (err) {
      console.error("Error loading old balance stats:", err);
    }
  },

  async refreshTable() {
    await this.loadOldBalances();
  },

  async loadOldBalances() {
    const container = document.getElementById("old-balances-table-container");
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const result = await window.api.getAllOldBalances(this.currentFilters);
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${result.error}</p></div>`;
        return;
      }

      const data = result.data;
      if (!data.balances || data.balances.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No old balances found</h3><p>Add your first old balance record to get started. Old balances track pre-existing customer debts before using this software.</p></div>';
        return;
      }

      const currency = App.currency || 'USD';

      container.innerHTML = `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Amount</th>
                <th>Type</th>
                <th>Notes</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.balances.map(b => {
                const isDebit = b.balance_type === 'Debit';
                return `
                <tr>
                  <td><strong>${this.escapeHtml(b.customer_name) || 'Unknown'}</strong></td>
                  <td>${this.escapeHtml(b.phone) || '-'}</td>
                  <td style="font-weight:600;color:${isDebit ? 'var(--danger)' : 'var(--success)'};">${isDebit ? '' : ''}${Formatters.formatCurrency(b.amount, currency)}</td>
                  <td><span class="badge ${isDebit ? 'badge-damaged' : 'badge-in-stock'}">${isDebit ? 'Debit (Owes)' : 'Credit (Owed)'}</span></td>
                  <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.escapeHtml(b.notes) || '-'}</td>
                  <td>${Formatters.formatDate(b.created_at)}</td>
                  <td>
                    <div class="action-buttons">
                      <button class="btn btn-sm btn-success" onclick="OldBalancesPage.editOldBalance(${b.id})" title="Edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button class="btn btn-sm btn-danger" onclick="OldBalancesPage.deleteOldBalance(${b.id})" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              `}).join('')}
            </tbody>
          </table>
        </div>
      `;

      // Pagination
      const paginationContainer = document.getElementById("old-balances-pagination");
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
        <button ${data.page <= 1 ? 'disabled' : ''} onclick="OldBalancesPage.goToPage(${data.page - 1})">Prev</button>
        ${pages.map(p => `<button class="${p === data.page ? 'active' : ''}" onclick="OldBalancesPage.goToPage(${p})">${p}</button>`).join('')}
        <button ${data.page >= data.totalPages ? 'disabled' : ''} onclick="OldBalancesPage.goToPage(${data.page + 1})">Next</button>
        <span class="pagination-info">${data.total} total</span>
      </div>
    `;
  },

  goToPage(page) {
    this.currentFilters.page = page;
    this.loadOldBalances();
  },

  onSearch() {
    clearTimeout(this._searchTimeout);
    this._searchTimeout = setTimeout(() => {
      this.currentFilters.search = document.getElementById("ob-search")?.value?.trim() || "";
      this.currentFilters.page = 1;
      this.loadOldBalances();
    }, 300);
  },

  onFilter() {
    this.currentFilters.balance_type = document.getElementById("filter-ob-type")?.value || "";
    this.currentFilters.page = 1;
    this.loadOldBalances();
  },

  async loadCustomersForSelect() {
    try {
      const result = await window.api.getAllCustomers({ limit: 5000 });
      if (result.success && result.data && result.data.customers) {
        return result.data.customers;
      }
      return [];
    } catch (err) {
      return [];
    }
  },

  async showAddOldBalance() {
    const customers = await this.loadCustomersForSelect();
    const customerOptions = customers.map(c =>
      `<option value="${c.id}">${this.escapeHtml(c.customer_name)}${c.phone ? ' - ' + this.escapeHtml(c.phone) : ''}</option>`
    ).join('');

    Modal.showForm("Add Old Balance", `
      <form id="ob-form" onsubmit="return false;">
        <div class="form-group">
          <label>Customer *</label>
          <select class="form-control" id="obf-customer" required>
            <option value="">Select Customer</option>
            ${customerOptions}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Amount *</label>
            <input type="number" step="0.01" min="0" class="form-control" id="obf-amount" value="" required placeholder="0.00">
          </div>
          <div class="form-group">
            <label>Balance Type *</label>
            <select class="form-control" id="obf-type">
              <option value="Debit">Debit (Customer Owes You)</option>
              <option value="Credit">Credit (You Owe Customer)</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea class="form-control" id="obf-notes" rows="3" placeholder="e.g., Old balance from previous system, balance carried forward..."></textarea>
        </div>
      </form>
    `, async () => {
      const customerId = parseInt(document.getElementById("obf-customer")?.value);
      const amount = parseFloat(document.getElementById("obf-amount")?.value) || 0;
      const balanceType = document.getElementById("obf-type")?.value || "Debit";
      const notes = document.getElementById("obf-notes")?.value?.trim() || "";

      if (!customerId) {
        Toast.error("Please select a customer.");
        return;
      }
      if (amount <= 0) {
        Toast.error("Amount must be greater than zero.");
        return;
      }

      try {
        const result = await window.api.addOldBalance({
          customer_id: customerId,
          amount,
          balance_type: balanceType,
          notes,
        });
        if (result.success) {
          Toast.success("Old balance added successfully.");
          Modal.close();
          await this.refresh();
        } else {
          Toast.error(result.error || "Failed to add old balance.");
        }
      } catch (err) {
        Toast.error(err.message);
      }
    }, "md");
  },

  async editOldBalance(id) {
    try {
      const result = await window.api.getOldBalanceById(id);
      if (!result.success || !result.data) {
        Toast.error("Failed to load old balance.");
        return;
      }

      const ob = result.data;
      const customers = await this.loadCustomersForSelect();
      const customerOptions = customers.map(c =>
        `<option value="${c.id}" ${c.id === ob.customer_id ? 'selected' : ''}>${this.escapeHtml(c.customer_name)}${c.phone ? ' - ' + this.escapeHtml(c.phone) : ''}</option>`
      ).join('');

      Modal.showForm("Edit Old Balance", `
        <form id="ob-form" onsubmit="return false;">
          <div class="form-group">
            <label>Customer *</label>
            <select class="form-control" id="obf-customer" required>
              <option value="">Select Customer</option>
              ${customerOptions}
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Amount *</label>
              <input type="number" step="0.01" min="0" class="form-control" id="obf-amount" value="${ob.amount}" required placeholder="0.00">
            </div>
            <div class="form-group">
              <label>Balance Type *</label>
              <select class="form-control" id="obf-type">
                <option value="Debit" ${ob.balance_type === 'Debit' ? 'selected' : ''}>Debit (Customer Owes You)</option>
                <option value="Credit" ${ob.balance_type === 'Credit' ? 'selected' : ''}>Credit (You Owe Customer)</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Notes</label>
            <textarea class="form-control" id="obf-notes" rows="3">${this.escapeHtml(ob.notes || '')}</textarea>
          </div>
        </form>
      `, async () => {
        const customerId = parseInt(document.getElementById("obf-customer")?.value);
        const amount = parseFloat(document.getElementById("obf-amount")?.value) || 0;
        const balanceType = document.getElementById("obf-type")?.value || "Debit";
        const notes = document.getElementById("obf-notes")?.value?.trim() || "";

        if (!customerId) {
          Toast.error("Please select a customer.");
          return;
        }
        if (amount <= 0) {
          Toast.error("Amount must be greater than zero.");
          return;
        }

        try {
          const updateResult = await window.api.updateOldBalance(id, {
            customer_id: customerId,
            amount,
            balance_type: balanceType,
            notes,
          });
          if (updateResult.success) {
            Toast.success("Old balance updated successfully.");
            Modal.close();
            await this.refresh();
          } else {
            Toast.error(updateResult.error || "Failed to update old balance.");
          }
        } catch (err) {
          Toast.error(err.message);
        }
      }, "md");
    } catch (err) {
      Toast.error(err.message);
    }
  },

  deleteOldBalance(id) {
    Modal.showConfirm(
      "Delete Old Balance",
      "Are you sure you want to delete this old balance record? This action cannot be undone.",
      async () => {
        try {
          const result = await window.api.deleteOldBalance(id);
          if (result.success) {
            Toast.success("Old balance deleted successfully.");
            await this.refresh();
          } else {
            Toast.error(result.error || "Failed to delete old balance.");
          }
        } catch (err) {
          Toast.error(err.message);
        }
      }
    );
  },

  async openPrintDialog() {
    try {
      const result = await window.api.getAllOldBalances({ limit: 5000 });
      if (!result.success) {
        Toast.error('Failed to load data.');
        return;
      }
      const data = result.data?.balances || [];
      if (data.length === 0) {
        Toast.warning('No old balance records to print.');
        return;
      }

      PrintService.showPrintDialog({
        title: 'Old Balances Report',
        data: data,
        columns: [
          { field: 'customer_name', label: 'Customer', width: '120px' },
          { field: 'phone', label: 'Phone', width: '100px' },
          { field: 'amount', label: 'Amount', width: '80px', align: 'right', format: 'currency' },
          { field: 'balance_type', label: 'Type', width: '60px' },
          { field: 'notes', label: 'Notes', width: '150px' },
          { field: 'created_at', label: 'Date', width: '80px', format: 'date' },
        ],
        landscape: false,
        showPrintOptions: true,
        subtitle: 'Pre-existing customer balances from before using this software',
        getCompanyHeader: () => LedgersPage.getCompanyHeader()
      });
    } catch (err) {
      Toast.error('Print error: ' + err.message);
    }
  },

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
};
