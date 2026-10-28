/**
 * Professional Print Service
 * Provides reusable print functionality with:
 * - Category/type filtering
 * - Row selection (checkboxes to include/exclude individual rows)
 * - Professional formatting
 * - Filter summary in print output
 */

const PrintService = {
  /**
   * Show print dialog with advanced filtering and row selection
   * @param {Object} options
   * @param {string} options.title - Print report title
   * @param {Array} options.data - Array of row objects to print
   * @param {Array} options.columns - Array of column definitions [{field, label, width, align, format}]
   * @param {Object} options.filters - Available filter options
   * @param {Array} options.filters.categories - Filter by categories
   * @param {string} options.filters.categoryLabel - Label for filter group (e.g. "Category")
   * @param {Function} options.onPrint - Optional custom print handler
   * @param {boolean} options.landscape - Use landscape orientation
   * @param {string} options.subtitle - Optional subtitle/period info
   * @param {Array} options.summaryItems - Optional summary stats [{label, value}]
   * @param {Function} options.getCompanyHeader - Function to get company info
   */
  async showPrintDialog(options) {
    const company = options.getCompanyHeader
      ? await options.getCompanyHeader()
      : {
          shopName: "Laptop Inventory Manager",
          address: "",
          phone: "",
          email: "",
        };

    // Store the options on the PrintService instance for later use
    this._currentPrintOptions = options;
    this._currentPrintCompany = company;

    // Build the filter/selection dialog HTML
    const dialogHtml = this.buildSelectionDialog(options, company);

    Modal.show({
      title: `🖨️ Print ${options.title}`,
      body: dialogHtml,
      size: "lg",
      footer: `
        <button class="btn btn-secondary" onclick="window.Modal.close(); PrintService.clearPrintOptions()">Cancel</button>
        <button class="btn btn-primary" onclick="PrintService.executePrint()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
          </svg>
          Print Selected
        </button>
      `,
    });

    // Initialize category filter after modal is shown
    setTimeout(() => this.initDialogEvents(options), 100);
  },

  clearPrintOptions() {
    this._currentPrintOptions = null;
    this._currentPrintCompany = null;
  },

  buildSelectionDialog(options, company) {
    const { data, columns, filters } = options;

    // Build print options section (for sales printing)
    let printOptionsSection = "";

    // Build category filter chips + dropdown
    let categoryDropdown = "";
    if (filters && filters.categories && filters.categories.length > 0) {
      const cats = filters.categories;
      categoryDropdown = `
        <div class="print-filter-section">
          <label style="font-weight:600;font-size:13px;color:#374151;display:block;margin-bottom:6px;">
            Filter by ${filters.categoryLabel || "Category"}:
          </label>
          <select id="print-category-select" onchange="PrintService.filterByCategorySelect(this.value)" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:8px;background:#fff;color:#1e293b;">
            <option value="">All Categories (${data.length})</option>
            ${cats
              .map((c) => {
                const count = data.filter(
                  (row) =>
                    (row.category || "").toLowerCase() === c.toLowerCase(),
                ).length;
                return `<option value="${this.escapeHtml(c)}">${this.escapeHtml(c)} (${count} items)</option>`;
              })
              .join("")}
          </select>
          <div class="print-category-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
            <button class="chip active" data-category="" onclick="PrintService.filterByCategory(this, '')">All (${data.length})</button>
            ${cats
              .map((c) => {
                const count = data.filter(
                  (row) =>
                    (row.category || "").toLowerCase() === c.toLowerCase(),
                ).length;
                return `<button class="chip" data-category="${this.escapeHtml(c)}" onclick="PrintService.filterByCategory(this, '${this.escapeJsString(c)}')">${this.escapeHtml(c)} (${count})</button>`;
              })
              .join("")}
          </div>
        </div>
      `;
    }

    // Build filter bar with search
    const filterBar = `
      <div class="print-filter-bar" style="display:flex;gap:10px;margin-bottom:12px;align-items:center;flex-wrap:wrap;">
        <div class="search-box" style="max-width:300px;flex:1;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" id="print-search-input" placeholder="Search in table..." oninput="PrintService.filterRows()" style="font-size:13px;">
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#64748b;cursor:pointer;">
          <input type="checkbox" id="print-select-all" checked onchange="PrintService.toggleSelectAll(event)">
          <strong>Select All</strong>
        </label>
        <span style="font-size:12px;color:#64748b;" id="print-selected-count">Selected: ${data.length}/${data.length}</span>
      </div>
    `;

    // Build table with checkboxes
    const tableHeader = columns
      .map(
        (col) =>
          `<th style="${col.width ? `width:${col.width};` : ""}${col.align ? `text-align:${col.align};` : ""}">${col.label}</th>`,
      )
      .join("");

    const tableBody = data
      .map((row, idx) => {
        const cells = columns
          .map((col) => {
            let value = row[col.field];
            if (col.format === "currency") {
              value = Formatters.formatCurrency(value, App.currency || "PKR");
            } else if (col.format === "date") {
              value = Formatters.formatDate(value);
            } else if (col.format === "status") {
              const cls =
                value === "In Stock"
                  ? "b-instock"
                  : value === "Damaged"
                    ? "b-damaged"
                    : value === "Reserved"
                      ? "b-reserved"
                      : value === "Sold"
                        ? "b-sold"
                        : value === "Returned"
                          ? "b-returned"
                          : "b-lost";
              value = `<span class="badge-p ${cls}">${this.escapeHtml(value)}</span>`;
            } else if (col.format === "condition") {
              const cls =
                value === "Excellent"
                  ? "b-instock"
                  : value === "Good"
                    ? "b-reserved"
                    : value === "Fair"
                      ? "b-returned"
                      : "b-damaged";
              value = `<span class="badge-p ${cls}">${this.escapeHtml(value)}</span>`;
            } else {
              value = this.escapeHtml(value);
            }
            return `<td style="${col.align ? `text-align:${col.align};` : ""}">${value || "-"}</td>`;
          })
          .join("");

        return `
        <tr data-row-idx="${idx}" data-category="${this.escapeHtml(row.category || "")}">
          <td style="width:36px;text-align:center;">
            <input type="checkbox" class="print-row-checkbox" checked onchange="PrintService.updateSelectionCount()">
          </td>
          ${cells}
        </tr>
      `;
      })
      .join("");

    return `
      <div class="print-dialog-content" style="max-height:70vh;overflow-y:auto;">
        ${printOptionsSection}
        ${categoryDropdown}
        ${filterBar}
        <div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:8px;">
          <table class="print-selection-table" style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:transparent;">
                <th style="width:36px;text-align:center;"><input type="checkbox" id="print-select-all-header" checked onchange="PrintService.toggleSelectAll(event)"></th>
                ${tableHeader}
              </tr>
            </thead>
            <tbody>
              ${tableBody || '<tr><td colspan="100%" style="text-align:center;padding:30px;color:#94a3b8;">No data to display</td></tr>'}
            </tbody>
          </table>
        </div>
        ${
          options.summaryItems
            ? `
        <div style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap;">
          ${options.summaryItems
            .map(
              (item) => `
            <div style="padding:6px 14px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
              <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">${item.label}</div>
              <div style="font-size:16px;font-weight:700;color:#1e293b;">${item.value}</div>
            </div>
          `,
            )
            .join("")}
        </div>
        `
            : ""
        }
      </div>
    `;
  },

  initDialogEvents(options) {
    this.updateSelectionCount();
  },

  filterByCategory(button, category) {
    // Update active state on chips
    document.querySelectorAll(".print-category-chips .chip").forEach((chip) => {
      chip.classList.remove("active");
    });
    button.classList.add("active");

    // Sync dropdown
    const select = document.getElementById("print-category-select");
    if (select) select.value = category;

    // Filter rows
    this.applyCategoryFilter(category);
  },

  filterByCategorySelect(category) {
    // Sync chips
    document.querySelectorAll(".print-category-chips .chip").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.category === category);
    });

    // Filter rows
    this.applyCategoryFilter(category);
  },

  applyCategoryFilter(category) {
    document
      .querySelectorAll(".print-selection-table tbody tr")
      .forEach((row) => {
        if (!category) {
          row.style.display = "";
        } else {
          const rowCat = row.dataset.category || "";
          row.style.display =
            rowCat.toLowerCase() === category.toLowerCase() ? "" : "none";
        }
      });
    this.updateSelectionCount();
  },

  filterRows() {
    const search = (document.getElementById("print-search-input")?.value || "")
      .toLowerCase()
      .trim();
    document
      .querySelectorAll(".print-selection-table tbody tr")
      .forEach((row) => {
        if (!search) {
          // Check if this row matches the current category filter
          const activeChip = document.querySelector(
            ".print-category-chips .chip.active",
          );
          if (activeChip) {
            const category = activeChip.dataset.category || "";
            const rowCat = row.dataset.category || "";
            row.style.display = category
              ? rowCat.toLowerCase() === category.toLowerCase()
                ? ""
                : "none"
              : "";
          } else {
            row.style.display = "";
          }
          return;
        }
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(search) ? "" : "none";
      });
    this.updateSelectionCount();
  },

  toggleSelectAll(evt) {
    const clickedElement = evt?.target;
    const allCheckbox = document.getElementById("print-select-all");
    const headerCheckbox = document.getElementById("print-select-all-header");
    const checked = Boolean(clickedElement?.checked);

    if (allCheckbox) allCheckbox.checked = checked;
    if (headerCheckbox) headerCheckbox.checked = checked;

    document
      .querySelectorAll(".print-selection-table tbody tr")
      .forEach((row) => {
        if (row.style.display !== "none") {
          const cb = row.querySelector(".print-row-checkbox");
          if (cb) cb.checked = checked;
        }
      });

    this.updateSelectionCount();
  },

  syncSelectAllState() {
    const visibleRows = document.querySelectorAll(
      '.print-selection-table tbody tr:not([style*="display: none"])',
    );
    const visibleRowCheckboxes = Array.from(visibleRows)
      .map((row) => row.querySelector(".print-row-checkbox"))
      .filter(Boolean);

    const checkedCount = visibleRowCheckboxes.filter((cb) => cb.checked).length;
    const allChecked =
      visibleRowCheckboxes.length > 0 && checkedCount === visibleRowCheckboxes.length;
    const someChecked = checkedCount > 0 && checkedCount < visibleRowCheckboxes.length;

    const allCheckbox = document.getElementById("print-select-all");
    const headerCheckbox = document.getElementById("print-select-all-header");

    if (allCheckbox) {
      allCheckbox.checked = allChecked;
      allCheckbox.indeterminate = someChecked;
    }

    if (headerCheckbox) {
      headerCheckbox.checked = allChecked;
      headerCheckbox.indeterminate = someChecked;
    }
  },

  updateSelectionCount() {
    const total = document.querySelectorAll(
      '.print-selection-table tbody tr:not([style*="display: none"])',
    ).length;
    const selected = document.querySelectorAll(
      '.print-selection-table tbody tr:not([style*="display: none"]) .print-row-checkbox:checked',
    ).length;
    const el = document.getElementById("print-selected-count");
    if (el) el.textContent = `Selected: ${selected}/${total}`;

    this.syncSelectAllState();
  },

  getSelectedRowIndices() {
    const indices = [];
    document
      .querySelectorAll(".print-selection-table tbody tr")
      .forEach((tr) => {
        // Only consider VISIBLE rows (not hidden by category filter or search)
        if (tr.style.display !== "none") {
          const cb = tr.querySelector(".print-row-checkbox");
          if (cb && cb.checked) {
            const idx = parseInt(tr.dataset.rowIdx);
            if (!isNaN(idx)) indices.push(idx);
          }
        }
      });
    return indices;
  },

  getPrintOptions() {
    return {
      includeCustomer:
        document.getElementById("print-include-customer")?.checked || false,
      includeSales:
        document.getElementById("print-include-sales")?.checked || false,
      includePaymentHistory:
        document.getElementById("print-include-payment-history")?.checked ||
        false,
    };
  },

  async executePrint() {
    try {
      const options = this._currentPrintOptions;
      const company = this._currentPrintCompany;

      if (!options) {
        Toast.error("Print options not found. Please try again.");
        return;
      }

      const selectedIndices = this.getSelectedRowIndices();

      if (selectedIndices.length === 0) {
        Toast.warning(
          "No rows selected for printing. Please select at least one row.",
        );
        return;
      }

      // Filter data to only selected rows
      const selectedData = selectedIndices
        .map((idx) => options.data[idx])
        .filter(Boolean);

      if (selectedData.length === 0) {
        Toast.warning("No data to print.");
        return;
      }

      Modal.close();

      // Get print options (for sales printing)
      const printOpts = this.getPrintOptions();

      // Generate and open print window
      const html = await this.generatePrintHtml(
        options.title,
        selectedData,
        options,
        company,
        printOpts,
      );
      this.openPrintWindow(options.title, html);

      this.clearPrintOptions();
      Toast.success(`Printing ${selectedData.length} record(s)...`);
    } catch (err) {
      Toast.error("Print error: " + err.message);
    }
  },

  async generatePrintHtml(title, data, options, company, printOpts = {}) {
    const { columns, landscape, subtitle, summaryItems } = options;
    const dateStr = new Date().toLocaleDateString();
    const timeStr = new Date().toLocaleTimeString();
    const orientation = landscape ? "landscape" : "portrait";

    // Build applied filters summary
    const appliedFilters = [];
    const activeChip = document.querySelector(
      ".print-category-chips .chip.active",
    );
    if (activeChip && activeChip.dataset.category) {
      appliedFilters.push(
        `${options.filters?.categoryLabel || "Category"}: ${activeChip.dataset.category}`,
      );
    }
    const searchVal = document
      .getElementById("print-search-input")
      ?.value?.trim();
    if (searchVal) {
      appliedFilters.push(`Search: "${searchVal}"`);
    }

    const filterSummary =
      appliedFilters.length > 0
        ? `<div style="font-size:10px;color:#64748b;margin-bottom:8px;">Filters Applied: ${appliedFilters.join(" | ")}</div>`
        : "";

    // Build table
    const tableHeader = columns
      .map(
        (col) =>
          `<th style="${col.width ? `width:${col.width};` : ""}${col.align ? `text-align:${col.align};` : ""}">${col.label}</th>`,
      )
      .join("");

    const tableBody = data
      .map((row, idx) => {
        const cells = columns
          .map((col) => {
            let value = row[col.field];
            if (col.format === "currency") {
              value = Formatters.formatCurrency(value, App.currency || "PKR", true);
            } else if (col.format === "date") {
              value = Formatters.formatDate(value);
            } else if (col.format === "datetime") {
              value = Formatters.formatDateTime(value);
            } else if (col.format === "status" || col.format === "condition") {
              value = ReportTheme.stockBadge(value);
            } else {
              value = this.escapeHtml(value);
            }
            return `<td style="${col.align ? `text-align:${col.align};` : ""}">${value || "-"}</td>`;
          })
          .join("");
        return `<tr><td class="ctr muted">${idx + 1}</td>${cells}</tr>`;
      })
      .join("");

    const T = ReportTheme;
    const shop = company.raw ? company.raw : { shop_name: company.shopName, shop_address: company.address, phone_number: company.phone };
    const filtersLine = appliedFilters.length ? '<div class="rpt-sub">Filters: ' + appliedFilters.map((f) => this.escapeHtml(f)).join(" | ") + "</div>" : "";
    const body =
      T.header({ shop, title, meta: [["Date", dateStr], ["Records", data.length]], subtitle: subtitle || "" }) +
      filtersLine +
      (summaryItems ? T.kpis(summaryItems.map((i) => ({ label: i.label, value: i.value }))) : "") +
      '<table><thead><tr><th class="ctr" style="width:30px;">#</th>' + tableHeader + "</tr></thead>" +
      "<tbody>" + (tableBody || '<tr><td colspan="100%" class="ctr muted" style="padding:20px;">No data</td></tr>') + "</tbody></table>" +
      T.footer({ shop });
    return T.wrap({ title, body, landscape: !!landscape });
  },

  openPrintWindow(title, html) {
    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) {
      Toast.error("Please allow pop-ups for printing.");
      return;
    }
    printWindow.document.write(I18n.translateHtml(html));
    printWindow.document.close();
  },

  escapeHtml(str) {
    if (!str && str !== 0) return "";
    str = String(str);
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },

  escapeJsString(str) {
    if (!str) return "";
    return String(str)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r");
  },

  /**
   * Quick print without dialog - directly prints all data
   */
  async quickPrint(title, data, columns, options = {}) {
    const company = options.getCompanyHeader
      ? await options.getCompanyHeader()
      : {
          shopName: "Laptop Inventory Manager",
          address: "",
          phone: "",
          email: "",
        };
    const html = this.generatePrintHtml(
      title,
      data,
      { ...options, columns },
      company,
    );
    this.openPrintWindow(title, html);
  },
};
