// Sales / Issue Page
const SalesPage = {
  selectedCustomer: null,
  selectedProducts: [],
  allProducts: [],
  searchTimeout: null,

  async load() {
    const content = document.getElementById("page-content");
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>New Sale / Issue</h1>
          <p>Create a new sale or issue transaction</p>
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
              <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="SalesPage.showQuickAddCustomer()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add New Customer
              </button>
            </div>

            <!-- Section 2: Transaction Details -->
            <div class="form-section">
              <h3>2. Transaction Details</h3>
              <div class="form-row">
                <div class="form-group">
                  <label>Date</label>
                  <input type="date" class="form-control" id="sale-date" value="${new Date().toISOString().split('T')[0]}">
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
                  <label>Ledger Type</label>
                  <select class="form-control" id="sale-ledger-type" onchange="SalesPage.onLedgerTypeChange()">
                    <option value="Cash">Cash (Full Payment)</option>
                    <option value="Loan">Loan (Partial/Outstanding)</option>
                  </select>
                </div>
                <div class="form-group" id="sale-paid-amount-group" style="display:none;">
                  <label>Paid Amount</label>
                  <input type="number" step="0.01" min="0" class="form-control" id="sale-paid-amount" value="0">
                </div>
              </div>
              <div class="form-group">
                <label>Notes</label>
                <input type="text" class="form-control" id="sale-notes" placeholder="Optional notes...">
              </div>
            </div>

            <!-- Section 3: Products -->
            <div class="form-section">
              <h3>3. Select Products</h3>
              <div class="product-select-row header">
                <span>Product</span>
                <span>Qty</span>
                <span>Unit Price</span>
                <span>Subtotal</span>
                <span></span>
              </div>
              <div id="sale-products-list"></div>
              <button type="button" class="btn btn-secondary btn-sm add-product-btn" onclick="SalesPage.addProductRow()">
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
              <div class="summary-row total">
                <span>Total Amount</span>
                <span id="sale-total-amount">0</span>
              </div>
            </div>

            <!-- Submit -->
            <div style="margin-top:20px;display:flex;gap:12px;justify-content:flex-end;">
              <button type="button" class="btn btn-secondary" onclick="App.navigate('ledgers')">Cancel</button>
              <button type="button" class="btn btn-primary" onclick="SalesPage.submitSale()" id="sale-submit-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><polyline points="20 6 9 17 4 12"/></svg>
                Save Transaction
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    // Load products for selection
    await this.loadProducts();
    // Add first empty product row
    this.addProductRow();
  },

  async loadProducts() {
    try {
      const result = await window.api.getProducts({ limit: 1000, status: "In Stock" });
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
        <button type="button" class="remove-btn" onclick="SalesPage.removeCustomer()">&times;</button>
      </div>
    `;
    document.getElementById("sale-customer-search").value = name;
    document.getElementById("sale-customer-results").classList.remove("show");
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
          container.innerHTML = result.data.map(c => `
            <div class="customer-search-item" onclick="SalesPage.selectCustomer(${c.id}, '${this.escapeHtml(c.customer_name)}')">
              <div class="name">${this.escapeHtml(c.customer_name)}</div>
              <div class="phone">${this.escapeHtml(c.phone) || 'No phone'}</div>
            </div>
          `).join("");
          container.classList.add("show");
        } else {
          container.innerHTML = '<div class="customer-search-item" style="color:var(--text-muted);">No customers found. Add a new customer.</div>';
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

    Modal.showForm("Add New Customer", formHtml, async () => {
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
    }, "sm");
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
    const options = this.allProducts.map(p =>
      `<option value="${p.id}" data-price="${p.selling_price}" data-name="${this.escapeHtml(p.product_name)}" ${product && product.id === p.id ? 'selected' : ''}>${this.escapeHtml(p.product_name)} (Qty: ${p.quantity})</option>`
    ).join("");

    const row = document.createElement("div");
    row.className = "product-select-row";
    row.dataset.index = index;
    row.innerHTML = `
      <select class="form-control" onchange="SalesPage.onProductSelect(${index})" style="font-size:13px;">
        <option value="">-- Select Product --</option>
        ${options}
      </select>
      <input type="number" min="1" value="${product ? product.qty : 1}" class="form-control" onchange="SalesPage.updateRow(${index})" style="font-size:13px;text-align:center;">
      <input type="number" step="0.01" min="0" value="${product ? product.price : 0}" class="form-control" onchange="SalesPage.updateRow(${index})" style="font-size:13px;text-align:right;">
      <span class="subtotal" style="font-size:14px;font-weight:500;text-align:right;">0</span>
      <button type="button" class="remove-item-btn" onclick="SalesPage.removeProductRow(${index})">&times;</button>
    `;

    container.appendChild(row);
    this.selectedProducts.push({ id: null, name: "", qty: 1, price: 0, subtotal: 0 });

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
    const row = document.querySelector(`.product-select-row[data-index="${index}"]`);
    if (!row) return;
    const select = row.querySelector("select");
    const option = select.options[select.selectedIndex];
    const priceInput = row.querySelectorAll("input")[1];
    const qtyInput = row.querySelectorAll("input")[0];

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
      this.selectedProducts[index] = { id: null, name: "", qty: 1, price: 0, subtotal: 0 };
    }
    this.updateRow(index);
    this.updateSummary();
  },

  updateRow(index) {
    const row = document.querySelector(`.product-select-row[data-index="${index}"]`);
    if (!row) return;
    const inputs = row.querySelectorAll("input");
    const qty = parseInt(inputs[0].value) || 0;
    const price = parseFloat(inputs[1].value) || 0;
    const subtotal = qty * price;
    row.querySelector(".subtotal").textContent = Formatters.formatCurrency(subtotal, App.currency);

    if (this.selectedProducts[index]) {
      this.selectedProducts[index].qty = qty;
      this.selectedProducts[index].price = price;
      this.selectedProducts[index].subtotal = subtotal;
    }
    this.updateSummary();
  },

  removeProductRow(index) {
    const row = document.querySelector(`.product-select-row[data-index="${index}"]`);
    if (row) row.remove();
    this.selectedProducts[index] = null;
    this.updateSummary();
  },

  updateSummary() {
    const validItems = this.selectedProducts.filter(p => p && p.id && p.qty > 0);
    const totalQty = validItems.reduce((sum, p) => sum + p.qty, 0);
    const totalAmount = validItems.reduce((sum, p) => sum + p.subtotal, 0);

    document.getElementById("sale-total-items").textContent = validItems.length;
    document.getElementById("sale-total-qty").textContent = totalQty;
    document.getElementById("sale-total-amount").textContent = Formatters.formatCurrency(totalAmount, App.currency);
  },

  async submitSale() {
    // Validate
    if (!this.selectedCustomer) {
      Toast.error("Please select a customer.");
      return;
    }

    const validItems = this.selectedProducts.filter(p => p && p.id && p.qty > 0);
    if (validItems.length === 0) {
      Toast.error("Please add at least one product.");
      return;
    }

    const ledgerType = document.getElementById("sale-ledger-type")?.value || "Cash";
    const paidAmount = ledgerType === "Cash"
      ? validItems.reduce((sum, p) => sum + p.subtotal, 0)
      : parseFloat(document.getElementById("sale-paid-amount")?.value) || 0;

    const data = {
      customer_id: this.selectedCustomer.id,
      issue_date: document.getElementById("sale-date")?.value || new Date().toISOString().split('T')[0],
      transaction_type: document.getElementById("sale-type")?.value || "Sale",
      ledger_type: ledgerType,
      paid_amount: paidAmount,
      notes: document.getElementById("sale-notes")?.value?.trim() || "",
      items: validItems.map(p => ({
        product_id: p.id,
        quantity: p.qty,
        unit_price: p.price,
      })),
    };

    const btn = document.getElementById("sale-submit-btn");
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div> Saving...';

    try {
      const result = await window.api.createSale(data);
      if (result.success) {
        Toast.success(`Transaction saved successfully! Reference: ${result.data.referenceNo}`);
        // Show the ledger details
        Modal.close();
        App.navigate("ledgers");
        // Open the ledger detail after a short delay
        setTimeout(() => {
          LedgersPage.viewLedger(result.data.ledgerId);
        }, 500);
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
    return div.innerHTML;
  },
};