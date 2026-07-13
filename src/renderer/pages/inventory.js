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
        /* category chip styles */
        .chip{padding:6px 10px;border-radius:16px;border:1px solid var(--muted);background:var(--bg);cursor:pointer;font-size:13px}
        .chip.active{background:var(--primary);color:#fff;border-color:var(--primary)}
        .category-list{align-items:center}
      </style>
      <div class="page-header">
        <div>
          <h1>Inventory</h1>
          <p>Manage your products</p>
        </div>
        <button class="btn btn-primary" onclick="InventoryPage.showAddProduct()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Product
        </button>
      </div>
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
          <div class="detail-field">
            <div class="detail-label">Selling Price</div>
            <div class="detail-value">${Formatters.formatCurrency(p.selling_price, currency)}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Quantity</div>
            <div class="detail-value">${p.quantity}</div>
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

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};
