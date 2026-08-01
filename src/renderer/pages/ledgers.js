// Ledgers Page - PURE LEDGER MODULE
// Shows empty state by default. Search for a customer to view their ledger.
const LedgersPage = {
  currentCustomerId: null,
  currentCustomerName: null,

  async load() {
    const content = document.getElementById("page-content");
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Customer Ledger</h1>
          <p>Track customer payments, sales, and running balances</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="LedgersPage.printCustomerLedgerReport()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print Report
          </button>
        </div>
      </div>

      <!-- Customer Search & Selection -->
      <div class="card" style="margin-bottom:16px;">
        <div class="card-body">
          <div class="filters-bar" style="margin-bottom:12px;">
            <div class="search-box" style="flex:1;max-width:100%;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" id="ledger-customer-search" placeholder="🔍 Search customer by name or phone to view their ledger..." oninput="LedgersPage.onCustomerSearch()" autofocus>
            </div>
            <button class="btn btn-success" onclick="LedgersPage.showAddPaymentModal()" title="Add Payment to Ledger">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><polyline points="20 6 9 17 4 12"/></svg>
              Add Payment
            </button>
            <button class="btn btn-warning" onclick="LedgersPage.showAddOldBalanceModal()" title="Add Old Balance">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Old Balance
            </button>
          </div>

          <!-- Customer Search Results Dropdown -->
          <div id="ledger-customer-results" class="customer-search-results" style="position:relative;display:none;"></div>

          <!-- Selected Customer Info -->
          <div id="ledger-selected-customer-info" style="display:none;">
            <div class="selected-customer" style="margin-bottom:12px;">
              <span class="name" id="ledger-selected-customer-name"></span>
              <button class="remove-btn" onclick="LedgersPage.clearCustomerSelection()">&times;</button>
            </div>
            <!-- Balance Summary Cards - Clear Formula -->
            <div id="ledger-balance-cards" class="profile-balance-cards" style="margin-bottom:12px;">
              <div class="profile-balance-card success">
                <div class="pbc-value" id="ledger-total-sales">$0</div>
                <div class="pbc-label">Total Sales</div>
              </div>
              <div class="profile-balance-card">
                <div class="pbc-value" id="ledger-total-paid">$0</div>
                <div class="pbc-label">Total Paid</div>
              </div>
              <div class="profile-balance-card warning">
                <div class="pbc-value" id="ledger-old-balance">$0</div>
                <div class="pbc-label">Old Balance</div>
              </div>
              <div class="profile-balance-card danger" style="border:2px solid var(--danger);">
                <div class="pbc-value" id="ledger-total-due" style="font-size:18px;font-weight:800;">$0</div>
                <div class="pbc-label">Total Balance Due</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Ledger Entries Table -->
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border-color);">
          <h3 style="margin:0;font-size:15px;">Ledger Entries <span id="ledger-entries-subtitle" style="font-weight:400;font-size:13px;color:var(--text-muted);"></span></h3>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm btn-success" onclick="LedgersPage.showAddPaymentModal()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><polyline points="20 6 9 17 4 12"/></svg>
              Add Payment
            </button>
            <button class="btn btn-sm btn-warning" onclick="LedgersPage.showAddOldBalanceModal()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Old Balance
            </button>
          </div>
        </div>
        <div class="card-body">
          <div id="ledger-entries-table-container">
            <div class="empty-state">
              <h3>🔍 Search for a Customer</h3>
              <p>Use the search box above to find a customer and view their complete ledger with all transactions, payments, and running balance.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    // Load ALL ledger entries by default (show all customers)
    await this.loadAllLedgerEntries();

    // If a customer was pre-selected (e.g., from Sales page), load their data
    if (this.currentCustomerId) {
      await this.selectCustomerById(
        this.currentCustomerId,
        this.currentCustomerName,
      );
    }
  },

  async refresh() {
    if (this.currentCustomerId) {
      await this.loadCustomerBalance();
      await this.loadCustomerLedgerEntries();
    } else {
      await this.loadAllLedgerEntries();
    }
  },

  async loadAllLedgerEntries() {
    const container = document.getElementById("ledger-entries-table-container");
    if (!container) return;
    container.innerHTML =
      '<div class="loading"><div class="spinner"></div></div>';

    try {
      // Get all customers with ledger data
      const reportResult = await window.api.getCustomerLedgerReport();
      if (!reportResult.success) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${reportResult.error}</p></div>`;
        return;
      }

      const customers = reportResult.data || [];
      if (customers.length === 0) {
        container.innerHTML =
          '<div class="empty-state"><h3>No ledger entries</h3><p>Create a sale or add a payment to see ledger entries.</p></div>';
        return;
      }

      // Fetch ledger entries for each customer
      let allEntries = [];
      for (const c of customers) {
        const ledgerResult = await window.api.getCustomerLedger(c.customer_id);
        if (ledgerResult.success && ledgerResult.data) {
          const entries = ledgerResult.data.map((e) => ({
            ...e,
            customer_name: c.customer_name,
            customer_id: c.customer_id,
          }));
          allEntries = allEntries.concat(entries);
        }
      }

      // Sort by date descending
      allEntries.sort(
        (a, b) =>
          new Date(b.entry_date) - new Date(a.entry_date) || b.id - a.id,
      );

      this.allLedgerEntries = allEntries;
      this.filteredEntries = allEntries;
      this.renderLedgerTable(allEntries);
      document.getElementById("ledger-entries-subtitle").textContent =
        "- All Customers";
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  },

  onCustomerSearch() {
    clearTimeout(this._searchTimeout);
    const query =
      document.getElementById("ledger-customer-search")?.value?.trim() || "";

    if (query.length < 1) {
      document.getElementById("ledger-customer-results").style.display = "none";
      // Show all entries again
      this.filteredEntries = this.allLedgerEntries;
      this.renderLedgerTable(this.allLedgerEntries);
      document.getElementById("ledger-entries-subtitle").textContent =
        "- All Customers";
      return;
    }

    this._searchTimeout = setTimeout(async () => {
      try {
        const result = await window.api.searchCustomers(query);
        const container = document.getElementById("ledger-customer-results");
        if (result.success && result.data && result.data.length > 0) {
          container.innerHTML = result.data
            .map(
              (c) => `
            <div class="customer-search-item" onclick="LedgersPage.selectCustomerById(${c.id}, '${LedgersPage.escapeHtml(c.customer_name)}')">
              <div class="name">${LedgersPage.escapeHtml(c.customer_name)}</div>
              <div class="phone">${LedgersPage.escapeHtml(c.phone) || "No phone"}</div>
            </div>
          `,
            )
            .join("");
          container.style.display = "block";
        } else {
          container.innerHTML =
            '<div class="customer-search-item" style="color:var(--text-muted);">No customers found. <a href="#" onclick="App.navigate(\'customers\');return false;">Add a customer first</a></div>';
          container.style.display = "block";
        }
      } catch (err) {
        console.error(err);
      }
    }, 300);
  },

  async selectCustomerById(customerId, customerName) {
    this.currentCustomerId = customerId;
    this.currentCustomerName = customerName;

    // Hide search results
    document.getElementById("ledger-customer-results").style.display = "none";

    // Show selected customer info
    const infoDiv = document.getElementById("ledger-selected-customer-info");
    infoDiv.style.display = "block";
    document.getElementById("ledger-selected-customer-name").textContent =
      customerName || "Customer";
    document.getElementById("ledger-customer-search").value =
      customerName || "";

    // Update subtitle
    document.getElementById("ledger-entries-subtitle").textContent =
      `- ${this.escapeHtml(customerName || "Customer")}`;

    // Show loading in table
    const container = document.getElementById("ledger-entries-table-container");
    container.innerHTML =
      '<div class="loading"><div class="spinner"></div></div>';

    // Load balance and ledger entries
    await this.loadCustomerBalance();
    await this.loadCustomerLedgerEntries();
  },

  clearCustomerSelection() {
    this.currentCustomerId = null;
    this.currentCustomerName = null;
    document.getElementById("ledger-selected-customer-info").style.display =
      "none";
    document.getElementById("ledger-customer-search").value = "";
    document.getElementById("ledger-entries-subtitle").textContent = "";
    document.getElementById("ledger-entries-table-container").innerHTML = `
      <div class="empty-state">
        <h3>🔍 Search for a Customer</h3>
        <p>Use the search box above to find a customer and view their complete ledger.</p>
      </div>
    `;
  },

  async loadCustomerBalance() {
    if (!this.currentCustomerId) return;

    try {
      const result = await window.api.getCustomerLedgerSummary(
        this.currentCustomerId,
      );
      if (!result.success) return;

      const data = result.data;
      const currency = App.currency || "USD";

      document.getElementById("ledger-total-sales").textContent =
        Formatters.formatCurrency(data.total_sales || 0, currency);
      document.getElementById("ledger-total-paid").textContent =
        Formatters.formatCurrency(data.total_paid || 0, currency);

      const oldBalEl = document.getElementById("ledger-old-balance");
      oldBalEl.textContent = Formatters.formatCurrency(
        data.old_balance_net || 0,
        currency,
      );
      oldBalEl.style.color =
        (data.old_balance_net || 0) > 0
          ? "var(--danger)"
          : (data.old_balance_net || 0) < 0
            ? "var(--success)"
            : "var(--text-muted)";

      // Total Due = ledger_balance (SINGLE SOURCE OF TRUTH)
      const totalDue = data.total_due || 0;
      const totalEl = document.getElementById("ledger-total-due");
      totalEl.textContent = Formatters.formatCurrency(totalDue, currency);
      totalEl.style.color = totalDue > 0 ? "var(--danger)" : "var(--success)";
    } catch (err) {
      console.error(err);
    }
  },

  async loadCustomerLedgerEntries() {
    const container = document.getElementById("ledger-entries-table-container");
    if (!container || !this.currentCustomerId) return;

    try {
      const result = await window.api.getCustomerLedger(this.currentCustomerId);
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${result.error}</p></div>`;
        return;
      }

      const entries = result.data || [];
      if (entries.length === 0) {
        container.innerHTML =
          '<div class="empty-state"><h3>No ledger entries</h3><p>Create a sale or add a payment to see ledger entries for this customer.</p></div>';
        return;
      }

      this.renderLedgerTable(entries);
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  },

  renderLedgerTable(entries) {
    const container = document.getElementById("ledger-entries-table-container");
    if (!container) return;

    const currency = App.currency || "USD";

    container.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Description</th>
              <th style="text-align:right;">Debit (Owes)</th>
              <th style="text-align:right;">Credit (Paid)</th>
              <th style="text-align:right;" title="Running balance after this entry">Balance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${entries
              .map((e) => {
                const typeBadge = this.getLedgerTypeBadge(e.reference_type);
                return `
                <tr>
                  <td>${Formatters.formatDate(e.entry_date)}</td>
                  <td><span class="badge ${typeBadge}">${this.escapeHtml(e.reference_type)}</span></td>
                  <td style="font-size:13px;">${this.escapeHtml(e.description)}</td>
                  <td style="text-align:right;font-weight:600;color:var(--danger);">${e.debit > 0 ? Formatters.formatCurrency(e.debit, currency) : '-'}</td>
                  <td style="text-align:right;font-weight:600;color:var(--success);">${e.credit > 0 ? Formatters.formatCurrency(e.credit, currency) : '-'}</td>
                  <td style="text-align:right;font-weight:700;${e.running_balance > 0 ? 'color:var(--danger);' : 'color:var(--success);'}">${Formatters.formatCurrency(e.running_balance, currency)}</td>
                  <td>
                    <button class="btn btn-sm btn-danger" onclick="LedgersPage.deleteLedgerEntry(${e.id})" title="Delete Entry">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  },

  async deleteLedgerEntry(entryId) {
    const confirmed = confirm("Are you sure you want to delete this ledger entry? This action cannot be undone.");
    if (!confirmed) return;
    try {
      const result = await window.api.deleteLedgerEntry(entryId);
      if (result.success) {
        Toast.success("Ledger entry deleted successfully.");
        await this.refresh();
      } else {
        Toast.error(result.error || "Failed to delete entry.");
      }
    } catch (err) {
      Toast.error(err.message);
    }
  },

  getLedgerTypeBadge(type) {
    const badges = {
      Sale: "badge-outstanding",
      Payment: "badge-paid",
      Return: "badge-partial",
      OldBalanceDebit: "badge-damaged",
      OldBalanceCredit: "badge-in-stock",
      Adjustment: "badge-reserved",
    };
    return badges[type] || "badge-outstanding";
  },

  // ==================== ADD PAYMENT (with balance display) ====================

  showAddPaymentModal() {
    const formHtml = `
      <form id="ledger-payment-form" onsubmit="return false;">
        <div class="form-group">
          <label>Customer *</label>
          <select class="form-control" id="ledger-pay-customer" required onchange="LedgersPage.onPaymentCustomerChange()">
            <option value="">-- Select Customer --</option>
          </select>
        </div>
        <div id="ledger-pay-balance-info" style="display:none;margin-bottom:12px;padding:10px;background:var(--bg-secondary);border-radius:var(--radius);border:1px solid var(--border-color);">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:11px;">
            <div><span style="color:var(--text-muted);">Total Sales:</span> <span id="pay-info-sales" style="font-weight:700;">$0</span></div>
            <div><span style="color:var(--text-muted);">Total Paid:</span> <span id="pay-info-paid" style="font-weight:700;color:var(--success);">$0</span></div>
            <div><span style="color:var(--text-muted);">Old Balance:</span> <span id="pay-info-old" style="font-weight:700;">$0</span></div>
            <div><span style="color:var(--text-muted);">Total Due:</span> <span id="pay-info-due" style="font-weight:700;color:var(--danger);font-size:13px;">$0</span></div>
          </div>
        </div>
        <div class="form-group">
          <label>Payment Date</label>
          <input type="date" class="form-control" id="ledger-pay-date" value="${new Date().toISOString().split("T")[0]}">
        </div>
        <div class="form-group">
          <label>Amount *</label>
          <input type="number" step="0.01" min="0.01" class="form-control" id="ledger-pay-amount" required>
        </div>
        <div class="form-group">
          <label>Payment Method</label>
          <select class="form-control" id="ledger-pay-method">
            <option value="Cash">Cash</option>
            <option value="Bank">Bank</option>
            <option value="Online">Online</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>Description</label>
          <input type="text" class="form-control" id="ledger-pay-desc" placeholder="e.g. Payment received">
        </div>
      </form>
    `;

    Modal.showForm(
      "Add Payment to Ledger",
      formHtml,
      async () => {
        const customerId = parseInt(
          document.getElementById("ledger-pay-customer")?.value,
        );
        if (!customerId) {
          Toast.error("Please select a customer.");
          return;
        }
        const amount = parseFloat(
          document.getElementById("ledger-pay-amount")?.value,
        );
        if (!amount || amount <= 0) {
          Toast.error("Please enter a valid amount.");
          return;
        }
        try {
          const result = await window.api.addLedgerPayment({
            customer_id: customerId,
            amount: amount,
            payment_date:
              document.getElementById("ledger-pay-date")?.value ||
              new Date().toISOString().split("T")[0],
            payment_method:
              document.getElementById("ledger-pay-method")?.value || "Cash",
            description:
              document.getElementById("ledger-pay-desc")?.value?.trim() ||
              `Payment received - ${document.getElementById("ledger-pay-method")?.value || "Cash"}`,
          });
          if (result.success) {
            Toast.success("Payment recorded in ledger successfully.");
            Modal.close();
            // If viewing this customer, refresh
            if (this.currentCustomerId === customerId) {
              await this.loadCustomerBalance();
              await this.loadCustomerLedgerEntries();
            } else {
              // Select this customer
              const customerName =
                document
                  .getElementById("ledger-pay-customer")
                  .options[
                    document.getElementById("ledger-pay-customer").selectedIndex
                  ]?.text?.split(" - ")[0] || "Customer";
              await this.selectCustomerById(customerId, customerName);
            }
          } else {
            Toast.error(result.error || "Failed to record payment.");
          }
        } catch (err) {
          Toast.error(err.message);
        }
      },
      "sm",
    );

    // Load customers into the dropdown
    setTimeout(async () => {
      try {
        const result = await window.api.getAllCustomers({ limit: 5000 });
        if (!result.success) return;
        const customers = result.data?.customers || [];
        const select = document.getElementById("ledger-pay-customer");
        if (select) {
          select.innerHTML =
            '<option value="">-- Select Customer --</option>' +
            customers
              .map(
                (c) =>
                  `<option value="${c.id}" ${this.currentCustomerId === c.id ? "selected" : ""}>${this.escapeHtml(c.customer_name)}${c.phone ? " - " + this.escapeHtml(c.phone) : ""}</option>`,
              )
              .join("");
        }
        // If a customer is already selected, load their balance info
        if (this.currentCustomerId) {
          await this.loadPaymentBalanceInfo(this.currentCustomerId);
        }
      } catch (err) {}
    }, 100);
  },

  async onPaymentCustomerChange() {
    const select = document.getElementById("ledger-pay-customer");
    const customerId = select?.value ? parseInt(select.value) : null;
    if (customerId) {
      await this.loadPaymentBalanceInfo(customerId);
    } else {
      document.getElementById("ledger-pay-balance-info").style.display = "none";
    }
  },

  async loadPaymentBalanceInfo(customerId) {
    try {
      const result = await window.api.getCustomerLedgerSummary(customerId);
      if (!result.success) return;

      const data = result.data;
      const currency = App.currency || "USD";

      document.getElementById("pay-info-sales").textContent =
        Formatters.formatCurrency(data.total_sales || 0, currency);
      document.getElementById("pay-info-paid").textContent =
        Formatters.formatCurrency(data.total_paid || 0, currency);

      const oldBalEl = document.getElementById("pay-info-old");
      if (oldBalEl) {
        oldBalEl.textContent = Formatters.formatCurrency(
          data.old_balance_net || 0,
          currency,
        );
        oldBalEl.style.color =
          (data.old_balance_net || 0) > 0
            ? "var(--danger)"
            : (data.old_balance_net || 0) < 0
              ? "var(--success)"
              : "var(--text-muted)";
      }

      const totalDue = data.total_due || 0;
      const totalEl = document.getElementById("pay-info-due");
      totalEl.textContent = Formatters.formatCurrency(totalDue, currency);
      totalEl.style.color = totalDue > 0 ? "var(--danger)" : "var(--success)";

      document.getElementById("ledger-pay-balance-info").style.display =
        "block";
    } catch (err) {
      console.error(err);
    }
  },

  // ==================== ADD OLD BALANCE ====================

  showAddOldBalanceModal() {
    const formHtml = `
      <form id="ledger-old-balance-form" onsubmit="return false;">
        <div class="form-group">
          <label>Customer *</label>
          <select class="form-control" id="ledger-ob-customer" required onchange="LedgersPage.onOldBalanceCustomerChange()">
            <option value="">-- Select Customer --</option>
          </select>
        </div>
        <div id="ledger-ob-balance-info" style="display:none;margin-bottom:12px;padding:10px;background:var(--bg-secondary);border-radius:var(--radius);border:1px solid var(--border-color);">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:11px;">
            <div><span style="color:var(--text-muted);">Total Sales:</span> <span id="ob-info-sales" style="font-weight:700;">$0</span></div>
            <div><span style="color:var(--text-muted);">Total Paid:</span> <span id="ob-info-paid" style="font-weight:700;color:var(--success);">$0</span></div>
            <div><span style="color:var(--text-muted);">Old Balance:</span> <span id="ob-info-old" style="font-weight:700;">$0</span></div>
            <div><span style="color:var(--text-muted);">Total Due:</span> <span id="ob-info-due" style="font-weight:700;color:var(--danger);font-size:13px;">$0</span></div>
          </div>
        </div>
        <div class="form-group">
          <label>Amount *</label>
          <input type="number" step="0.01" class="form-control" id="ledger-ob-amount" required placeholder="Enter amount">
        </div>
        <div class="form-group">
          <label>Balance Type</label>
          <select class="form-control" id="ledger-ob-type">
            <option value="Debit">Debit (Customer Owes)</option>
            <option value="Credit">Credit (You Owe Customer)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Date</label>
          <input type="date" class="form-control" id="ledger-ob-date" value="${new Date().toISOString().split("T")[0]}">
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea class="form-control" id="ledger-ob-notes" rows="2" placeholder="Optional notes about this old balance..."></textarea>
        </div>
      </form>
    `;

    Modal.showForm(
      "Add Old Balance",
      formHtml,
      async () => {
        const customerId = parseInt(
          document.getElementById("ledger-ob-customer")?.value,
        );
        if (!customerId) {
          Toast.error("Please select a customer.");
          return;
        }
        const amount = Math.abs(
          parseFloat(document.getElementById("ledger-ob-amount")?.value) || 0,
        );
        if (amount <= 0) {
          Toast.error("Please enter a valid amount.");
          return;
        }
        const balanceType =
          document.getElementById("ledger-ob-type")?.value || "Debit";
        try {
          const result = await window.api.addLedgerOldBalance({
            customer_id: customerId,
            amount: amount,
            balance_type: balanceType,
            notes:
              document.getElementById("ledger-ob-notes")?.value?.trim() || "",
            entry_date:
              document.getElementById("ledger-ob-date")?.value ||
              new Date().toISOString().split("T")[0],
          });
          if (result.success) {
            Toast.success("Old balance added to ledger successfully.");
            Modal.close();
            if (this.currentCustomerId === customerId) {
              await this.loadCustomerBalance();
              await this.loadCustomerLedgerEntries();
            } else {
              const customerName =
                document
                  .getElementById("ledger-ob-customer")
                  .options[
                    document.getElementById("ledger-ob-customer").selectedIndex
                  ]?.text?.split(" - ")[0] || "Customer";
              await this.selectCustomerById(customerId, customerName);
            }
          } else {
            Toast.error(result.error || "Failed to add old balance.");
          }
        } catch (err) {
          Toast.error(err.message);
        }
      },
      "sm",
    );

    setTimeout(async () => {
      try {
        const result = await window.api.getAllCustomers({ limit: 5000 });
        if (!result.success) return;
        const customers = result.data?.customers || [];
        const select = document.getElementById("ledger-ob-customer");
        if (select) {
          select.innerHTML =
            '<option value="">-- Select Customer --</option>' +
            customers
              .map(
                (c) =>
                  `<option value="${c.id}" ${this.currentCustomerId === c.id ? "selected" : ""}>${this.escapeHtml(c.customer_name)}${c.phone ? " - " + this.escapeHtml(c.phone) : ""}</option>`,
              )
              .join("");
        }
        // If a customer is already selected, load their balance info
        if (this.currentCustomerId) {
          await this.loadOldBalanceInfo(this.currentCustomerId);
        }
      } catch (err) {}
    }, 100);
  },

  async onOldBalanceCustomerChange() {
    const select = document.getElementById("ledger-ob-customer");
    const customerId = select?.value ? parseInt(select.value) : null;
    if (customerId) {
      await this.loadOldBalanceInfo(customerId);
    } else {
      document.getElementById("ledger-ob-balance-info").style.display = "none";
    }
  },

  async loadOldBalanceInfo(customerId) {
    try {
      const result = await window.api.getCustomerLedgerSummary(customerId);
      if (!result.success) return;

      const data = result.data;
      const currency = App.currency || "USD";

      document.getElementById("ob-info-sales").textContent =
        Formatters.formatCurrency(data.total_sales || 0, currency);
      document.getElementById("ob-info-paid").textContent =
        Formatters.formatCurrency(data.total_paid || 0, currency);

      const oldBalEl = document.getElementById("ob-info-old");
      if (oldBalEl) {
        oldBalEl.textContent = Formatters.formatCurrency(
          data.old_balance_net || 0,
          currency,
        );
        oldBalEl.style.color =
          (data.old_balance_net || 0) > 0
            ? "var(--danger)"
            : (data.old_balance_net || 0) < 0
              ? "var(--success)"
              : "var(--text-muted)";
      }

      const totalDue = data.total_due || 0;
      const totalEl = document.getElementById("ob-info-due");
      totalEl.textContent = Formatters.formatCurrency(totalDue, currency);
      totalEl.style.color = totalDue > 0 ? "var(--danger)" : "var(--success)";

      document.getElementById("ledger-ob-balance-info").style.display = "block";
    } catch (err) {
      console.error(err);
    }
  },

  // ==================== PRINT FUNCTIONS ====================

  async printCustomerLedgerReport() {
    try {
      const result = await window.api.getCustomerLedgerReport();
      if (!result.success) {
        Toast.error("Failed to load ledger data.");
        return;
      }
      const data = result.data || [];
      if (data.length === 0) {
        Toast.warning("No customer ledger data to print.");
        return;
      }

      const currency = App.currency || "PKR";
      const totalBalance = data.reduce(
        (s, c) => s + (c.ledger_balance || 0),
        0,
      );
      const totalOutstanding = data.reduce(
        (s, c) => s + (c.sale_outstanding || 0),
        0,
      );

      PrintService.showPrintDialog({
        title: "Customer Ledger Report",
        data: data,
        columns: [
          { field: "customer_name", label: "Customer", width: "150px" },
          { field: "phone", label: "Phone", width: "100px" },
          {
            field: "ledger_balance",
            label: "Ledger Balance",
            width: "80px",
            align: "right",
            format: "currency",
          },
          {
            field: "sale_outstanding",
            label: "Sale Outstanding",
            width: "80px",
            align: "right",
            format: "currency",
          },
        ],
        landscape: true,
        showPrintOptions: true,
        subtitle: "Complete ledger summary for all customers",
        summaryItems: [
          { label: "Total Customers", value: data.length },
          {
            label: "Total Ledger Balance",
            value: Formatters.formatCurrency(totalBalance, currency),
          },
          {
            label: "Total Outstanding",
            value: Formatters.formatCurrency(totalOutstanding, currency),
          },
          {
            label: "Grand Total Due",
            value: Formatters.formatCurrency(
              totalBalance + totalOutstanding,
              currency,
            ),
          },
        ],
        getCompanyHeader: () => this.getCompanyHeader(),
      });
    } catch (err) {
      Toast.error("Print error: " + err.message);
    }
  },

  async getCompanyHeader() {
    try {
      const result = await window.api.getSettings();
      if (result.success) {
        return {
          shopName: result.data.shop_name || "Laptop Inventory Manager",
          address: result.data.shop_address || "",
          phone: result.data.phone_number || "",
          email: result.data.email || "",
        };
      }
    } catch (e) {}
    return {
      shopName: "Laptop Inventory Manager",
      address: "",
      phone: "",
      email: "",
    };
  },

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};
