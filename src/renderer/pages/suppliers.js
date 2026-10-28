// Suppliers Page: who the shop buys from, what it still owes, and payments made from Cash or Bank.
const SuppliersPage = {
  filters: { search: "", status: "" },
  rows: [],

  today() {
    return new Date().toISOString().split("T")[0];
  },

  money(v) {
    return Formatters.formatCurrency(v, App.currency);
  },

  esc(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  },

  // Positive = the shop owes the supplier; negative = the shop has paid ahead.
  balanceHtml(b) {
    if (b > 0) return `<strong style="color:var(--danger);">${this.money(b)}</strong> <small>we owe</small>`;
    if (b < 0) return `<strong style="color:var(--success);">${this.money(-b)}</strong> <small>advance paid</small>`;
    return '<span style="color:var(--text-muted);">Settled</span>';
  },

  async load() {
    // Default view: only suppliers with a balance. The owner's choice is remembered on this PC.
    let showAll = false;
    try { showAll = localStorage.getItem("lim_suppliers_view") === "all"; } catch (e) { /* default view */ }
    this.filters = { search: "", status: "", hasBalance: !showAll };
    document.getElementById("page-content").innerHTML = `
      <div class="page-header">
        <div>
          <h1>Suppliers</h1>
          <p>What you owe suppliers. Payments come out of Cash or Bank automatically.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="SuppliersPage.importCsv()">Import CSV</button>
          <button class="btn btn-secondary" onclick="SuppliersPage.exportCsv()">Export CSV</button>
          <button class="btn btn-secondary" onclick="SuppliersPage.showBillForm()">Add Bill</button>
          <button class="btn btn-success" onclick="SuppliersPage.showPayForm()">Pay Supplier</button>
          <button class="btn btn-primary" onclick="SuppliersPage.showForm()">Add Supplier</button>
        </div>
      </div>
      <div id="sup-totals"></div>
      <div class="card"><div class="card-body">
        <div class="filters-bar">
          <div class="search-box">
            <input type="text" id="sup-search" placeholder="Search by name, phone, address..." oninput="SuppliersPage.onSearch()">
          </div>
          <div class="filter-group">
            <select id="sup-view" onchange="SuppliersPage.onFilter()">
              <option value="balance" ${this.filters.hasBalance ? "selected" : ""}>With balance</option><option value="all" ${this.filters.hasBalance ? "" : "selected"}>All suppliers</option>
            </select>
          </div>
          <div class="filter-group">
            <select id="sup-status" onchange="SuppliersPage.onFilter()">
              <option value="">All Status</option><option value="Active">Active</option><option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div id="sup-hint" style="font-size:13px;color:var(--text-muted);margin-bottom:10px;"></div>
        <div id="sup-table"></div>
      </div></div>`;
    await this.refresh();
  },

  async refresh() {
    const [list, totals] = await Promise.all([window.api.listSuppliers(this.filters), window.api.supplierTotals()]);
    if (!document.getElementById("sup-table")) return; // owner moved to another page
    if (!list.success) {
      document.getElementById("sup-table").innerHTML = `<div class="empty-state"><h3>Error</h3><p>${this.esc(list.error)}</p></div>`;
      return;
    }
    this.rows = list.data;
    const hint = document.getElementById("sup-hint");
    if (hint) {
      const hidden = totals.success && this.filters.hasBalance && !this.filters.search && !this.filters.status ? totals.data.suppliers - this.rows.length : 0;
      hint.innerHTML = hidden > 0 ? `${hidden} supplier${hidden === 1 ? "" : "s"} with no balance hidden. <a href="#" onclick="SuppliersPage.showEveryone();return false;" style="color:var(--primary);">Show all</a>` : "";
    }
    if (totals.success) {
      const t = totals.data;
      document.getElementById("sup-totals").innerHTML = `
        <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px;">
          <div class="stat-card"><div class="stat-value" style="color:${t.payable > 0 ? "var(--danger)" : ""};">${this.money(t.payable)}</div><div class="stat-label">You owe suppliers</div><div class="stat-trend">${t.suppliersOwed} suppliers</div></div>
          <div class="stat-card"><div class="stat-value">${this.money(t.advance)}</div><div class="stat-label">Paid ahead (advance)</div></div>
          <div class="stat-card"><div class="stat-value">${t.suppliers}</div><div class="stat-label">Suppliers</div></div>
        </div>`;
    }
    this.renderTable();
  },

  renderTable() {
    const el = document.getElementById("sup-table");
    if (this.rows.length === 0) {
      el.innerHTML = this.filters.hasBalance && !this.filters.search && !this.filters.status
        ? '<div class="empty-state"><h3>No supplier has a balance</h3><p>Every supplier is settled. Choose All suppliers to see them.</p></div>'
        : '<div class="empty-state"><h3>No suppliers yet</h3><p>Add a supplier to record bills and payments.</p></div>';
      return;
    }
    el.innerHTML = `
      <div class="table-wrapper"><table>
        <thead><tr><th>Supplier</th><th>Phone</th><th style="text-align:right;">Bought</th><th style="text-align:right;">Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${this.rows.map((r) => `
          <tr>
            <td><a href="#" onclick="SuppliersPage.showStatement(${r.id});return false;" style="color:var(--primary);text-decoration:none;"><strong>${this.esc(r.name)}</strong></a></td>
            <td>${this.esc([r.phone, r.phone2].filter(Boolean).join(" | ")) || "-"}</td>
            <td style="text-align:right;">${this.money(r.opening + r.purchased)}</td>
            <td style="text-align:right;">${this.money(r.paid)}</td>
            <td>${this.balanceHtml(r.balance)}</td>
            <td><span class="badge ${r.status === "Active" ? "badge-in-stock" : "badge-lost"}">${r.status}</span></td>
            <td><div class="action-buttons">
              <button class="btn btn-sm btn-success" onclick="SuppliersPage.showPayForm(${r.id})" ${r.status !== "Active" ? "disabled" : ""}>Pay</button>
              <button class="btn btn-sm btn-secondary" onclick="SuppliersPage.showBillForm(${r.id})" ${r.status !== "Active" ? "disabled" : ""}>Bill</button>
              <button class="btn btn-sm btn-primary" onclick="SuppliersPage.showStatement(${r.id})">Statement</button>
              <button class="btn btn-sm btn-warning" onclick="SuppliersPage.showForm(${r.id})">Edit</button>
              ${r.purchased === 0 && r.paid === 0 ? `<button class="btn btn-sm btn-danger" onclick="SuppliersPage.removeSupplier(${r.id})">Delete</button>` : ""}
            </div></td>
          </tr>`).join("")}</tbody>
      </table></div>`;
  },

  importCsv() {
    CsvTools.openImport({
      title: "Import suppliers from CSV",
      templateName: "suppliers-import-template.csv",
      templateRows: [["name", "phone", "phone2", "address", "notes", "opening_balance"], ["Example Supplier", "03001234567", "", "Hall Road, Lahore", "Main laptop supplier", "1500"]],
      run: (rows, dryRun) => window.api.importSuppliers(rows, dryRun),
      onDone: () => this.refresh(),
    });
  },

  async exportCsv() {
    const r = await window.api.listSuppliers({});
    if (!r.success) return Toast.error(r.error);
    CsvTools.download("suppliers-" + CsvTools.stamp() + ".csv", [
      ["Supplier", "Phone", "Phone 2", "Address", "Status", "Bought", "Paid", "We owe"],
      ...r.data.map((s) => [s.name, s.phone, s.phone2, s.address, s.status, s.opening + s.purchased, s.paid, s.balance]),
    ]);
  },

  onSearch() {
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      this.filters.search = document.getElementById("sup-search").value.trim();
      this.refresh();
    }, 300);
  },

  showEveryone() {
    document.getElementById("sup-view").value = "all";
    this.onFilter();
  },

  onFilter() {
    this.filters.status = document.getElementById("sup-status").value;
    this.filters.hasBalance = document.getElementById("sup-view").value !== "all";
    try { localStorage.setItem("lim_suppliers_view", this.filters.hasBalance ? "balance" : "all"); } catch (e) { /* not remembered */ }
    this.refresh();
  },

  // ---- Add / edit supplier
  showForm(id = null) {
    const r = id ? this.rows.find((x) => x.id === id) : null;
    const v = r || { name: "", phone: "", phone2: "", address: "", notes: "", status: "Active", opening: "" };
    const body = `
      <form onsubmit="return false;">
        <div class="form-row">
          <div class="form-group"><label>Supplier Name *</label><input class="form-control" id="sf-name" value="${this.esc(v.name)}"></div>
          <div class="form-group"><label>Phone</label><input class="form-control" id="sf-phone" value="${this.esc(v.phone)}"></div>
          <div class="form-group"><label>Second Phone</label><input class="form-control" id="sf-phone2" value="${this.esc(v.phone2)}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Address</label><input class="form-control" id="sf-address" value="${this.esc(v.address)}"></div>
          <div class="form-group"><label>Amount You Already Owe (Opening)</label>
            <input type="number" min="0" step="0.01" class="form-control" id="sf-opening" value="${v.opening || ""}"></div>
          ${id ? `<div class="form-group"><label>Status</label><select class="form-control" id="sf-status">
            <option value="Active" ${v.status === "Active" ? "selected" : ""}>Active</option>
            <option value="Inactive" ${v.status === "Inactive" ? "selected" : ""}>Inactive</option></select></div>` : ""}
        </div>
        <div class="form-group"><label>Notes</label><input class="form-control" id="sf-notes" value="${this.esc(v.notes)}"></div>
      </form>`;
    Modal.showForm(id ? "Edit Supplier" : "Add Supplier", body, () => this.saveSupplier(id), "lg");
  },

  async saveSupplier(id) {
    const val = (i) => document.getElementById(i)?.value ?? "";
    const data = {
      name: val("sf-name"), phone: val("sf-phone"), phone2: val("sf-phone2"), address: val("sf-address"),
      notes: val("sf-notes"), opening: val("sf-opening"), status: document.getElementById("sf-status")?.value || "Active",
    };
    const res = id ? await window.api.updateSupplier(id, data) : await window.api.addSupplier(data);
    if (!res.success) return Toast.error(res.error);
    Modal.close();
    Toast.success("Supplier saved.");
    this.refresh();
  },

  removeSupplier(id) {
    const r = this.rows.find((x) => x.id === id);
    Modal.showConfirm("Delete Supplier", `Delete ${r ? r.name : "this supplier"}? This cannot be undone.`, async () => {
      if (!(await SuperPrompt.requireForAction("Super-password to delete this supplier"))) return;
      const res = await window.api.deleteSupplier(id);
      if (!res.success) return Toast.error(res.error);
      Toast.success("Supplier deleted.");
      this.refresh();
    });
  },

  // ---- Pay supplier / add bill
  supplierSelect(selectedId, locked) {
    const active = this.rows.filter((s) => s.status === "Active" || s.id === selectedId);
    return `<div class="form-group"><label>Supplier *</label>
      <select class="form-control" id="pf-supplier" ${locked ? "disabled" : ""} onchange="SuppliersPage.updateHint()">
        <option value="">Select supplier</option>
        ${active.map((s) => `<option value="${s.id}" ${s.id === selectedId ? "selected" : ""}>${this.esc(s.name)}</option>`).join("")}
      </select></div>`;
  },

  sourceSelect(id, current) {
    return `<select class="form-control" id="${id}" onchange="SuppliersPage.updateHint()">
      <option value="Cash" ${current === "Cash" ? "selected" : ""}>Cash</option>
      <option value="Bank" ${current === "Bank" ? "selected" : ""}>Bank Transfer</option></select>`;
  },

  async loadFunds() {
    const r = await window.api.getDashboardData({});
    this.funds = r.success && r.data.cashInHand !== null ? { Cash: r.data.cashInHand, Bank: r.data.bankBalance } : null;
  },

  // Shows the account balance and the supplier balance after this payment.
  updateHint() {
    const el = document.getElementById("pf-hint");
    if (!el) return;
    const src = document.getElementById("pf-source")?.value;
    const sid = Number(document.getElementById("pf-supplier")?.value) || 0;
    const amount = parseFloat(document.getElementById("pf-amount")?.value) || 0;
    const paidNow = document.getElementById("pf-paidnow");
    const pay = paidNow ? parseFloat(paidNow.value) || 0 : amount;
    const sup = this.rows.find((s) => s.id === sid);
    const parts = [];
    if (this.funds && src) {
      const left = this.funds[src] + (this.editing && this.editing.payment_source === src ? this.editing.paid : 0) - pay;
      parts.push(`${src === "Cash" ? "Cash in hand" : "Bank balance"}: ${this.money(this.funds[src])}${pay ? ` &rarr; <strong style="color:${left < 0 ? "var(--danger)" : "inherit"};">${this.money(left)}</strong>` : ""}`);
    }
    if (sup && !paidNow) {
      const after = sup.balance - pay;
      parts.push(`${this.esc(sup.name)}: ${this.money(sup.balance)} &rarr; <strong>${this.money(after)}</strong>${after < 0 ? " (advance)" : ""}`);
    }
    el.innerHTML = parts.join("<br>");
  },


  async showPayForm(supplierId = null, entry = null) {
    this.returnTo = this.statementOpenFor; // the form replaces the statement; reopen it after saving
    this.statementOpenFor = null;
    await this.loadFunds();
    this.editing = entry;
    const v = entry ? { date: entry.entry_date, amount: entry.paid, source: entry.payment_source, ref: entry.reference_no, note: entry.note } : { date: this.today(), amount: "", source: "Cash", ref: "", note: "" };
    const body = `
      <form onsubmit="return false;">
        ${this.supplierSelect(supplierId, !!supplierId)}
        <div class="form-row">
          <div class="form-group"><label>Date *</label><input type="date" class="form-control" id="pf-date" value="${v.date}"></div>
          <div class="form-group"><label>Amount *</label><input type="number" min="0.01" step="0.01" class="form-control" id="pf-amount" value="${v.amount}" oninput="SuppliersPage.updateHint()"></div>
          <div class="form-group"><label>Paid From *</label>${this.sourceSelect("pf-source", v.source)}</div>
        </div>
        <div class="form-group"><label>Reference (cheque / transaction no.)</label><input class="form-control" id="pf-ref" value="${this.esc(v.ref)}"></div>
        <div class="form-group"><label>Note</label><input class="form-control" id="pf-note" value="${this.esc(v.note)}"></div>
        <div id="pf-hint" style="font-size:13px;color:var(--text-muted);"></div>
      </form>`;
    Modal.showForm(entry ? "Edit Payment" : "Pay Supplier", body, () => this.savePayment(supplierId, entry), "lg");
    this.updateHint();
  },

  async savePayment(supplierId, entry) {
    const sid = supplierId || Number(document.getElementById("pf-supplier").value);
    if (!sid) return Toast.error("Select a supplier.");
    const data = {
      supplier_id: sid,
      entry_date: document.getElementById("pf-date").value,
      amount: parseFloat(document.getElementById("pf-amount").value),
      payment_source: document.getElementById("pf-source").value,
      reference_no: document.getElementById("pf-ref").value,
      note: document.getElementById("pf-note").value,
    };
    const res = entry ? await window.api.updateSupplierEntry(entry.id, data) : await window.api.addSupplierPayment(data);
    if (!res.success) return Toast.error(res.error);
    Modal.close();
    Toast.success("Payment saved. Cash/Bank updated.");
    this.afterChange(sid);
  },

  async showBillForm(supplierId = null, entry = null) {
    this.returnTo = this.statementOpenFor;
    this.statementOpenFor = null;
    await this.loadFunds();
    this.editing = null;
    const v = entry ? { date: entry.entry_date, amount: entry.charge, ref: entry.reference_no, note: entry.note } : { date: this.today(), amount: "", ref: "", note: "" };
    const body = `
      <form onsubmit="return false;">
        ${this.supplierSelect(supplierId, !!supplierId)}
        <div class="form-row">
          <div class="form-group"><label>Date *</label><input type="date" class="form-control" id="pf-date" value="${v.date}"></div>
          <div class="form-group"><label>Bill Total *</label><input type="number" min="0.01" step="0.01" class="form-control" id="pf-amount" value="${v.amount}"></div>
          ${entry ? "" : `<div class="form-group"><label>Paid Now (optional)</label><input type="number" min="0" step="0.01" class="form-control" id="pf-paidnow" oninput="SuppliersPage.updateHint()"></div>
          <div class="form-group"><label>Paid From</label>${this.sourceSelect("pf-source", "Cash")}</div>`}
        </div>
        <div class="form-group"><label>Bill / Reference No.</label><input class="form-control" id="pf-ref" value="${this.esc(v.ref)}"></div>
        <div class="form-group"><label>What was bought (note)</label><input class="form-control" id="pf-note" value="${this.esc(v.note)}"></div>
        <div id="pf-hint" style="font-size:13px;color:var(--text-muted);"></div>
      </form>`;
    Modal.showForm(entry ? "Edit Bill" : "Add Bill", body, () => this.saveBill(supplierId, entry), "lg");
    this.updateHint();
  },

  async saveBill(supplierId, entry) {
    const sid = supplierId || Number(document.getElementById("pf-supplier").value);
    if (!sid) return Toast.error("Select a supplier.");
    const data = {
      supplier_id: sid,
      entry_date: document.getElementById("pf-date").value,
      amount: parseFloat(document.getElementById("pf-amount").value),
      reference_no: document.getElementById("pf-ref").value,
      note: document.getElementById("pf-note").value,
      paid_now: document.getElementById("pf-paidnow")?.value || 0,
      payment_source: document.getElementById("pf-source")?.value,
    };
    const res = entry ? await window.api.updateSupplierEntry(entry.id, data) : await window.api.addSupplierPurchase(data);
    if (!res.success) return Toast.error(res.error);
    Modal.close();
    Toast.success("Bill saved.");
    this.afterChange(sid);
  },

  // Refresh the list, and reopen the statement if the owner came from it.
  afterChange(supplierId) {
    this.refresh();
    if (this.returnTo === supplierId) {
      this.returnTo = null;
      this.showStatement(supplierId, true);
    }
  },

  // ---- Statement
  async showStatement(id, keepRange = false) {
    if (!keepRange) this.range = { from: "", to: "" };
    this.statementOpenFor = id;
    const res = await window.api.supplierStatement(id, this.range);
    if (!res.success) return Toast.error(res.error);
    this.statement = res.data;
    const s = res.data.supplier;
    const rowsHtml = res.data.rows.map((e) => `
      <tr>
        <td>${Formatters.formatDate(e.entry_date)}</td>
        <td>${e.entry_type === "Payment" ? `Payment (${e.payment_source})` : e.entry_type === "Purchase" ? "Bill" : "Opening balance"}</td>
        <td>${this.esc([e.reference_no, e.note].filter(Boolean).join(" - "))}</td>
        <td style="text-align:right;">${e.charge ? this.money(e.charge) : ""}</td>
        <td style="text-align:right;">${e.paid ? this.money(e.paid) : ""}</td>
        <td style="text-align:right;font-weight:600;">${this.money(e.balance)}</td>
        <td>${e.entry_type === "Opening" ? "" : `
          <button class="btn btn-sm btn-success" onclick="SuppliersPage.editEntry(${e.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="SuppliersPage.deleteEntry(${e.id})">Delete</button>`}</td>
      </tr>`).join("");
    const forward = res.data.broughtForward !== null
      ? `<tr><td colspan="5"><em>Balance brought forward</em></td><td style="text-align:right;font-weight:600;">${this.money(res.data.broughtForward)}</td><td></td></tr>` : "";
    Modal.show({
      title: `Statement - ${this.esc(s.name)}`,
      size: "lg",
      body: `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
          <input type="date" class="form-control" style="width:auto;" id="ss-from" value="${this.range.from}" onchange="SuppliersPage.onRange()">
          <span>to</span>
          <input type="date" class="form-control" style="width:auto;" id="ss-to" value="${this.range.to}" onchange="SuppliersPage.onRange()">
          <span style="margin-left:auto;font-size:15px;">Balance: ${this.balanceHtml(s.balance)}</span>
        </div>
        ${res.data.rows.length || forward ? `<div class="table-wrapper"><table>
          <thead><tr><th>Date</th><th>Type</th><th>Details</th><th style="text-align:right;">Bill</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Balance</th><th></th></tr></thead>
          <tbody>${forward}${rowsHtml}</tbody></table></div>` : '<div class="empty-state"><p>No entries in this period.</p></div>'}`,
      footer: `
        <button class="btn btn-secondary" onclick="SuppliersPage.printStatement()">Print</button>
        <button class="btn btn-success" onclick="SuppliersPage.shareStatement()">WhatsApp</button>
        <button class="btn btn-secondary" onclick="SuppliersPage.showBillForm(${id})">Add Bill</button>
        <button class="btn btn-primary" onclick="SuppliersPage.showPayForm(${id})">Pay Supplier</button>`,
      onClose: () => { this.statementOpenFor = null; },
    });
  },

  onRange() {
    this.range = { from: document.getElementById("ss-from").value, to: document.getElementById("ss-to").value };
    this.showStatement(this.statementOpenFor, true);
  },

  async editEntry(entryId) {
    const e = this.statement.rows.find((r) => r.id === entryId);
    if (!e) return;
    const sid = this.statement.supplier.id;
    if (!(await SuperPrompt.requireForAction("Super-password to edit this entry"))) {
      this.statementOpenFor = null;
      return;
    }
    if (e.entry_type === "Payment") this.showPayForm(sid, e);
    else this.showBillForm(sid, e);
  },

  deleteEntry(entryId) {
    const sid = this.statement.supplier.id;
    this.statementOpenFor = null;
    Modal.showConfirm("Delete Entry", "This entry will be removed. A deleted payment goes back into Cash or Bank.", async () => {
      if (!(await SuperPrompt.requireForAction("Super-password to delete this entry"))) return;
      const res = await window.api.deleteSupplierEntry(entryId);
      if (!res.success) return Toast.error(res.error);
      Toast.success("Entry deleted.");
      this.returnTo = sid;
      this.afterChange(sid);
    });
  },

  async statementHtml() {
    const st = (await window.api.getSettings()).data || {};
    const T = ReportTheme;
    const fx = (v) => Formatters.formatCurrency(v, App.currency, true);
    const d = this.statement;
    const s = d.supplier;
    const bal = s.balance;
    const typeLabel = (e) => (e.entry_type === "Payment" ? "Payment (" + e.payment_source + ")" : e.entry_type === "Purchase" ? "Bill" : "Opening balance");
    const rows = d.rows.map((e) => '<tr><td>' + Formatters.formatDate(e.entry_date) + '</td><td>' + typeLabel(e) + '</td><td>' + this.esc([e.reference_no, e.note].filter(Boolean).join(" - ")) + '</td>' +
      '<td class="num ' + (e.charge ? 'neg' : 'muted') + '">' + (e.charge ? '+ ' + fx(e.charge) : '-') + '</td>' +
      '<td class="num ' + (e.paid ? 'pos' : 'muted') + '">' + (e.paid ? '&minus; ' + fx(e.paid) : '-') + '</td>' +
      '<td class="num strong">' + fx(e.balance) + '</td></tr>').join('');
    const forward = d.broughtForward !== null
      ? '<tr><td colspan="5"><i>Balance brought forward</i></td><td class="num strong">' + fx(d.broughtForward) + '</td></tr>' : '';
    const body =
      T.header({ shop: st, title: 'Supplier Statement', meta: [['Date', Formatters.formatDate(new Date().toISOString())]] }) +
      '<div class="info"><div class="box"><div class="k">Supplier</div><div class="v">' + this.esc(s.name) + '</div>' +
        '<div class="s">' + (this.esc([s.phone, s.phone2].filter(Boolean).join(" | ")) || '-') + (s.address ? ' &middot; ' + this.esc(s.address) : '') + '</div></div>' +
        '<div class="box" style="max-width:190px;"><div class="k">Account status</div><div class="v" style="margin-top:3px;">' +
          (bal > 0.005 ? T.badge('bad', 'We owe') : bal < -0.005 ? T.badge('ok', 'Advance paid') : T.badge('ok', 'Settled')) + '</div></div></div>' +
      T.dueBox(bal > 0.005 ? { label: 'Balance we owe', amount: fx(bal), tone: 'bad' }
        : bal < -0.005 ? { label: 'Advance paid to supplier', amount: fx(-bal), tone: 'ok' }
        : { label: 'Account settled', amount: fx(0), tone: 'ok' }) +
      T.section('Account activity') +
      '<table><thead><tr><th>Date</th><th>Type</th><th>Details</th><th class="num">Bill (+)</th><th class="num">Paid (&minus;)</th><th class="num">Balance</th></tr></thead><tbody>' + forward + rows + '</tbody>' +
      '<tfoot><tr><td colspan="3">Totals in this period</td><td class="num">' + fx(d.totals.charged) + '</td><td class="num">' + fx(d.totals.paid) + '</td><td class="num">' + fx(bal) + '</td></tr></tfoot></table>' +
      T.footer({ shop: st });
    return T.wrap({ title: 'Supplier Statement', body, toolbar: false });
  },

  async printStatement() {
    const html = I18n.translateHtml(await this.statementHtml());
    const w = window.open("", "_blank", "width=800,height=600");
    if (!w) return Toast.error("Please allow pop-ups for printing.");
    w.document.write(html.replace("</body>", "<script>window.onload=function(){setTimeout(function(){window.print()},400)};<\/script></body>"));
    w.document.close();
  },

  async shareStatement() {
    const d = this.statement;
    const s = d.supplier;
    const t = (x) => I18n.t(x);
    const shopName = document.getElementById("shop-name")?.textContent || "";
    const message =
      t("Dear " + s.name + ",") + "\n\n" +
      t("Here is our account statement with you (" + new Date().toLocaleDateString() + ").") + "\n" +
      (s.balance < 0 ? t("Advance paid") : t("Balance we owe")) + ": " + Formatters._formatCurrency(Math.abs(s.balance), App.currency, true) +
      "\n\n" + t("Thank you!") + "\n- " + shopName;
    await WhatsAppLink.shareOne({ html: I18n.translateHtml(await this.statementHtml()), customerName: "Supplier-" + s.name, phone: s.phone || "", message });
  },
};
