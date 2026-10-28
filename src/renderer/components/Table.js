// Table Component
class TableComponent {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.columns = options.columns || [];
    this.onRowClick = options.onRowClick || null;
    this.sortBy = options.sortBy || 'created_at';
    this.sortOrder = options.sortOrder || 'desc';
    this.onSort = options.onSort || null;
    this.emptyMessage = options.emptyMessage || 'No data found.';
    this.actions = options.actions || null;
    this.selection = options.selection || null;
    this.rows = [];
  }

  setColumns(columns) {
    this.columns = columns;
  }

  render(data) {
    if (!this.container) return;
    this.rows = data || [];

    if (!data || data.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
          <h3>${this.emptyMessage}</h3>
          <p>Add items to get started.</p>
        </div>
      `;
      return;
    }

    let html = '<div class="table-wrapper"><table><thead><tr>';

    if (this.selection) {
      const selected = this.selection.getSelected();
      const all = this.rows.length > 0 && this.rows.every((row) => selected.has(String(row.id)));
      html += `<th style="width:38px;"><input type="checkbox" aria-label="Select all visible products" ${all ? 'checked' : ''} onchange="window.tableRef.toggleAllVisible(this.checked)"></th>`;
    }

    // Header
    this.columns.forEach(col => {
      const sortIndicator = col.sortable !== false && this.sortBy === col.field
        ? (this.sortOrder === 'asc' ? ' &#9650;' : ' &#9660;')
        : '';
      const sortableAttr = col.sortable !== false ? ` onclick="window.tableRef.sort('${col.field}')"` : '';
      html += `<th${sortableAttr} style="${col.width ? 'width:' + col.width + ';' : ''}">${col.label}${sortIndicator}</th>`;
    });

    if (this.actions) {
      html += '<th style="width:120px;">Actions</th>';
    }

    html += '</tr></thead><tbody>';

    // Rows
    data.forEach((row, index) => {
      html += '<tr>';
      if (this.selection) {
        const checked = this.selection.getSelected().has(String(row.id));
        html += `<td><input type="checkbox" aria-label="Select product ${Number(row.id)}" ${checked ? 'checked' : ''} onchange="window.tableRef.toggleSelection(${Number(row.id)},this.checked)"></td>`;
      }
      this.columns.forEach(col => {
        const value = this.getCellValue(row, col);
        html += `<td>${value}</td>`;
      });

      if (this.actions) {
        html += `<td><div class="action-buttons">${this.actions(row)}</div></td>`;
      }

      html += '</tr>';
    });

    html += '</tbody></table></div>';
    this.container.innerHTML = html;
  }

  toggleSelection(id, checked) {
    if (!this.selection) return;
    this.selection.onChange(String(id), checked);
    this.render(this.rows);
  }

  toggleAllVisible(checked) {
    if (!this.selection) return;
    this.rows.forEach((row) => this.selection.onChange(String(row.id), checked));
    this.render(this.rows);
  }

  getCellValue(row, col) {
    const value = row[col.field];

    if (col.formatter) {
      return col.formatter(value, row);
    }

    if (col.type === 'currency') {
      if (col.secret && (value === null || value === undefined)) {
        return '<a href="#" class="reveal-link" onclick="App.toggleCost(); return false;" title="Click and enter the super-password to show">••••</a>';
      }
      return Formatters.formatCurrency(value, App.currency || 'USD');
    }

    if (col.type === 'date') {
      return Formatters.formatDate(value);
    }

    if (col.type === 'datetime') {
      return Formatters.formatDateTime(value);
    }

    // Inline status dropdown (for quick change directly in table)
    if (col.type === 'status-select') {
      const statuses = ['In Stock', 'Reserved', 'Sold', 'Returned', 'Damaged', 'Lost'];
      const badgeClass = Formatters.getStatusBadgeClass(value);
      const options = statuses.map(s => 
        `<option value="${s}"${value === s ? ' selected' : ''}>${s}</option>`
      ).join('');
      return `<select class="table-inline-select" data-id="${row.id}" data-field="status" onchange="window.tableRef.inlineStatusChange(this, ${row.id})" style="background:transparent;border:1px solid var(--border-color);border-radius:4px;padding:3px 6px;font-size:12px;cursor:pointer;">${options}</select>`;
    }

    // Inline condition dropdown
    if (col.type === 'condition-select') {
      const conditions = ['Excellent', 'Good', 'Fair', 'Damaged', 'For Parts'];
      const options = conditions.map(c => 
        `<option value="${c}"${value === c ? ' selected' : ''}>${c}</option>`
      ).join('');
      return `<select class="table-inline-select" data-id="${row.id}" data-field="condition" onchange="window.tableRef.inlineConditionChange(this, ${row.id})" style="background:transparent;border:1px solid var(--border-color);border-radius:4px;padding:3px 6px;font-size:12px;cursor:pointer;">${options}</select>`;
    }

    if (col.type === 'status') {
      const badgeClass = Formatters.getStatusBadgeClass(value);
      return `<span class="badge ${badgeClass}">${value || '-'}</span>`;
    }

    if (col.type === 'condition') {
      const badgeClass = Formatters.getConditionBadgeClass(value);
      return `<span class="badge ${badgeClass}">${value || '-'}</span>`;
    }

    if (col.type === 'number') {
      return value !== undefined && value !== null ? Number(value).toLocaleString() : '-';
    }

    return value !== undefined && value !== null ? value : '-';
  }

  sort(field) {
    if (this.sortBy === field) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = field;
      this.sortOrder = 'asc';
    }

    if (this.onSort) {
      this.onSort(this.sortBy, this.sortOrder);
    }
  }

  async inlineStatusChange(selectEl, id) {
    const newStatus = selectEl.value;
    try {
      const result = await window.api.changeProductStatus(id, newStatus);
      if (result.success) {
        window.Toast.success('Status updated to ' + newStatus);
        // Refresh the table to update dashboard stats
        if (App.currentPage === 'inventory' && InventoryPage) {
          InventoryPage.refresh();
        }
      } else {
        window.Toast.error(result.error || 'Failed to update status');
        if (InventoryPage) InventoryPage.refresh();
      }
    } catch (err) {
      window.Toast.error('Failed to update status: ' + err.message);
      if (InventoryPage) InventoryPage.refresh();
    }
  }

  async inlineConditionChange(selectEl, id) {
    const newCondition = selectEl.value;
    try {
      const result = await window.api.changeProductCondition(id, newCondition);
      if (result.success) {
        window.Toast.success('Condition updated to ' + newCondition);
        if (App.currentPage === 'inventory' && InventoryPage) {
          InventoryPage.refresh();
        }
      } else {
        window.Toast.error(result.error || 'Failed to update condition');
        if (InventoryPage) InventoryPage.refresh();
      }
    } catch (err) {
      window.Toast.error('Failed to update condition: ' + err.message);
      if (InventoryPage) InventoryPage.refresh();
    }
  }
}

// Global reference
try {
  window.TableComponent = TableComponent;
} catch (e) {
  console.error('TableComponent init error:', e);
}
