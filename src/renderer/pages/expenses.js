// Expenses Page: money the shop spends, paid from Cash or Bank.
const ExpensesPage = {
  filters: { from: "", to: "", search: "", page: 1, pageSize: 25 },
  rows: [],
  categories: [], // loaded from Settings > Lists & Setup

  async load() {
    this.filters = { from: "", to: "", search: "", page: 1, pageSize: 25 };
    document.getElementById("page-content").innerHTML = `
      <div class="page-header">
        <div>
          <h1>Expenses</h1>
          <p>Record shop expenses paid in cash or from the bank</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="ExpensesPage.exportCsv()">Export CSV</button>
          <button class="btn btn-primary" onclick="ExpensesPage.showForm()">Add Expense</button>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="card-body">
          <div class="form-row">
            <div class="form-group"><label>From</label>
              <input type="date" class="form-control" id="exp-from" onchange="ExpensesPage.onFilter()"></div>
            <div class="form-group"><label>To</label>
              <input type="date" class="form-control" id="exp-to" onchange="ExpensesPage.onFilter()"></div>
            <div class="form-group"><label>Search</label>
              <input type="text" class="form-control" id="exp-search" placeholder="Category or note" oninput="ExpensesPage.onSearch()"></div>
          </div>
        </div>
      </div>
      <div id="exp-totals"></div>
      <div class="card"><div class="card-body" id="exp-table"></div></div>
    `;
    await this.refresh();
  },

  async refresh() {
    const f = this.filters;
    const [list, totals] = await Promise.all([window.api.listExpenses(f), window.api.expenseTotals(f)]);
    if (!list.success) {
      document.getElementById("exp-table").innerHTML = `<div class="empty-state"><h3>Error</h3><p>${this.esc(list.error)}</p></div>`;
      return;
    }
    this.rows = list.data.rows;
    this.renderTotals(totals.success ? totals.data : null);
    this.renderTable(list.data);
  },

  renderTotals(t) {
    const el = document.getElementById("exp-totals");
    if (!t) { el.innerHTML = ""; return; }
    const c = App.currency;
    const cats = t.byCategory.map((x) => `${this.esc(x.category)}: ${Formatters.formatCurrency(x.amount, c)}`).join(" &nbsp;|&nbsp; ");
    el.innerHTML = `
      <div class="card" style="margin-bottom:16px;"><div class="card-body">
        <strong>Total: ${Formatters.formatCurrency(t.total, c)}</strong>
        &nbsp;&nbsp; Cash: ${Formatters.formatCurrency(t.cash, c)} &nbsp; Bank: ${Formatters.formatCurrency(t.bank, c)}
        ${cats ? `<div style="margin-top:8px;font-size:13px;">${cats}</div>` : ""}
      </div></div>`;
  },

  renderTable({ rows, total }) {
    const el = document.getElementById("exp-table");
    if (rows.length === 0) {
      el.innerHTML = '<div class="empty-state"><h3>No expenses found</h3><p>Add an expense to get started.</p></div>';
      return;
    }
    const pages = Math.max(1, Math.ceil(total / this.filters.pageSize));
    el.innerHTML = `
      <div class="table-wrapper"><table>
        <thead><tr><th>Date</th><th>Category</th><th>Paid From</th><th style="text-align:right;">Amount</th><th>Note</th><th>Actions</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td>${Formatters.formatDate(r.expense_date)}</td>
            <td>${this.esc(r.category)}</td>
            <td>${r.payment_source === "Bank" ? "Bank" : "Cash"}</td>
            <td style="text-align:right;font-weight:600;">${Formatters.formatCurrency(r.amount, App.currency)}</td>
            <td>${this.esc(r.note)}</td>
            <td>
              <button class="btn btn-sm btn-success" onclick="ExpensesPage.showForm(${r.id})">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="ExpensesPage.remove(${r.id})">Delete</button>
            </td>
          </tr>`).join("")}</tbody>
      </table></div>
      <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:12px;">
        <button class="btn btn-secondary btn-sm" ${this.filters.page <= 1 ? "disabled" : ""} onclick="ExpensesPage.goTo(${this.filters.page - 1})">Previous</button>
        <span>Page ${this.filters.page} of ${pages}</span>
        <button class="btn btn-secondary btn-sm" ${this.filters.page >= pages ? "disabled" : ""} onclick="ExpensesPage.goTo(${this.filters.page + 1})">Next</button>
      </div>`;
  },

  async exportCsv() {
    const r = await window.api.listExpenses({ ...this.filters, page: 1, pageSize: 100000 });
    if (!r.success) return Toast.error(r.error);
    CsvTools.download("expenses-" + CsvTools.stamp() + ".csv", [
      ["Date", "Category", "Amount", "Paid from", "Note"],
      ...r.data.rows.map((e) => [e.expense_date, e.category, e.amount, e.payment_source, e.note]),
    ]);
  },

  goTo(page) {
    this.filters.page = page;
    this.refresh();
  },

  onFilter() {
    this.filters.from = document.getElementById("exp-from").value;
    this.filters.to = document.getElementById("exp-to").value;
    this.filters.page = 1;
    this.refresh();
  },

  onSearch() {
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      this.filters.search = document.getElementById("exp-search").value.trim();
      this.filters.page = 1;
      this.refresh();
    }, 300);
  },

  async showForm(id = null) {
    const res = await window.api.getList("expense_category");
    this.categories = res.success ? res.data.map((i) => i.name) : [];
    const r = id ? this.rows.find((x) => x.id === id) : null;
    const v = r || { expense_date: new Date().toISOString().split("T")[0], category: "", amount: "", payment_source: "Cash", note: "" };
    const body = `
      <form onsubmit="return false;">
        <div class="form-row">
          <div class="form-group"><label>Date *</label>
            <input type="date" class="form-control" id="ef-date" value="${v.expense_date}"></div>
          <div class="form-group"><label>Amount *</label>
            <input type="number" min="0.01" step="0.01" class="form-control" id="ef-amount" value="${v.amount}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Category *</label>
            <select class="form-control" id="ef-category">
              <option value="">Select category</option>
              ${[...new Set([...this.categories, ...(v.category ? [v.category] : [])])].map((c) => `<option value="${this.esc(c)}" ${c === v.category ? "selected" : ""}>${this.esc(c)}</option>`).join("")}
            </select>
            <small style="color:var(--text-muted);">Add or hide categories in Lists &amp; Setup.</small></div>
          <div class="form-group"><label>Paid From *</label>
            <select class="form-control" id="ef-source">
              <option value="Cash" ${v.payment_source === "Cash" ? "selected" : ""}>Cash</option>
              <option value="Bank" ${v.payment_source === "Bank" ? "selected" : ""}>Bank Transfer</option>
            </select></div>
        </div>
        <div class="form-group"><label>Note</label>
          <input class="form-control" id="ef-note" value="${this.esc(v.note)}"></div>
      </form>`;
    Modal.showForm(id ? "Edit Expense" : "Add Expense", body, () => this.save(id), "sm");
  },

  async save(id) {
    const data = {
      expense_date: document.getElementById("ef-date").value,
      amount: parseFloat(document.getElementById("ef-amount").value),
      category: document.getElementById("ef-category").value,
      payment_source: document.getElementById("ef-source").value,
      note: document.getElementById("ef-note").value,
    };
    const res = id ? await window.api.updateExpense(id, data) : await window.api.addExpense(data);
    if (!res.success) {
      Toast.error(res.error);
      return;
    }
    Modal.close();
    Toast.success("Expense saved.");
    this.refresh();
  },

  remove(id) {
    Modal.showConfirm("Delete Expense", "This expense will be removed permanently.", async () => {
      const res = await window.api.deleteExpense(id);
      if (!res.success) return Toast.error(res.error);
      RecyclePage.offerUndo("expense", "Expense deleted.");
      this.refresh();
    });
  },

  esc(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  },
};
