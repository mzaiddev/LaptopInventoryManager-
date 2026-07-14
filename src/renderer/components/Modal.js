// Modal Component
class ModalComponent {
  constructor() {
    this.overlay = document.getElementById("modal-overlay");
    this.content = document.getElementById("modal-content");
    this.currentCallback = null;
    if (this.overlay) {
      this.setupListeners();
    }
  }

  setupListeners() {
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.close();
      }
    });
  }

  show(options = {}) {
    const {
      title = "",
      body = "",
      footer = "",
      size = "",
      onClose = null,
    } = options;

    this.currentCallback = onClose;
    this.content.className = "modal-content" + (size ? " modal-" + size : "");
    this.content.innerHTML = `
      <div class="modal-header">
        <h2>${title}</h2>
        <button class="modal-close" onclick="window.Modal.close()">&times;</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ""}
    `;

    this.overlay.style.display = "flex";
  }

  close() {
    if (!this.overlay) return;
    this.overlay.style.display = "none";
    if (this.content) this.content.innerHTML = "";
    if (this.currentCallback) {
      this.currentCallback();
      this.currentCallback = null;
    }
  }

  showForm(title, formHtml, onSave, size = "") {
    const footer = `
      <button class="btn btn-secondary" onclick="window.Modal.close()">Cancel</button>
      <button class="btn btn-primary" id="modal-save-btn">Save</button>
    `;

    this.show({ title, body: formHtml, footer, size });

    const saveBtn = document.getElementById("modal-save-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        if (onSave) onSave();
      });
    }
  }

  showConfirm(title, message, onConfirm) {
    const body = `
      <div class="confirm-dialog">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <h3>${title}</h3>
        <p>${message}</p>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="window.Modal.close()">Cancel</button>
      <button class="btn btn-danger" id="modal-confirm-btn">Delete</button>
    `;

    this.show({ title: "Confirm", body, footer });

    const confirmBtn = document.getElementById("modal-confirm-btn");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => {
        this.close();
        if (onConfirm) onConfirm();
      });
    }
  }

  showProductForm(productData = null, onSave) {
    const isEdit = productData !== null;
    const title = isEdit ? "Edit Product" : "Add Product";
    const pd = productData || {};

    const statusOptions = [
      "In Stock",
      "Reserved",
      "Sold",
      "Returned",
      "Damaged",
      "Lost",
    ];
    const conditionOptions = [
      "Excellent",
      "Good",
      "Fair",
      "Damaged",
      "For Parts",
    ];
    const defaultCategories = [
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
    // Use categories from App if available, otherwise fall back to defaults
    const categories =
      window.App &&
      Array.isArray(window.App.categories) &&
      window.App.categories.length > 0
        ? window.App.categories
        : defaultCategories;

    const catOptions = categories
      .map(
        (c) =>
          `<option value="${c}"${pd.category === c ? " selected" : ""}>${c}</option>`,
      )
      .join("");

    const statusOpts = statusOptions
      .map(
        (s) =>
          `<option value="${s}"${pd.status === s ? " selected" : ""}>${s}</option>`,
      )
      .join("");

    const conditionOpts = conditionOptions
      .map(
        (c) =>
          `<option value="${c}"${pd.condition === c ? " selected" : ""}>${c}</option>`,
      )
      .join("");

    // brands removed

    const body = `
      <form id="product-form" class="product-form" onsubmit="return false;">
        <div class="form-row-3">
          <div class="form-group">
            <label>Product Name *</label>
            <input type="text" class="form-control" id="pf-name" value="${this.escapeHtml(pd.product_name || "")}" required>
            <div class="form-error" id="pf-name-error"></div>
          </div>
          <div class="form-group">
            <label>Category *</label>
            <select class="form-control" id="pf-category" required>
              <option value="">Select Category</option>
              ${catOptions}
            </select>
            <div class="form-error" id="pf-category-error"></div>
          </div>
          <!-- Brand field removed -->
        </div>
        <div class="form-row-3">
          <div class="form-group">
            <label>Model</label>
            <input type="text" class="form-control" id="pf-model" value="${this.escapeHtml(pd.model || "")}">
          </div>
          <div class="form-group">
            <label>Serial Number</label>
            <input type="text" class="form-control" id="pf-serial" value="${this.escapeHtml(pd.serial_number || "")}">
          </div>
          <div class="form-group">
            <label>Supplier</label>
            <input type="text" class="form-control" id="pf-supplier" value="${this.escapeHtml(pd.supplier || "")}">
          </div>
        </div>
        <div class="form-row-3">
          <div class="form-group">
            <label>Purchase Price *</label>
            <input type="number" step="0.01" min="0" class="form-control" id="pf-purchase-price" value="${pd.purchase_price || ""}" required>
            <div class="form-error" id="pf-purchase-price-error"></div>
          </div>
          <!-- Selling Price removed - managed from Sales module -->
          <div class="form-group">
            <label>Quantity *</label>
            <input type="number" min="0" class="form-control" id="pf-quantity" value="${pd.quantity || 1}" required>
            <div class="form-error" id="pf-quantity-error"></div>
          </div>
        </div>
        <div class="form-row-3">
          <div class="form-group">
            <label>Purchase Date</label>
            <input type="date" class="form-control" id="pf-purchase-date" value="${pd.purchase_date || ""}">
          </div>
          <div class="form-group">
            <label>Warranty</label>
            <input type="text" class="form-control" id="pf-warranty" value="${this.escapeHtml(pd.warranty || "")}" placeholder="e.g., 1 year">
          </div>
          <div class="form-group">
            <label>Storage Location</label>
            <input type="text" class="form-control" id="pf-location" value="${this.escapeHtml(pd.storage_location || "")}" placeholder="Shelf/Rack">
          </div>
        </div>
        <div class="form-row-3">
          <div class="form-group">
            <label>Status</label>
            <select class="form-control" id="pf-status">
              ${statusOpts}
            </select>
          </div>
          <div class="form-group">
            <label>Condition</label>
            <select class="form-control" id="pf-condition">
              ${conditionOpts}
            </select>
          </div>
          <div class="form-group">
            <label>&nbsp;</label>
          </div>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea class="form-control" id="pf-notes" rows="3">${this.escapeHtml(pd.notes || "")}</textarea>
        </div>
      </form>
    `;

    this.showForm(
      title,
      body,
      () => {
        const data = this.collectFormData();
        const validators = window.Validators;
        if (validators) {
          const errors = validators.validateProduct(data);
          this.clearErrors();
          if (errors.length > 0) {
            errors.forEach((err) => {
              const errorEl = document.getElementById(`pf-${err.field}-error`);
              if (errorEl) errorEl.textContent = err.message;
            });
            return;
          }
        }
        this.close();
        if (onSave) onSave(data);
      },
      "lg",
    );
  }

  collectFormData() {
    return {
      product_name: document.getElementById("pf-name")?.value?.trim() || "",
      category: document.getElementById("pf-category")?.value || "",
      model: document.getElementById("pf-model")?.value?.trim() || "",
      serial_number: document.getElementById("pf-serial")?.value?.trim() || "",
      supplier: document.getElementById("pf-supplier")?.value?.trim() || "",
      purchase_price:
        parseFloat(document.getElementById("pf-purchase-price")?.value) || 0,
      selling_price: 0,
      quantity: parseInt(document.getElementById("pf-quantity")?.value) || 1,
      purchase_date: document.getElementById("pf-purchase-date")?.value || "",
      warranty: document.getElementById("pf-warranty")?.value?.trim() || "",
      storage_location:
        document.getElementById("pf-location")?.value?.trim() || "",
      notes: document.getElementById("pf-notes")?.value?.trim() || "",
      status: document.getElementById("pf-status")?.value || "In Stock",
      condition: document.getElementById("pf-condition")?.value || "Excellent",
    };
  }

  clearErrors() {
    document
      .querySelectorAll(".form-error")
      .forEach((el) => (el.textContent = ""));
  }

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}

// Create global instance
try {
  window.Modal = new ModalComponent();
  console.log("Modal initialized");
} catch (e) {
  console.error("Modal init error:", e);
}
