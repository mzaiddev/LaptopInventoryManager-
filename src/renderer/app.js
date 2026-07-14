// Main Application Controller
const App = {
  currentPage: "dashboard",
  currency: "PKR",
  table: null,
  pagination: null,

  async init() {
    // Load settings first
    try {
      const result = await window.api.getSettings();
      if (result.success) {
        this.currency = result.data.currency || "USD";
        const theme = result.data.theme || "light";
        if (theme === "dark") {
          document.body.classList.add("dark-mode");
        }
        // Update shop name
        const shopNameEl = document.getElementById("shop-name");
        if (shopNameEl) {
          shopNameEl.textContent =
            result.data.shop_name || "Laptop Inventory Manager";
        }
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    }

    try {
      const catsRes = await window.api.getCategories();
      if (catsRes && catsRes.success && Array.isArray(catsRes.data)) {
        this.categories = catsRes.data;
      }
    } catch (e) {}

    // Navigate to dashboard
    this.navigate("dashboard");
  },

  async navigate(page) {
    this.currentPage = page;

    // Update sidebar active state
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.page === page);
    });

    // Show loading state
    const content = document.getElementById("page-content");
    content.innerHTML =
      '<div class="loading"><div class="spinner"></div></div>';

    // Load the page
    try {
      switch (page) {
        case "dashboard":
          await DashboardPage.load();
          break;
        case "inventory":
          await InventoryPage.load();
          break;
        case "customers":
          await CustomersPage.load();
          break;
        case "sales":
          await SalesPage.load();
          break;
        case "ledgers":
          await LedgersPage.load();
          break;
        case "returns":
          await ReturnsPage.load();
          break;
        case "reports":
          await ReportsPage.load();
          break;
        case "backup":
          await BackupPage.load();
          break;
        case "settings":
          await SettingsPage.load();
          break;
      }
    } catch (err) {
      console.error("Navigation error:", err);
      content.innerHTML = `<div class="empty-state"><h3>Error loading page</h3><p>${err.message}</p></div>`;
    }
  },

  async refreshCurrentPage() {
    switch (this.currentPage) {
      case "dashboard":
        await DashboardPage.refresh();
        break;
      case "inventory":
        await InventoryPage.refresh();
        break;
      case "customers":
        await CustomersPage.refresh();
        break;
      case "sales":
        await SalesPage.load();
        break;
      case "ledgers":
        await LedgersPage.refresh();
        break;
      case "returns":
        await ReturnsPage.refresh();
        break;
      case "reports":
        await ReportsPage.refresh();
        break;
      case "backup":
        await BackupPage.refresh();
        break;
      case "settings":
        await SettingsPage.refresh();
        break;
    }
  },

  setupInventoryTable() {
    const columns = [
      {
        field: "id",
        label: "ID",
        width: "60px",
        sortable: true,
        type: "number",
      },
      { field: "product_name", label: "Product Name", sortable: true },
      { field: "category", label: "Category", sortable: true },
      { field: "model", label: "Model" },
      {
        field: "quantity",
        label: "Qty",
        width: "60px",
        sortable: true,
        type: "number",
      },
      {
        field: "purchase_price",
        label: "Purchase",
        sortable: true,
        type: "currency",
      },
      {
        field: "selling_price",
        label: "Selling",
        sortable: true,
        type: "currency",
      },
      {
        field: "status",
        label: "Status",
        sortable: true,
        type: "status-select",
      },
      { field: "condition", label: "Condition", type: "condition-select" },
      {
        field: "created_at",
        label: "Created",
        sortable: true,
        type: "datetime",
      },
    ];

    this.table = new window.TableComponent("inventory-table-container", {
      columns,
      sortBy: "created_at",
      sortOrder: "desc",
      onSort: (sortBy, sortOrder) => {
        if (InventoryPage && InventoryPage.onSort) {
          InventoryPage.onSort(sortBy, sortOrder);
        }
      },
      emptyMessage: "No products found.",
      actions: (row) => this.getRowActions(row),
    });
    window.tableRef = this.table;
  },

  setupPagination() {
    this.pagination = new window.PaginationComponent("inventory-pagination", {
      onPageChange: (page) => {
        if (InventoryPage && InventoryPage.onPageChange) {
          InventoryPage.onPageChange(page);
        }
      },
    });
  },

  getRowActions(row) {
    const safeName = this.escapeHtml(row.product_name).replace(/'/g, "\\'");
    return `
      <button class="btn btn-sm btn-primary" onclick="InventoryPage.viewProduct(${row.id})" title="View Details">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
      </button>
      <button class="btn btn-sm btn-success" onclick="InventoryPage.editProduct(${row.id})" title="Edit">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="btn btn-sm btn-danger" onclick="InventoryPage.deleteProduct(${row.id}, '${safeName}')" title="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    `;
  },

  toggleTheme() {
    document.body.classList.toggle("dark-mode");
    const isDark = document.body.classList.contains("dark-mode");
    if (window.api && window.api.updateSettings) {
      window.api
        .updateSettings({ theme: isDark ? "dark" : "light" })
        .catch(() => {});
    }
  },

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  App.init().catch((err) => {
    console.error("Failed to initialize app:", err);
    document.getElementById("page-content").innerHTML =
      `<div class="empty-state"><h3>Failed to load application</h3><p>${err.message}</p></div>`;
  });
});