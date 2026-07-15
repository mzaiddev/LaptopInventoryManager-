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
    const company = options.getCompanyHeader ? await options.getCompanyHeader() : { shopName: 'Laptop Inventory Manager', address: '', phone: '', email: '' };
    
    // Store the options on the PrintService instance for later use
    this._currentPrintOptions = options;
    this._currentPrintCompany = company;
    
    // Build the filter/selection dialog HTML
    const dialogHtml = this.buildSelectionDialog(options, company);
    
    Modal.show({
      title: `🖨️ Print ${options.title}`,
      body: dialogHtml,
      size: 'lg',
      footer: `
        <button class="btn btn-secondary" onclick="window.Modal.close(); PrintService.clearPrintOptions()">Cancel</button>
        <button class="btn btn-primary" onclick="PrintService.executePrint()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
            <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
          </svg>
          Print Selected
        </button>
      `
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
    let printOptionsSection = '';
    if (options.showPrintOptions) {
      printOptionsSection = `
        <div class="print-options-section" style="margin-bottom:16px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
          <label style="font-weight:600;font-size:13px;color:#374151;display:block;margin-bottom:8px;">
            Print Options:
          </label>
          <div style="display:flex;flex-wrap:wrap;gap:16px;">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#64748b;cursor:pointer;">
              <input type="checkbox" id="print-include-customer" ${options.includeCustomer ? 'checked' : ''} onchange="PrintService.updateSelectionCount()">
              <span>Include Customer Details</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#64748b;cursor:pointer;">
              <input type="checkbox" id="print-include-sales" ${options.includeSales ? '' : ''} onchange="PrintService.updateSelectionCount()">
              <span>Include Related Sales</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#64748b;cursor:pointer;">
              <input type="checkbox" id="print-include-payment-history" ${options.includePaymentHistory ? '' : ''} onchange="PrintService.updateSelectionCount()">
              <span>Include Payment History</span>
            </label>
          </div>
        </div>
      `;
    }
    
    // Build category filter chips + dropdown
    let categoryChips = '';
    let categoryDropdown = '';
    if (filters && filters.categories && filters.categories.length > 0) {
      const cats = filters.categories;
      // Always show all categories including ones with 0 count
      categoryDropdown = `
        <div class="print-filter-section">
          <label style="font-weight:600;font-size:13px;color:#374151;display:block;margin-bottom:6px;">
            Filter by ${filters.categoryLabel || 'Category'}:
          </label>
          <select id="print-category-select" onchange="PrintService.filterByCategorySelect(this.value)" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:8px;background:#fff;color:#1e293b;">
            <option value="">All Categories (${data.length})</option>
            ${cats.map(c => {
              const count = data.filter(row => (row.category || '').toLowerCase() === c.toLowerCase()).length;
              return `<option value="${this.escapeHtml(c)}">${this.escapeHtml(c)} (${count} items)</option>`;
            }).join('')}
          </select>
          <div class="print-category-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
            <button class="chip active" data-category="" onclick="PrintService.filterByCategory(this, '')">All (${data.length})</button>
            ${cats.map(c => {
              const count = data.filter(row => (row.category || '').toLowerCase() === c.toLowerCase()).length;
              return `<button class="chip" data-category="${this.escapeHtml(c)}" onclick="PrintService.filterByCategory(this, '${this.escapeJsString(c)}')">${this.escapeHtml(c)} (${count})</button>`;
            }).join('')}
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
          <input type="checkbox" id="print-select-all" checked onchange="PrintService.toggleSelectAll()">
          <strong>Select All</strong>
        </label>
        <span style="font-size:12px;color:#64748b;" id="print-selected-count">Selected: ${data.length}/${data.length}</span>
      </div>
    `;

    // Build table with checkboxes
    const tableHeader = columns.map(col => 
      `<th style="${col.width ? `width:${col.width};` : ''}${col.align ? `text-align:${col.align};` : ''}">${col.label}</th>`
    ).join('');

    const tableBody = data.map((row, idx) => {
      const cells = columns.map(col => {
        let value = row[col.field];
        if (col.format === 'currency') {
          value = Formatters.formatCurrency(value, App.currency || 'PKR');
        } else if (col.format === 'date') {
          value = Formatters.formatDate(value);
        } else if (col.format === 'status') {
          const cls = value === 'In Stock' ? 'b-instock' : value === 'Damaged' ? 'b-damaged' : value === 'Reserved' ? 'b-reserved' : value === 'Sold' ? 'b-sold' : value === 'Returned' ? 'b-returned' : 'b-lost';
          value = `<span class="badge-p ${cls}">${this.escapeHtml(value)}</span>`;
        } else if (col.format === 'condition') {
          const cls = value === 'Excellent' ? 'b-instock' : value === 'Good' ? 'b-reserved' : value === 'Fair' ? 'b-returned' : 'b-damaged';
          value = `<span class="badge-p ${cls}">${this.escapeHtml(value)}</span>`;
        } else {
          value = this.escapeHtml(value);
        }
        return `<td style="${col.align ? `text-align:${col.align};` : ''}">${value || '-'}</td>`;
      }).join('');

      return `
        <tr data-row-idx="${idx}" data-category="${this.escapeHtml(row.category || '')}">
          <td style="width:36px;text-align:center;">
            <input type="checkbox" class="print-row-checkbox" checked onchange="PrintService.updateSelectionCount()">
          </td>
          ${cells}
        </tr>
      `;
    }).join('');

    return `
      <div class="print-dialog-content" style="max-height:70vh;overflow-y:auto;">
        ${printOptionsSection}
        ${categoryDropdown}
        ${filterBar}
        <div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:8px;">
          <table class="print-selection-table" style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="width:36px;text-align:center;"><input type="checkbox" id="print-select-all-header" checked onchange="PrintService.toggleSelectAll()"></th>
                ${tableHeader}
              </tr>
            </thead>
            <tbody>
              ${tableBody || '<tr><td colspan="100%" style="text-align:center;padding:30px;color:#94a3b8;">No data to display</td></tr>'}
            </tbody>
          </table>
        </div>
        ${options.summaryItems ? `
        <div style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap;">
          ${options.summaryItems.map(item => `
            <div style="padding:6px 14px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
              <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">${item.label}</div>
              <div style="font-size:16px;font-weight:700;color:#1e293b;">${item.value}</div>
            </div>
          `).join('')}
        </div>
        ` : ''}
      </div>
    `;
  },

  initDialogEvents(options) {
    // Initialize any custom event handlers
  },

  filterByCategory(button, category) {
    // Update active state on chips
    document.querySelectorAll('.print-category-chips .chip').forEach(chip => {
      chip.classList.remove('active');
    });
    button.classList.add('active');

    // Sync dropdown
    const select = document.getElementById('print-category-select');
    if (select) select.value = category;

    // Filter rows
    this.applyCategoryFilter(category);
  },

  filterByCategorySelect(category) {
    // Sync chips
    document.querySelectorAll('.print-category-chips .chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.category === category);
    });

    // Filter rows
    this.applyCategoryFilter(category);
  },

  applyCategoryFilter(category) {
    document.querySelectorAll('.print-selection-table tbody tr').forEach(row => {
      if (!category) {
        row.style.display = '';
      } else {
        const rowCat = row.dataset.category || '';
        row.style.display = rowCat.toLowerCase() === category.toLowerCase() ? '' : 'none';
      }
    });
    this.updateSelectionCount();
  },

  filterRows() {
    const search = (document.getElementById('print-search-input')?.value || '').toLowerCase().trim();
    document.querySelectorAll('.print-selection-table tbody tr').forEach(row => {
      if (!search) {
        // Check if this row matches the current category filter
        const activeChip = document.querySelector('.print-category-chips .chip.active');
        if (activeChip) {
          const category = activeChip.dataset.category || '';
          const rowCat = row.dataset.category || '';
          row.style.display = category ? (rowCat.toLowerCase() === category.toLowerCase() ? '' : 'none') : '';
        } else {
          row.style.display = '';
        }
        return;
      }
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(search) ? '' : 'none';
    });
    this.updateSelectionCount();
  },

  toggleSelectAll() {
    const checked = document.getElementById('print-select-all')?.checked || document.getElementById('print-select-all-header')?.checked || false;
    // Sync both checkboxes
    const allCheckbox = document.getElementById('print-select-all');
    const headerCheckbox = document.getElementById('print-select-all-header');
    if (allCheckbox) allCheckbox.checked = checked;
    if (headerCheckbox) headerCheckbox.checked = checked;
    
    // Toggle all visible rows - only if checked is true, otherwise uncheck
    document.querySelectorAll('.print-selection-table tbody tr').forEach(row => {
      if (row.style.display !== 'none') {
        const cb = row.querySelector('.print-row-checkbox');
        if (cb) cb.checked = checked;
      }
    });
    this.updateSelectionCount();
  },

  updateSelectionCount() {
    const total = document.querySelectorAll('.print-selection-table tbody tr:not([style*="display: none"])').length;
    const selected = document.querySelectorAll('.print-selection-table tbody tr:not([style*="display: none"]) .print-row-checkbox:checked').length;
    const el = document.getElementById('print-selected-count');
    if (el) el.textContent = `Selected: ${selected}/${total}`;
  },

  getSelectedRowIndices() {
    const indices = [];
    document.querySelectorAll('.print-selection-table tbody tr').forEach(tr => {
      // Only consider VISIBLE rows (not hidden by category filter or search)
      if (tr.style.display !== 'none') {
        const cb = tr.querySelector('.print-row-checkbox');
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
      includeCustomer: document.getElementById('print-include-customer')?.checked || false,
      includeSales: document.getElementById('print-include-sales')?.checked || false,
      includePaymentHistory: document.getElementById('print-include-payment-history')?.checked || false
    };
  },

  async executePrint() {
    try {
      const options = this._currentPrintOptions;
      const company = this._currentPrintCompany;
      
      if (!options) {
        Toast.error('Print options not found. Please try again.');
        return;
      }

      const selectedIndices = this.getSelectedRowIndices();
      
      if (selectedIndices.length === 0) {
        Toast.warning('No rows selected for printing. Please select at least one row.');
        return;
      }

      // Filter data to only selected rows
      const selectedData = selectedIndices.map(idx => options.data[idx]).filter(Boolean);
      
      if (selectedData.length === 0) {
        Toast.warning('No data to print.');
        return;
      }

      Modal.close();
      
      // Get print options (for sales printing)
      const printOpts = this.getPrintOptions();
      
      // Generate and open print window
      const html = await this.generatePrintHtml(options.title, selectedData, options, company, printOpts);
      this.openPrintWindow(options.title, html);
      
      this.clearPrintOptions();
      Toast.success(`Printing ${selectedData.length} record(s)...`);
    } catch (err) {
      Toast.error('Print error: ' + err.message);
    }
  },

  async generatePrintHtml(title, data, options, company, printOpts = {}) {
    const { columns, landscape, subtitle, summaryItems } = options;
    const dateStr = new Date().toLocaleDateString();
    const timeStr = new Date().toLocaleTimeString();
    const orientation = landscape ? 'landscape' : 'portrait';
    
    // Build applied filters summary
    const appliedFilters = [];
    const activeChip = document.querySelector('.print-category-chips .chip.active');
    if (activeChip && activeChip.dataset.category) {
      appliedFilters.push(`${options.filters?.categoryLabel || 'Category'}: ${activeChip.dataset.category}`);
    }
    const searchVal = document.getElementById('print-search-input')?.value?.trim();
    if (searchVal) {
      appliedFilters.push(`Search: "${searchVal}"`);
    }
    
    const filterSummary = appliedFilters.length > 0 
      ? `<div style="font-size:10px;color:#64748b;margin-bottom:8px;">Filters Applied: ${appliedFilters.join(' | ')}</div>`
      : '';

    // Build table
    const tableHeader = columns.map(col => 
      `<th style="${col.width ? `width:${col.width};` : ''}${col.align ? `text-align:${col.align};` : ''}">${col.label}</th>`
    ).join('');

    const tableBody = data.map((row, idx) => {
      const cells = columns.map(col => {
        let value = row[col.field];
        if (col.format === 'currency') {
          value = Formatters.formatCurrency(value, App.currency || 'PKR');
        } else if (col.format === 'date') {
          value = Formatters.formatDate(value);
        } else if (col.format === 'datetime') {
          value = Formatters.formatDateTime(value);
        } else if (col.format === 'status') {
          const cls = value === 'In Stock' ? 'b-instock' : value === 'Damaged' ? 'b-damaged' : value === 'Reserved' ? 'b-reserved' : value === 'Sold' ? 'b-sold' : value === 'Returned' ? 'b-returned' : 'b-lost';
          value = `<span class="badge-p ${cls}">${this.escapeHtml(value)}</span>`;
        } else if (col.format === 'condition') {
          const cls = value === 'Excellent' ? 'b-instock' : value === 'Good' ? 'b-reserved' : value === 'Fair' ? 'b-returned' : 'b-damaged';
          value = `<span class="badge-p ${cls}">${this.escapeHtml(value)}</span>`;
        } else {
          value = this.escapeHtml(value);
        }
        return `<td style="${col.align ? `text-align:${col.align};` : ''}">${value || '-'}</td>`;
      }).join('');
      return `<tr><td style="text-align:center;font-weight:600;color:#94a3b8;">${idx + 1}</td>${cells}</tr>`;
    }).join('');

    // Summary items
    let summaryHtml = '';
    if (summaryItems) {
      summaryHtml = `
        <div class="summary-row" style="margin-bottom:12px;">
          ${summaryItems.map(item => `
            <div class="summary-item">
              <div class="label">${item.label}</div>
              <div class="value">${item.value}</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Shop info
    const shopInfo = `
      <div style="text-align:center;margin-bottom:4px;">
        <h1 style="font-size:20px;color:#1e293b;margin-bottom:2px;">${this.escapeHtml(company.shopName)}</h1>
        ${company.address ? `<p style="font-size:11px;color:#64748b;margin:1px 0;">${this.escapeHtml(company.address)}</p>` : ''}
        <div style="font-size:10px;color:#94a3b8;">
          ${company.phone ? `Phone: ${this.escapeHtml(company.phone)} | ` : ''}
          ${company.email ? `Email: ${this.escapeHtml(company.email)} | ` : ''}
          Printed: ${dateStr} ${timeStr}
        </div>
      </div>
    `;

    return `<!DOCTYPE html>
<html>
<head><title>${this.escapeHtml(title)}</title>
<style>
  @page { margin: 10mm; size: A4 ${orientation}; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; padding: 15px; background: #fff; font-size: 11px; }
  .print-header { text-align: center; margin-bottom: 14px; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
  .print-header h1 { font-size: 16px; color: #1e293b; }
  .print-header .sub { font-size: 10px; color: #64748b; }
  .print-footer { margin-top: 14px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 6px; }
  .print-info-line { display: flex; justify-content: space-between; font-size: 10px; color: #64748b; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  th { background: #2563eb; color: #fff; padding: 5px 6px; text-align: left; font-weight: 600; white-space: nowrap; font-size: 9px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  td { padding: 3px 6px; border-bottom: 1px solid #e2e8f0; color: #334155; }
  tr:nth-child(even) { background: #f8fafc; }
  .summary-row { display: flex; gap: 12px; flex-wrap: wrap; }
  .summary-item { padding: 5px 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; }
  .summary-item .label { font-size: 8px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .summary-item .value { font-size: 13px; font-weight: 700; color: #1e293b; }
  .badge-p { padding: 1px 5px; border-radius: 8px; font-size: 8px; font-weight: 500; display: inline-block; }
  .b-instock { background: #dcfce7; color: #166534; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .b-reserved { background: #fef3c7; color: #92400e; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .b-sold { background: #dbeafe; color: #1e40af; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .b-damaged { background: #fee2e2; color: #991b1b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .b-returned { background: #fce7f3; color: #9d174d; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .b-lost { background: #f3f4f6; color: #374151; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-actions { text-align: center; margin-bottom: 10px; }
  .print-actions button { padding: 7px 18px; margin: 0 5px; border: none; border-radius: 5px; cursor: pointer; font-size: 12px; }
  .btn-print { background: #2563eb; color: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .btn-pdf { background: #16a34a; color: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .filter-tag { display: inline-block; padding: 2px 8px; background: #eef2ff; color: #4338ca; border-radius: 10px; font-size: 9px; margin-right: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media print { .print-actions { display: none; } body { padding: 0; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
</style>
</head>
<body>
  <div class="print-actions">
    <button class="btn-print" onclick="window.print()">🖨️ Print</button>
    <button class="btn-pdf" onclick="window.print()">📥 Download PDF</button>
  </div>
  <div class="print-header">
    ${shopInfo}
    <h1>${this.escapeHtml(title)}</h1>
    ${subtitle ? `<div class="sub">${subtitle}</div>` : ''}
    ${filterSummary}
  </div>
  ${summaryHtml}
  <div class="print-info-line">
    <span>Records: ${data.length}</span>
    <span>${dateStr}</span>
  </div>
  <table>
    <thead><tr><th style="width:30px;text-align:center;">#</th>${tableHeader}</tr></thead>
    <tbody>${tableBody || '<tr><td colspan="100%" style="text-align:center;padding:20px;color:#94a3b8;">No data</td></tr>'}</tbody>
  </table>
  <div class="print-footer">
    <p>Generated by Laptop Inventory Manager | ${dateStr} ${timeStr}</p>
  </div>
</body>
</html>`;
  },

  openPrintWindow(title, html) {
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      Toast.error('Please allow pop-ups for printing.');
      return;
    }
    printWindow.document.write(html);
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
    if (!str) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  },

  /**
   * Quick print without dialog - directly prints all data
   */
  async quickPrint(title, data, columns, options = {}) {
    const company = options.getCompanyHeader ? await options.getCompanyHeader() : { shopName: 'Laptop Inventory Manager', address: '', phone: '', email: '' };
    const html = this.generatePrintHtml(title, data, { ...options, columns }, company);
    this.openPrintWindow(title, html);
  }
};