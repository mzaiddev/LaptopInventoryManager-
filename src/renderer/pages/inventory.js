// Inventory Page
const DEFAULT_CATEGORY_OPTIONS = [
  "Laptop",
  "Charger",
  "Adapter",
  "Mouse",
  "Keyboard",
  "SSD",
  "HDD",
  "RAM",
  "Monitor",
  "Printer",
  "Router",
  "UPS",
  "Networking Equipment",
  "Accessories",
  "Other",
];

const InventoryPage = {
  currentFilters: {
    search: "",
    category: "",
    supplier: "",
    status: "",
    condition: "",
    sortBy: "created_at",
    sortOrder: "desc",
    page: 1,
    limit: 50,
  },

  async load() {
    const content = document.getElementById("page-content");
    content.innerHTML = `
      <style>
        .chip{padding:6px 10px;border-radius:16px;border:1px solid var(--muted);background:var(--bg);cursor:pointer;font-size:13px}
        .chip.active{background:var(--primary);color:#fff;border-color:var(--primary)}
        .category-list{align-items:center}
        /* Tab styles */
        .inventory-tabs{display:flex;gap:0;margin-bottom:0;border-bottom:2px solid var(--border-color)}
        .inv-tab{padding:12px 24px;background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;cursor:pointer;font-size:14px;font-weight:500;color:var(--text-secondary);transition:all var(--transition)}
        .inv-tab:hover{color:var(--text-primary);background:var(--bg-tertiary)}
        .inv-tab.active{border-bottom-color:var(--primary);color:var(--primary)}
        .inv-tab svg{width:16px;height:16px;margin-right:6px;vertical-align:middle}
        .inv-tab .tab-count{background:var(--bg-tertiary);padding:2px 8px;border-radius:10px;font-size:11px;margin-left:6px}
        .inv-tab.active .tab-count{background:var(--primary-light);color:var(--primary)}
      </style>
      <div class="page-header">
        <div>
          <h1>Inventory</h1>
          <p>Manage your products and track damages</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="InventoryPage.showAddProduct()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Product
          </button>
          <button class="btn btn-danger" onclick="InventoryPage.showRecordDamage()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <line x1="18" y1="6" x2="6" y2="18"/><circle cx="12" cy="12" r="10"/>
            </svg>
            Record Damage
          </button>
          <button class="btn btn-secondary" onclick="InventoryPage.printInventory('all')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print All
          </button>
        </div>
      </div>
      <!-- Tabs -->
      <div class="inventory-tabs">
        <button class="inv-tab active" id="tab-products" onclick="InventoryPage.switchTab('products')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Products
          <span class="tab-count" id="tab-products-count">0</span>
        </button>
        <button class="inv-tab" id="tab-damages" onclick="InventoryPage.switchTab('damages')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Damages
          <span class="tab-count" id="tab-damages-count">0</span>
        </button>
      </div>
      <!-- Products Tab Content -->
      <div id="inventory-products-tab">
        <div class="card">
          <div class="card-body">
            <div class="filters-bar">
              <div class="search-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input type="text" id="inventory-search" placeholder="Search by name, model, category, serial..." oninput="InventoryPage.onSearch()">
              </div>
              <div class="filter-group">
                <select id="filter-category" onchange="InventoryPage.onFilter()">
                  <option value="">All Categories</option>
                </select>
                <select id="filter-supplier" onchange="InventoryPage.onFilter()" style="display:none;">
                  <option value="">All Suppliers</option>
                </select>
                <select id="filter-status" onchange="InventoryPage.onFilter()">
                  <option value="">All Status</option>
                  <option value="In Stock">In Stock</option>
                  <option value="Reserved">Reserved</option>
                  <option value="Sold">Sold</option>
                  <option value="Returned">Returned</option>
                  <option value="Damaged">Damaged</option>
                  <option value="Lost">Lost</option>
                </select>
                <select id="filter-condition" onchange="InventoryPage.onFilter()">
                  <option value="">All Conditions</option>
                  <option value="Excellent">Excellent</option>
                  <option value="Good">Good</option>
                  <option value="Fair">Fair</option>
                  <option value="Damaged">Damaged</option>
                  <option value="For Parts">For Parts</option>
                </select>
              </div>
            </div>
            <div id="category-list" class="category-list" style="margin:12px 0;display:flex;gap:8px;flex-wrap:wrap;">
              <!-- category chips will be injected here -->
            </div>
            <div id="inventory-table-container"><div class="loading"><div class="spinner"></div></div></div>
            <div id="inventory-pagination"></div>
          </div>
        </div>
      </div>
      <!-- Damages Tab Content -->
      <div id="inventory-damages-tab" style="display:none;">
        <div class="card">
          <div class="card-body">
            <div class="filters-bar">
              <div class="search-box" style="max-width:none;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input type="text" id="damages-search" placeholder="Search damages by product name, reference..." oninput="InventoryPage.onDamagesSearch()">
              </div>
              <div class="filter-group">
                <select id="filter-damage-type" onchange="InventoryPage.loadDamages()">
                  <option value="">All Types</option>
                  <option value="Damaged">Damaged</option>
                  <option value="Disposed">Disposed</option>
                  <option value="Repaired">Repaired</option>
                  <option value="Corrected">Restored</option>
                </select>
                <input type="date" id="filter-damage-from" onchange="InventoryPage.loadDamages()" style="padding:8px 12px;border:1px solid var(--border-color);border-radius:var(--radius);font-size:13px;background:var(--card-bg);color:var(--text-primary);">
                <input type="date" id="filter-damage-to" onchange="InventoryPage.loadDamages()" style="padding:8px 12px;border:1px solid var(--border-color);border-radius:var(--radius);font-size:13px;background:var(--card-bg);color:var(--text-primary);">
              </div>
            </div>
            <div id="damages-table-container"><div class="loading"><div class="spinner"></div></div></div>
          </div>
        </div>
      </div>
    `;

    // Setup table and pagination
    App.setupInventoryTable();
    App.setupPagination();

    // Load filter dropdowns
    await Promise.all([
      this.loadFilterOptions("filter-category", "getCategories"),
      this.loadFilterOptions("filter-supplier", "getSuppliers"),
    ]);

    // render chips in case categories were already present
    await this.renderCategoryChips();

    await this.refresh();
  },

  async loadFilterOptions(selectId, apiMethod) {
    try {
      const result = await window.api[apiMethod]();
      const select = document.getElementById(selectId);

      if (select) {
        while (select.options.length > 1) select.remove(1);
      }

      if (selectId === "filter-category") {
        const values = Array.isArray(result?.data) ? result.data : [];
        const optionsToRender = [
          ...new Set([...DEFAULT_CATEGORY_OPTIONS, ...values]),
        ];

        optionsToRender.forEach((value) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          if (select) select.appendChild(option);
        });

        App.categories = optionsToRender;
        if (select && this.currentFilters.category) {
          select.value = this.currentFilters.category;
        }
        await this.renderCategoryChips();
      } else if (selectId === "filter-supplier") {
        const values = Array.isArray(result?.data) ? result.data : [];
        values.forEach((value) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          if (select) select.appendChild(option);
        });
        App.suppliers = values;
      }
    } catch (err) {
      console.error(`Failed to load ${apiMethod}:`, err);
    }
  },

  async renderCategoryChips() {
    const container = document.getElementById("category-list");
    if (!container) return;
    container.innerHTML = "";

    let cats =
      App.categories && Array.isArray(App.categories) ? App.categories : [];
    if (!cats || cats.length === 0) {
      try {
        const res = await window.api.getCategories();
        if (res && res.success && Array.isArray(res.data)) {
          App.categories = [
            ...new Set([...DEFAULT_CATEGORY_OPTIONS, ...res.data]),
          ];
          cats = App.categories;
          const sel = document.getElementById("filter-category");
          if (sel) {
            while (sel.options.length > 1) sel.remove(1);
            cats.forEach((v) => {
              const opt = document.createElement("option");
              opt.value = v;
              opt.textContent = v;
              sel.appendChild(opt);
            });
          }
        }
      } catch (e) {
        console.error("Failed to fetch categories for chips:", e);
      }
    }

    if (!cats || cats.length === 0) {
      container.style.display = "none";
      return;
    }

    container.style.display = "flex";
    const allChip = document.createElement("button");
    allChip.className =
      "chip" + (this.currentFilters.category === "" ? " active" : "");
    allChip.textContent = "All";
    allChip.onclick = () => this.onCategoryChipClick("");
    container.appendChild(allChip);

    cats.forEach((c) => {
      const btn = document.createElement("button");
      btn.className =
        "chip" + (this.currentFilters.category === c ? " active" : "");
      btn.textContent = c;
      btn.onclick = () => this.onCategoryChipClick(c);
      container.appendChild(btn);
    });
  },

  onCategoryChipClick(category) {
    // set category filter and refresh
    this.currentFilters.category = category;
    // also update select dropdown if present
    const sel = document.getElementById("filter-category");
    if (sel) sel.value = category;
    this.currentFilters.page = 1;
    this.loadProducts();
    // re-render chips to reflect active state (fire-and-forget)
    this.renderCategoryChips().catch(() => {});
  },

  async refresh() {
    await this.loadProducts();
  },

  async loadProducts() {
    const container = document.getElementById("inventory-table-container");
    if (!container) return;

    // Show loading
    container.innerHTML =
      '<div class="loading"><div class="spinner"></div></div>';

    try {
      const result = await window.api.getProducts(this.currentFilters);
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${result.error}</p></div>`;
        return;
      }

      const data = result.data;

      // Ensure table exists
      if (!App.table) {
        App.setupInventoryTable();
      }
      if (!App.pagination) {
        App.setupPagination();
      }

      App.table.render(data.products);
      App.pagination.update(data.total, data.page, data.totalPages);

      // Update products tab count
      const countEl = document.getElementById('tab-products-count');
      if (countEl) countEl.textContent = data.total;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  },

  onSearch() {
    clearTimeout(this._searchTimeout);
    this._searchTimeout = setTimeout(() => {
      this.currentFilters.search = document
        .getElementById("inventory-search")
        .value.trim();
      this.currentFilters.page = 1;
      this.loadProducts();
    }, 300);
  },

  onFilter() {
    this.currentFilters.category =
      document.getElementById("filter-category").value;
    this.currentFilters.supplier =
      document.getElementById("filter-supplier").value;
    this.currentFilters.status = document.getElementById("filter-status").value;
    this.currentFilters.condition =
      document.getElementById("filter-condition").value;
    this.currentFilters.page = 1;
    this.loadProducts();
  },

  onSort(sortBy, sortOrder) {
    this.currentFilters.sortBy = sortBy;
    this.currentFilters.sortOrder = sortOrder;
    this.currentFilters.page = 1;
    this.loadProducts();
  },

  onPageChange(page) {
    this.currentFilters.page = page;
    this.loadProducts();
  },

  showAddProduct() {
    (async () => {
      try {
        const categoriesRes = await window.api.getCategories();
        if (
          categoriesRes &&
          categoriesRes.success &&
          Array.isArray(categoriesRes.data)
        ) {
          App.categories = categoriesRes.data;
          await this.renderCategoryChips();
        }
      } catch (e) {}

      Modal.showProductForm(null, async (data) => {
        try {
          const result = await window.api.addProduct(data);
          if (result.success) {
            Toast.success("Product added successfully.");
            // Refresh products and category filter options (in case a new category was added)
            await this.refresh();
            await this.loadFilterOptions("filter-category", "getCategories");
          } else {
            Toast.error(result.error || "Failed to add product.");
          }
        } catch (err) {
          Toast.error("Failed to add product: " + err.message);
        }
      });
    })();
  },

  editProduct(id) {
    window.api
      .getProduct(id)
      .then((result) => {
        if (!result.success || !result.data) {
          Toast.error("Failed to load product.");
          return;
        }
        const product = result.data;
        (async () => {
          try {
            const categoriesRes = await window.api.getCategories();
            if (
              categoriesRes &&
              categoriesRes.success &&
              Array.isArray(categoriesRes.data)
            ) {
              App.categories = categoriesRes.data;
              await this.renderCategoryChips();
            }
          } catch (e) {}

          Modal.showProductForm(product, async (data) => {
            try {
              const updateResult = await window.api.updateProduct(id, data);
              if (updateResult.success) {
                Toast.success("Product updated successfully.");
                await this.refresh();
                await this.loadFilterOptions(
                  "filter-category",
                  "getCategories",
                );
              } else {
                Toast.error(updateResult.error || "Failed to update product.");
              }
            } catch (err) {
              Toast.error("Failed to update product: " + err.message);
            }
          });
        })();
      })
      .catch((err) => {
        Toast.error("Failed to load product: " + err.message);
      });
  },

  deleteProduct(id, name) {
    Modal.showConfirm(
      "Delete Product",
      `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      async () => {
        try {
          const result = await window.api.deleteProduct(id);
          if (result.success) {
            Toast.success("Product deleted successfully.");
            this.refresh();
          } else {
            Toast.error(result.error || "Failed to delete product.");
          }
        } catch (err) {
          Toast.error("Failed to delete product: " + err.message);
        }
      },
    );
  },

  viewProduct(id) {
    window.api
      .getProduct(id)
      .then((result) => {
        if (!result.success || !result.data) {
          Toast.error("Failed to load product details.");
          return;
        }

        const p = result.data;
        const currency = App.currency || "USD";

        const body = `
        <div class="product-details">
          <div class="detail-field">
            <div class="detail-label">Product Name</div>
            <div class="detail-value">${this.escapeHtml(p.product_name)}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Category</div>
            <div class="detail-value">${this.escapeHtml(p.category)}</div>
          </div>
          <!-- Brand removed -->
          <div class="detail-field">
            <div class="detail-label">Model</div>
            <div class="detail-value">${this.escapeHtml(p.model) || "-"}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Serial Number</div>
            <div class="detail-value">${this.escapeHtml(p.serial_number) || "-"}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Supplier</div>
            <div class="detail-value">${this.escapeHtml(p.supplier) || "-"}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Purchase Price</div>
            <div class="detail-value">${Formatters.formatCurrency(p.purchase_price, currency)}</div>
          </div>
          <!-- Selling Price removed - managed from Sales module -->
          <div class="detail-field">
            <div class="detail-label">Quantity</div>
            <div class="detail-value" style="font-weight:600;">${p.quantity}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Purchase Date</div>
            <div class="detail-value">${Formatters.formatDate(p.purchase_date)}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Warranty</div>
            <div class="detail-value">${this.escapeHtml(p.warranty) || "-"}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Storage Location</div>
            <div class="detail-value">${this.escapeHtml(p.storage_location) || "-"}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Status</div>
            <div class="detail-value"><span class="badge ${Formatters.getStatusBadgeClass(p.status)}">${p.status}</span></div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Condition</div>
            <div class="detail-value"><span class="badge ${Formatters.getConditionBadgeClass(p.condition)}">${p.condition}</span></div>
          </div>
          <div class="detail-section">
            <h4>Notes</h4>
            <p>${this.escapeHtml(p.notes) || "No notes."}</p>
          </div>
          <div class="detail-section">
            <h4>Inspection Notes</h4>
            <div id="inspection-notes-container">
              <div class="loading"><div class="spinner" style="width:20px;height:20px;"></div></div>
            </div>
            <div class="add-note-form">
              <input type="text" class="form-control" id="new-inspection-note" placeholder="Add inspection note...">
              <button class="btn btn-primary btn-sm" onclick="InventoryPage.addInspectionNote(${p.id})">Add</button>
            </div>
          </div>
          <div class="detail-section">
            <h4>Quick Actions</h4>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <select class="form-control" id="quick-status" style="width:auto;" onchange="InventoryPage.quickChangeStatus(${p.id})">
                ${[
                  "In Stock",
                  "Reserved",
                  "Sold",
                  "Returned",
                  "Damaged",
                  "Lost",
                ]
                  .map(
                    (s) =>
                      `<option value="${s}"${p.status === s ? " selected" : ""}>${s}</option>`,
                  )
                  .join("")}
              </select>
              <select class="form-control" id="quick-condition" style="width:auto;" onchange="InventoryPage.quickChangeCondition(${p.id})">
                ${["Excellent", "Good", "Fair", "Damaged", "For Parts"]
                  .map(
                    (c) =>
                      `<option value="${c}"${p.condition === c ? " selected" : ""}>${c}</option>`,
                  )
                  .join("")}
              </select>
            </div>
          </div>
          <div class="detail-section">
            <h4>Timestamps</h4>
            <div style="display:flex;gap:24px;">
              <div class="detail-field">
                <div class="detail-label">Created</div>
                <div class="detail-value">${Formatters.formatDateTime(p.created_at)}</div>
              </div>
              <div class="detail-field">
                <div class="detail-label">Updated</div>
                <div class="detail-value">${Formatters.formatDateTime(p.updated_at)}</div>
              </div>
            </div>
          </div>
        </div>
      `;

        const footer = `
        <button class="btn btn-secondary" onclick="window.Modal.close()">Close</button>
        <button class="btn btn-primary" onclick="window.Modal.close(); InventoryPage.editProduct(${p.id})">Edit</button>
      `;

        Modal.show({
          title: `Product Details - ${this.escapeHtml(p.product_name)}`,
          body,
          footer,
          size: "lg",
        });

        // Load inspection notes
        this.loadInspectionNotes(p.id);
      })
      .catch((err) => {
        Toast.error("Failed to load product details: " + err.message);
      });
  },

  async loadInspectionNotes(productId) {
    const container = document.getElementById("inspection-notes-container");
    if (!container) return;

    try {
      const result = await window.api.getInspectionNotes(productId);
      if (!result.success || !result.data || result.data.length === 0) {
        container.innerHTML =
          '<p style="color:var(--text-muted);">No inspection notes yet.</p>';
        return;
      }

      container.innerHTML =
        '<div class="inspection-notes-list">' +
        result.data
          .map(
            (note) => `
          <div class="inspection-note-item">
            <span class="note-text">${this.escapeHtml(note.note)}</span>
            <span class="note-date">${Formatters.formatRelativeTime(note.created_at)}</span>
            <button class="note-delete" onclick="InventoryPage.deleteInspectionNote(${note.id}, ${productId})">&times;</button>
          </div>
        `,
          )
          .join("") +
        "</div>";
    } catch (err) {
      container.innerHTML =
        '<p style="color:var(--danger);">Failed to load notes.</p>';
    }
  },

  async addInspectionNote(productId) {
    const input = document.getElementById("new-inspection-note");
    if (!input || !input.value.trim()) return;

    try {
      const result = await window.api.addInspectionNote(
        productId,
        input.value.trim(),
      );
      if (result.success) {
        input.value = "";
        this.loadInspectionNotes(productId);
        Toast.success("Note added.");
      } else {
        Toast.error(result.error || "Failed to add note.");
      }
    } catch (err) {
      Toast.error("Failed to add note: " + err.message);
    }
  },

  async deleteInspectionNote(noteId, productId) {
    try {
      const result = await window.api.deleteInspectionNote(noteId);
      if (result.success) {
        this.loadInspectionNotes(productId);
        Toast.success("Note deleted.");
      } else {
        Toast.error(result.error || "Failed to delete note.");
      }
    } catch (err) {
      Toast.error("Failed to delete note: " + err.message);
    }
  },

  async quickChangeStatus(id) {
    const select = document.getElementById("quick-status");
    if (!select) return;

    try {
      const result = await window.api.changeProductStatus(id, select.value);
      if (result.success) {
        Toast.success("Status updated.");
        Modal.close();
        this.refresh();
      } else {
        Toast.error(result.error || "Failed to change status.");
      }
    } catch (err) {
      Toast.error("Failed to change status: " + err.message);
    }
  },

  async quickChangeCondition(id) {
    const select = document.getElementById("quick-condition");
    if (!select) return;

    try {
      const result = await window.api.changeProductCondition(id, select.value);
      if (result.success) {
        Toast.success("Condition updated.");
        Modal.close();
        this.refresh();
      } else {
        Toast.error(result.error || "Failed to change condition.");
      }
    } catch (err) {
      Toast.error("Failed to change condition: " + err.message);
    }
  },

  async showRecordDamage() {
    try {
      const result = await window.api.getProducts({ limit: 1000 });
      if (!result.success) {
        Toast.error("Failed to load products.");
        return;
      }
      const allProducts = result.data.products || [];
      // Only show products with available stock
      const products = allProducts.filter(p => p.quantity > 0 && p.status !== 'Sold' && p.status !== 'Lost');

      const formHtml = `
        <form id="damage-form" onsubmit="return false;">
          <div class="form-group">
            <label>Product *</label>
            <select class="form-control" id="dm-product">
              <option value="">Select Product</option>
              ${products.map(p => {
                return `<option value="${p.id}" data-name="${this.escapeHtml(p.product_name)}">${this.escapeHtml(p.product_name)} (Qty: ${p.quantity})</option>`;
              }).join('')}
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Damaged Quantity *</label>
              <input type="number" min="1" class="form-control" id="dm-qty" value="1">
            </div>
            <div class="form-group">
              <label>Date</label>
              <input type="date" class="form-control" id="dm-date" value="${new Date().toISOString().split('T')[0]}">
            </div>
          </div>
          <div class="form-group">
            <label>Damage Type</label>
            <select class="form-control" id="dm-type">
              <option value="Damaged">Damaged</option>
              <option value="Disposed">Disposed</option>
              <option value="Repaired">Repaired</option>
            </select>
          </div>
          <div class="form-group">
            <label>Reason</label>
            <input type="text" class="form-control" id="dm-reason" placeholder="e.g., Screen cracked, water damage...">
          </div>
          <div class="form-group">
            <label>Notes</label>
            <textarea class="form-control" id="dm-notes" rows="2" placeholder="Additional notes..."></textarea>
          </div>
        </form>
      `;

      Modal.showForm("Record Product Damage", formHtml, async () => {
        const productId = parseInt(document.getElementById("dm-product")?.value);
        const qty = parseInt(document.getElementById("dm-qty")?.value);
        const date = document.getElementById("dm-date")?.value;
        const type = document.getElementById("dm-type")?.value;
        const reason = document.getElementById("dm-reason")?.value?.trim() || "";
        const notes = document.getElementById("dm-notes")?.value?.trim() || "";

        if (!productId || !qty || qty < 1) {
          Toast.error("Please select a product and enter a valid quantity.");
          return;
        }

        try {
          const result = await window.api.recordDamage({
            product_id: productId,
            quantity: qty,
            recorded_date: date,
            damage_type: type || 'Damaged',
            reason: reason,
            notes: notes
          });
          if (result.success) {
            Toast.success(`Damage recorded. Reference: ${result.data.referenceNo}`);
            Modal.close();
            this.refresh();
          } else {
            Toast.error(result.error || "Failed to record damage.");
          }
        } catch (err) {
          Toast.error(err.message);
        }
      }, "sm");
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async restoreProduct(id) {
    Modal.showConfirm(
      "Restore Product",
      "Are you sure you want to restore this product to normal (In Stock) status? This will NOT restore the quantity lost to damage - use the Damages tab to restore actual stock.",
      async () => {
        try {
          const result = await window.api.changeProductStatus(id, "In Stock");
          if (result.success) {
            Toast.success("Product restored to In Stock.");
            this.refresh();
          } else {
            Toast.error(result.error || "Failed to restore product.");
          }
        } catch (err) {
          Toast.error(err.message);
        }
      },
    );
  },

  // ==================== TAB SYSTEM ====================

  currentTab: 'products',

  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById('inventory-products-tab').style.display = tab === 'products' ? '' : 'none';
    document.getElementById('inventory-damages-tab').style.display = tab === 'damages' ? '' : 'none';

    if (tab === 'damages') {
      this.loadDamages();
    }
  },

  async loadDamages() {
    const container = document.getElementById('damages-table-container');
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const search = document.getElementById('damages-search')?.value?.trim() || '';
      const type = document.getElementById('filter-damage-type')?.value || '';
      const dateFrom = document.getElementById('filter-damage-from')?.value || '';
      const dateTo = document.getElementById('filter-damage-to')?.value || '';

      const filters = { limit: 500 };
      if (type) filters.damage_type = type;
      if (dateFrom) filters.date_from = dateFrom;
      if (dateTo) filters.date_to = dateTo;

      const result = await window.api.getAllDamages(filters);
      if (!result.success) {
        container.innerHTML = '<div class="empty-state"><h3>Error</h3><p>' + result.error + '</p></div>';
        return;
      }

      let damages = result.data.damages || [];
      const total = result.data.total || 0;

      // Update tab count
      const countEl = document.getElementById('tab-damages-count');
      if (countEl) countEl.textContent = total;

      // Client-side search filter
      if (search) {
        const s = search.toLowerCase();
        damages = damages.filter(d =>
          (d.product_name || '').toLowerCase().includes(s) ||
          (d.reference_no || '').toLowerCase().includes(s) ||
          (d.reason || '').toLowerCase().includes(s)
        );
      }

      if (damages.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No Damage Records</h3><p>No damages recorded yet. Use "Record Damage" to start.</p></div>';
        return;
      }

      const currency = App.currency || 'USD';

      let html = '<div style="overflow-x:auto;"><table><thead><tr>';
      html += '<th>#</th><th>Reference</th><th>Product</th><th>Qty</th><th>Type</th><th>Reason</th><th>Date</th><th>Value Lost</th><th>Current Stock</th><th>Actions</th>';
      html += '</tr></thead><tbody>';

      damages.forEach((d, i) => {
        const isRestorable = d.damage_type !== 'Corrected' && d.damage_type !== 'Repaired';
        const valueLost = (d.quantity || 0) * (d.purchase_price || 0);
        const typeClass = d.damage_type === 'Corrected' ? 'badge-in-stock' : d.damage_type === 'Disposed' ? 'badge-lost' : 'badge-damaged';

        html += `<tr>
          <td>${i + 1}</td>
          <td><strong>${this.escapeHtml(d.reference_no)}</strong></td>
          <td><strong>${this.escapeHtml(d.product_name || 'Unknown')}</strong></td>
          <td style="text-align:center;font-weight:600;">${d.quantity}</td>
          <td><span class="badge ${typeClass}">${this.escapeHtml(d.display_type || d.damage_type)}</span></td>
          <td>${this.escapeHtml(d.reason) || '-'}</td>
          <td>${Formatters.formatDate(d.recorded_date)}</td>
          <td style="text-align:right;">${Formatters.formatCurrency(valueLost, currency)}</td>
          <td style="text-align:center;"><span style="font-weight:600;color:${(d.current_qty || 0) > 0 ? 'var(--success)' : 'var(--danger)'};">${d.current_qty || 0}</span></td>
          <td>
            <div class="action-buttons">
              ${isRestorable ? `<button class="btn btn-sm btn-success" onclick="InventoryPage.restoreFromDamages(${d.id}, ${d.product_id}, ${d.quantity})" title="Restore Stock">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                </svg>
                Restore
              </button>` : ''}
              <button class="btn btn-sm btn-primary" onclick="InventoryPage.viewProduct(${d.product_id})" title="View Product">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
          </td>
        </tr>`;
      });

      html += '</tbody></table></div>';
      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = '<div class="empty-state"><h3>Error</h3><p>' + err.message + '</p></div>';
    }
  },

  onDamagesSearch() {
    clearTimeout(this._damageSearchTimeout);
    this._damageSearchTimeout = setTimeout(() => {
      this.loadDamages();
    }, 300);
  },

  async restoreFromDamages(damageId, productId, quantity) {
    Modal.showConfirm(
      'Restore Stock from Damage',
      'Are you sure you want to restore ' + quantity + ' unit(s) back to stock?\nThis will:\n- Add ' + quantity + ' back to the product quantity\n- Mark this damage record as "Restored"\n- The product becomes available for sale again',
      async () => {
        try {
          const result = await window.api.correctDamage(damageId, {
            quantity: 0,
            reason: 'Restored to stock',
            notes: ''
          });
          if (result.success) {
            Toast.success(quantity + ' unit(s) restored to stock.');
            // Refresh both tabs
            this.loadDamages();
            this.loadProducts();
          } else {
            Toast.error(result.error || 'Failed to restore stock.');
          }
        } catch (err) {
          Toast.error(err.message);
        }
      }
    );
  },

  async printInventory(mode) {
    try {
      // Load all products
      const result = await window.api.getProducts({ limit: 5000 });
      if (!result.success) { Toast.error('Failed to load products.'); return; }
      const products = result.data.products || [];

      if (products.length === 0) {
        Toast.warning('No products to print.');
        return;
      }

      const shopName = document.getElementById('shop-name')?.textContent || 'Inventory Report';
      const dateStr = new Date().toLocaleDateString();

      const printWindow = window.open('', '_blank', 'width=1100,height=800');
      if (!printWindow) {
        Toast.error('Please allow pop-ups for printing.');
        return;
      }

      const currency = App.currency || 'PKR';
      const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency });
      const totalValue = products.reduce((s, p) => s + ((p.purchase_price || 0) * p.quantity), 0);
      const damagedValue = products.reduce((s, p) => s + (p.status === 'Damaged' ? ((p.purchase_price || 0) * p.quantity) : 0), 0);

      printWindow.document.write(`
<html>
<head><title>Inventory Report</title>
<style>
  @page { margin: 12mm; size: A4 landscape; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; padding: 10px; background: #fff; }
  .report-header { text-align: center; margin-bottom: 18px; border-bottom: 3px solid #2563eb; padding-bottom: 12px; }
  .report-header h1 { font-size: 20px; color: #1e293b; margin-bottom: 4px; }
  .report-header p { font-size: 12px; color: #64748b; }
  .summary-row { display: flex; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
  .summary-item { padding: 6px 14px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; }
  .summary-item .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .summary-item .value { font-size: 16px; font-weight: 700; color: #1e293b; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #2563eb; color: #fff; padding: 6px 8px; text-align: left; font-weight: 600; white-space: nowrap; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; color: #334155; }
  tr:nth-child(even) { background: #f8fafc; }
  .badge-p { padding: 2px 6px; border-radius: 10px; font-size: 9px; font-weight: 500; display: inline-block; }
  .b-instock { background: #dcfce7; color: #166534; }
  .b-reserved { background: #fef3c7; color: #92400e; }
  .b-sold { background: #dbeafe; color: #1e40af; }
  .b-damaged { background: #fee2e2; color: #991b1b; }
  .b-returned { background: #fce7f3; color: #9d174d; }
  .b-lost { background: #f3f4f6; color: #374151; }
  .report-footer { margin-top: 16px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
</style>
</head>
<body>
  <div class="report-header">
    <h1>${this.escapeHtml(shopName)}</h1>
    <p>Complete Inventory Report &mdash; ${dateStr} | ${products.length} Products Listed</p>
  </div>
  <div class="summary-row">
    <div class="summary-item"><div class="label">Total Products</div><div class="value">${products.length}</div></div>
    <div class="summary-item"><div class="label">Total Quantity</div><div class="value">${products.reduce((s,p) => s + p.quantity, 0)}</div></div>
    <div class="summary-item"><div class="label">Total Value</div><div class="value">${currencyFmt.format(totalValue)}</div></div>
    <div class="summary-item"><div class="label">Damaged Value</div><div class="value" style="color:#ef4444;">${currencyFmt.format(damagedValue)}</div></div>
  </div>
  <table>
    <thead><tr>
      <th>#</th><th>Product Name</th><th>Category</th><th>Model</th><th>Serial No.</th><th>Qty</th><th>Status</th><th>Condition</th><th>Location</th><th>Purchase Price</th>
    </tr></thead>
    <tbody>
      ${products.map((p, i) => {
        const statusClass = p.status === 'In Stock' ? 'b-instock' : p.status === 'Damaged' ? 'b-damaged' : p.status === 'Reserved' ? 'b-reserved' : p.status === 'Sold' ? 'b-sold' : p.status === 'Returned' ? 'b-returned' : 'b-lost';
        return `<tr>
          <td>${i + 1}</td>
          <td><strong>${this.escapeHtml(p.product_name)}</strong></td>
          <td>${this.escapeHtml(p.category)}</td>
          <td>${this.escapeHtml(p.model) || '-'}</td>
          <td>${this.escapeHtml(p.serial_number) || '-'}</td>
          <td style="text-align:center;font-weight:600;">${p.quantity}</td>
          <td><span class="badge-p ${statusClass}">${p.status}</span></td>
          <td>${this.escapeHtml(p.condition)}</td>
          <td>${this.escapeHtml(p.storage_location) || '-'}</td>
          <td style="text-align:right;">${currencyFmt.format(p.purchase_price || 0)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  <div class="report-footer">
    <p>Generated by Laptop Inventory Manager | ${dateStr}</p>
  </div>
  <script>window.onload = function() { setTimeout(function() { window.print(); }, 300); };<\/script>
</body>
</html>
`);
      printWindow.document.close();
    } catch (err) {
      Toast.error('Print error: ' + err.message);
    }
  },

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};
