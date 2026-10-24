// Sales Page - Create New Sale/Issue with discounts and Cash / Bank Transfer payment.
// When a sale is created, the ledger is auto-generated in the backend.
const SalesPage = {
  selectedCustomer: null,
  selectedProducts: [],
  allProducts: [],
  searchTimeout: null,

  async load() {
    this.selectedCustomer = null;
    this.selectedProducts = [];
    const content = document.getElementById("page-content");
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>New Sale / Issue</h1>
          <p>Record products sold or issued to a customer. Ledger is created automatically.</p>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <form id="sale-form" class="sale-form" onsubmit="return false;">
            <!-- Section 1: Customer Selection -->
            <div class="form-section">
              <h3>1. Select Customer</h3>
              <div class="customer-search-container">
                <div class="search-box" style="max-width:100%;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input type="text" id="sale-customer-search" placeholder="Search customer by name, phone, or address..." oninput="SalesPage.onCustomerSearch()">
                </div>
                <div id="sale-customer-results" class="customer-search-results"></div>
              </div>
              <div id="sale-selected-customer"></div>
              <button type="button" class="btn btn-sm btn-secondary" onclick="SalesPage.showQuickAddCustomer()" style="margin-top:8px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Quick Add Customer
              </button>
            </div>

            <!-- Section 2: Transaction Details -->
            <div class="form-section">
              <h3>2. Transaction Details</h3>
              <div class="form-row">
                <div class="form-group">
                  <label>Date</label>
                  <input type="date" class="form-control" id="sale-date" value="${new Date().toISOString().split("T")[0]}">
                </div>
                <div class="form-group">
                  <label>Type</label>
                  <select class="form-control" id="sale-type">
                    <option value="Sale">Sale</option>
                    <option value="Issue">Issue</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Payment Terms</label>
                  <select class="form-control" id="sale-ledger-type" onchange="SalesPage.onLedgerTypeChange()">
                    <option value="Cash">Full Payment</option>
                    <option value="Loan">Loan (Remaining Balance)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Paid Via</label>
                  <select class="form-control" id="sale-pay-method">
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
                <div class="form-group" id="sale-paid-amount-group" style="display:none;">
                  <label>Initial Payment</label>
                  <input type="number" step="0.01" min="0" class="form-control" id="sale-paid-amount" value="0" placeholder="Amount paid now">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group" style="flex:2;">
                  <label>Notes (Optional)</label>
                  <input type="text" class="form-control" id="sale-notes" placeholder="Any notes about this transaction...">
                </div>
              </div>
            </div>

            <!-- Section 3: Products -->
            <div class="form-section">
              <h3>3. Select Products</h3>
              <div id="sale-products-container">
                <div class="product-row-header">
                  <span class="prd-col">Product</span>
                  <span class="qty-col">Qty</span>
                  <span class="price-col">Unit Price</span>
                  <span class="disc-col">Discount</span>
                  <span class="sub-col">Subtotal</span>
                  <span class="act-col"></span>
                </div>
                <div id="sale-products-list"></div>
              </div>
              <button type="button" class="btn btn-sm btn-secondary add-product-btn" onclick="SalesPage.addProductRow()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Product
              </button>
            </div>

            <!-- Summary -->
            <div class="sale-summary" id="sale-summary">
              <div class="summary-row">
                <span>Total Items</span>
                <span id="sale-total-items">0</span>
              </div>
              <div class="summary-row">
                <span>Total Quantity</span>
                <span id="sale-total-qty">0</span>
              </div>
              <div class="summary-row">
                <span>Subtotal</span>
                <span id="sale-subtotal">0</span>
              </div>
              <div class="summary-row">
                <span>Discount on whole sale</span>
                <span style="display:flex;gap:6px;">
                  <select class="form-control" id="sale-disc-type" onchange="SalesPage.updateSummary()" style="width:110px;">
                    <option value="none">None</option>
                    <option value="amount">Amount</option>
                    <option value="percent">Percent %</option>
                  </select>
                  <input type="number" min="0" step="0.01" class="form-control" id="sale-disc-value" value="0" oninput="SalesPage.updateSummary()" style="width:110px;">
                </span>
              </div>
              <div class="summary-row total">
                <span>Total Amount</span>
                <span id="sale-total-amount">0</span>
              </div>
              <div class="form-error" id="sale-summary-error"></div>
            </div>

            <!-- Submit -->
            <div style="margin-top:20px;display:flex;gap:12px;justify-content:flex-end;">
              <button type="button" class="btn btn-secondary" onclick="App.navigate('sales-history')">Cancel</button>
              <button type="button" class="btn btn-primary" onclick="SalesPage.submitSale()" id="sale-submit-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><polyline points="20 6 9 17 4 12"/></svg>
                Save Transaction
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    await this.loadProducts();
    this.addProductRow();
  },

  async loadProducts() {
    try {
      const result = await window.api.getProducts({
        limit: 1000,
        status: "In Stock",
      });
      if (result.success) {
        this.allProducts = result.data.products || [];
      }
    } catch (err) {
      console.error("Failed to load products:", err);
    }
  },

  selectCustomer(id, name) {
    this.selectedCustomer = { id, name };
    document.getElementById("sale-selected-customer").innerHTML = `
      <div class="selected-customer">
        <span class="name">${this.escapeHtml(name)}</span>
        <span id="sale-customer-balance" style="font-size:12px;margin-left:12px;font-weight:600;"></span>
        <button type="button" class="remove-btn" onclick="SalesPage.removeCustomer()">&times;</button>
      </div>
    `;
    document.getElementById("sale-customer-search").value = name;
    document.getElementById("sale-customer-results").classList.remove("show");
    
    // Load customer's current balance
    this.loadCustomerBalance(id);
  },

  async loadCustomerBalance(customerId) {
    try {
      const result = await window.api.getCustomerLedgerSummary(customerId);
      if (!result.success) return;
      const data = result.data;
      const currency = App.currency || 'USD';
      const balanceEl = document.getElementById("sale-customer-balance");
      if (balanceEl) {
        const totalDue = data.total_due || 0;
        if (totalDue > 0) {
          balanceEl.innerHTML = `<span style="color:var(--danger);">Balance Due: ${Formatters.formatCurrency(totalDue, currency)}</span>`;
        } else if (totalDue === 0) {
          balanceEl.innerHTML = `<span style="color:var(--success);">Balance: ${Formatters.formatCurrency(0, currency)}</span>`;
        }
      }
    } catch (err) {
      console.error(err);
    }
  },

  removeCustomer() {
    this.selectedCustomer = null;
    document.getElementById("sale-selected-customer").innerHTML = "";
    document.getElementById("sale-customer-search").value = "";
  },

  onCustomerSearch() {
    clearTimeout(this.searchTimeout);
    const query = document.getElementById("sale-customer-search")?.value?.trim() || "";
    if (query.length < 1) {
      document.getElementById("sale-customer-results").classList.remove("show");
      return;
    }

    this.searchTimeout = setTimeout(async () => {
      try {
        const result = await window.api.searchCustomers(query);
        const container = document.getElementById("sale-customer-results");
        if (result.success && result.data && result.data.length > 0) {
          container.innerHTML = result.data
            .map(
              (c) => `
            <div class="customer-search-item" data-id="${c.id}" data-name="${this.escapeHtml(c.customer_name)}" onclick="SalesPage.selectCustomer(Number(this.dataset.id), this.dataset.name)">
              <div class="name">${this.escapeHtml(c.customer_name)}</div>
              <div class="phone">${this.escapeHtml(c.phone) || "No phone"}</div>
            </div>
          `,
            )
            .join("");
          container.classList.add("show");
        } else {
          container.innerHTML =
            '<div class="customer-search-item" style="color:var(--text-muted);">No customers found.</div>';
          container.classList.add("show");
        }
      } catch (err) {
        console.error("Search error:", err);
      }
    }, 200);
  },

  showQuickAddCustomer() {
    const formHtml = `
      <form id="quick-customer-form" onsubmit="return false;">
        <div class="form-group">
          <label>Customer Name *</label>
          <input type="text" class="form-control" id="qcf-name" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Phone</label>
            <input type="text" class="form-control" id="qcf-phone">
          </div>
          <div class="form-group">
            <label>Address</label>
            <input type="text" class="form-control" id="qcf-address">
          </div>
        </div>
      </form>
    `;

    Modal.showForm(
      "Add New Customer",
      formHtml,
      async () => {
        const name = document.getElementById("qcf-name")?.value?.trim();
        if (!name) {
          Toast.error("Customer name is required.");
          return;
        }
        try {
          const result = await window.api.addCustomer({
            customer_name: name,
            phone: document.getElementById("qcf-phone")?.value?.trim() || "",
            address: document.getElementById("qcf-address")?.value?.trim() || "",
          });
          if (result.success) {
            Toast.success("Customer added successfully.");
            Modal.close();
            this.selectCustomer(result.data.id, name);
          } else {
            Toast.error(result.error || "Failed to add customer.");
          }
        } catch (err) {
          Toast.error(err.message);
        }
      },
      "sm",
    );
  },

  onLedgerTypeChange() {
    const type = document.getElementById("sale-ledger-type")?.value;
    const group = document.getElementById("sale-paid-amount-group");
    if (type === "Loan") {
      group.style.display = "block";
    } else {
      group.style.display = "none";
    }
  },

  addProductRow(product = null) {
    const container = document.getElementById("sale-products-list");
    const index = this.selectedProducts.length;
    const options = this.allProducts
      .map(
        (p) =>
          `<option value="${p.id}" data-price="${p.selling_price}" data-name="${this.escapeHtml(p.product_name)}" ${product && product.id === p.id ? "selected" : ""}>${this.escapeHtml(p.product_name)} (Qty: ${p.quantity})</option>`,
      )
      .join("");

    const row = document.createElement("div");
    row.className = "product-row";
    row.dataset.index = index;
    row.innerHTML = `
      <div class="product-row-fields">
        <div class="prd-col">
          <select class="form-control" onchange="SalesPage.onProductSelect(${index})" style="font-size:13px;width:100%;">
            <option value="">-- Select Product --</option>
            ${options}
          </select>
        </div>
        <div class="qty-col">
          <input type="number" min="1" value="${product ? product.qty : 1}" class="form-control" onchange="SalesPage.updateRow(${index})" style="font-size:13px;text-align:center;width:100%;">
        </div>
        <div class="price-col">
          <input type="number" step="0.01" min="0" value="${product ? product.price : 0}" class="form-control" onchange="SalesPage.updateRow(${index})" style="font-size:13px;text-align:right;width:100%;">
        </div>
        <div class="disc-col" style="display:flex;gap:2px;">
          <input type="number" step="0.01" min="0" value="0" class="form-control" onchange="SalesPage.updateRow(${index})" style="font-size:13px;text-align:right;min-width:0;flex:1;">
          <select class="form-control" onchange="SalesPage.updateRow(${index})" style="font-size:12px;width:52px;padding:2px;" title="Discount as an amount or a percent">
            <option value="amount">Amt</option>
            <option value="percent">%</option>
          </select>
        </div>
        <div class="sub-col" style="font-size:14px;font-weight:600;text-align:right;padding:8px 4px;">0</div>
        <div class="act-col">
          <button type="button" class="remove-item-btn" onclick="SalesPage.removeProductRow(${index})" title="Remove">&times;</button>
        </div>
      </div>
    `;

    container.appendChild(row);
    this.selectedProducts.push({
      id: null,
      name: "",
      qty: 1,
      price: 0,
      discount: 0,
      subtotal: 0,
    });

    if (product) {
      this.selectedProducts[index] = {
        id: product.id,
        name: product.name,
        qty: product.qty,
        price: product.price,
        subtotal: product.qty * product.price,
      };
      this.updateRow(index);
    }

    this.updateSummary();
  },

  onProductSelect(index) {
    const row = document.querySelector(`.product-row[data-index="${index}"]`);
    if (!row) return;
    const select = row.querySelector("select");
    const option = select.options[select.selectedIndex];
    const inputs = row.querySelectorAll("input");
    const priceInput = inputs[1];
    const qtyInput = inputs[0];

    if (option && option.value) {
      const price = parseFloat(option.dataset.price) || 0;
      const name = option.dataset.name;
      priceInput.value = price;
      this.selectedProducts[index] = {
        id: parseInt(option.value),
        name: name,
        qty: parseInt(qtyInput.value) || 1,
        price: price,
        subtotal: (parseInt(qtyInput.value) || 1) * price,
      };
    } else {
      this.selectedProducts[index] = {
        id: null,
        name: "",
        qty: 1,
        price: 0,
        subtotal: 0,
      };
    }
    this.updateRow(index);
    this.updateSummary();
  },

  updateRow(index) {
    const row = document.querySelector(`.product-row[data-index="${index}"]`);
    if (!row) return;
    const inputs = row.querySelectorAll("input");
    const qty = parseInt(inputs[0].value) || 0;
    const price = parseFloat(inputs[1].value) || 0;
    const discValue = parseFloat(inputs[2].value) || 0;
    const percent = row.querySelector(".disc-col select").value === "percent";
    // The server only sees the amount; percent is converted here.
    const discount = percent ? Math.round(qty * price * discValue) / 100 : discValue;
    const subtotal = qty * price - discount;
    const subEl = row.querySelector(".sub-col");
    if (subEl) {
      subEl.textContent = Formatters.formatCurrency(subtotal, App.currency);
    }

    if (this.selectedProducts[index]) {
      this.selectedProducts[index].qty = qty;
      this.selectedProducts[index].price = price;
      this.selectedProducts[index].discount = discount;
      this.selectedProducts[index].subtotal = subtotal;
    }
    this.updateSummary();
  },

  removeProductRow(index) {
    const row = document.querySelector(`.product-row[data-index="${index}"]`);
    if (row) row.remove();
    this.selectedProducts[index] = null;
    this.updateSummary();
  },

  updateSummary() {
    const validItems = this.selectedProducts.filter(
      (p) => p && p.id && p.qty > 0,
    );
    const totalQty = validItems.reduce((sum, p) => sum + p.qty, 0);

    document.getElementById("sale-total-items").textContent = validItems.length;
    document.getElementById("sale-total-qty").textContent = totalQty;
    const calc = this.calcTotals(validItems);
    document.getElementById("sale-summary-error").textContent = calc.error || "";
    document.getElementById("sale-subtotal").textContent = Formatters.formatCurrency(calc.subtotal, App.currency);
    document.getElementById("sale-total-amount").textContent =
      Formatters.formatCurrency(calc.total, App.currency);
  },

  // Same arithmetic the server uses (src/shared/saleMath.js); the server re-checks everything.
  calcTotals(validItems) {
    const type = document.getElementById("sale-disc-type")?.value || "none";
    const value = parseFloat(document.getElementById("sale-disc-value")?.value) || 0;
    if (validItems.length === 0) return { subtotal: 0, total: 0 };
    try {
      return computeSaleTotals(
        validItems.map((p) => ({ quantity: p.qty, unit_price: p.price, discount_amount: p.discount || 0 })),
        type,
        value,
      );
    } catch (err) {
      const gross = validItems.reduce((s, p) => s + p.qty * p.price, 0);
      return { subtotal: gross, total: gross, error: err.message };
    }
  },

  async submitSale() {
    if (!this.selectedCustomer) {
      Toast.error("Please select a customer.");
      return;
    }

    const validItems = this.selectedProducts.filter(
      (p) => p && p.id && p.qty > 0,
    );
    if (validItems.length === 0) {
      Toast.error("Please add at least one product.");
      return;
    }

    const ledgerType =
      document.getElementById("sale-ledger-type")?.value || "Cash";
    const calc = this.calcTotals(validItems);
    if (calc.error) {
      Toast.error(calc.error);
      return;
    }
    const paidAmount =
      ledgerType === "Cash"
        ? calc.total
        : parseFloat(document.getElementById("sale-paid-amount")?.value) || 0;

    const data = {
      customer_id: this.selectedCustomer.id,
      issue_date:
        document.getElementById("sale-date")?.value ||
        new Date().toISOString().split("T")[0],
      transaction_type: document.getElementById("sale-type")?.value || "Sale",
      ledger_type: ledgerType,
      paid_amount: paidAmount,
      payment_method: document.getElementById("sale-pay-method")?.value || "Cash",
      discount_type: document.getElementById("sale-disc-type")?.value || "none",
      discount_value: parseFloat(document.getElementById("sale-disc-value")?.value) || 0,
      notes: document.getElementById("sale-notes")?.value?.trim() || "",
      items: validItems.map((p) => ({
        product_id: p.id,
        quantity: p.qty,
        unit_price: p.price,
        discount_amount: p.discount || 0,
      })),
    };

    const btn = document.getElementById("sale-submit-btn");
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div> Saving...';

    try {
      const result = await window.api.createSale(data);
      if (result.success) {
        Toast.success(`Sale saved! Reference: ${result.data.referenceNo}`);
        // Navigate to Ledger page - the auto-created ledger entry will be visible
        // Automatically select this customer in the ledger view
        LedgersPage.currentCustomerId = this.selectedCustomer.id;
        App.navigate("ledgers");
      } else {
        Toast.error(result.error || "Failed to save transaction.");
      }
    } catch (err) {
      Toast.error(err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><polyline points="20 6 9 17 4 12"/></svg> Save Transaction';
    }
  },

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  },
};