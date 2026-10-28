// Lists & Setup: the categories and locations the shop picks from, managed in one place.
const ListsPage = {
  tabs: [
    { key: "product_category", label: "Product categories", noun: "category", used: "products", hint: "Shown when adding a product and in the stock filters." },
    { key: "expense_category", label: "Expense categories", noun: "category", used: "expenses", hint: "Shown when recording an expense." },
    { key: "storage_location", label: "Storage locations", noun: "location", used: "products", hint: "Shelf, drawer or locker a product is kept in." },
  ],
  current: "product_category",
  items: [],

  esc(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  },

  tab() {
    return this.tabs.find((t) => t.key === this.current);
  },

  async load() {
    document.getElementById("page-content").innerHTML = `
      <div class="page-header">
        <div>
          <h1>Lists &amp; Setup</h1>
          <p>The choices your shop uses. Rename, merge duplicates or hide what you no longer need.</p>
        </div>
      </div>
      <div class="tab-bar" id="lists-tabs">
        ${this.tabs.map((t) => `<button class="tab-item ${t.key === this.current ? "active" : ""}" data-tab="${t.key}" onclick="ListsPage.switchTab('${t.key}')">${t.label}</button>`).join("")}
      </div>
      <div class="card">
        <div class="card-body">
          <p id="lists-hint" style="color:var(--text-secondary);margin-bottom:14px;"></p>
          <div style="display:flex;gap:8px;margin-bottom:16px;max-width:460px;">
            <input type="text" class="form-control" id="lists-new-name" placeholder="" onkeydown="if(event.key==='Enter')ListsPage.add()">
            <button class="btn btn-primary" onclick="ListsPage.add()">Add</button>
          </div>
          <div id="lists-table"></div>
        </div>
      </div>`;
    await this.refresh();
  },

  async refresh() {
    const t = this.tab();
    document.getElementById("lists-hint").textContent = t.hint;
    document.getElementById("lists-new-name").placeholder = `New ${t.noun} name`;
    const res = await window.api.getList(this.current, { includeArchived: true });
    const box = document.getElementById("lists-table");
    if (!res.success) {
      box.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${this.esc(res.error)}</p></div>`;
      return;
    }
    this.items = res.data;
    if (!this.items.length) {
      box.innerHTML = `<div class="empty-state"><h3>No ${t.noun === "category" ? "categories" : "locations"} yet</h3><p>Type a name above and press Add.</p></div>`;
      return;
    }
    const last = this.items.length - 1;
    box.innerHTML = `<div style="overflow-x:auto;"><table>
      <thead><tr><th>Name</th><th>Used by</th><th>Status</th><th style="width:1%;white-space:nowrap;">Actions</th></tr></thead>
      <tbody>${this.items.map((it, i) => `
        <tr>
          <td><strong>${this.esc(it.name)}</strong></td>
          <td>${it.usage} ${t.used}</td>
          <td><span class="badge ${it.active ? "badge-in-stock" : "badge-lost"}">${it.active ? "Active" : "Hidden"}</span></td>
          <td style="white-space:nowrap;">
            <button class="btn btn-sm btn-secondary" title="Move up" ${i === 0 ? "disabled" : ""} onclick="ListsPage.move(${i}, -1)">&uarr;</button>
            <button class="btn btn-sm btn-secondary" title="Move down" ${i === last ? "disabled" : ""} onclick="ListsPage.move(${i}, 1)">&darr;</button>
            <button class="btn btn-sm btn-success" onclick="ListsPage.rename(${it.id})">Rename</button>
            <button class="btn btn-sm btn-secondary" ${this.items.length < 2 ? "disabled" : ""} onclick="ListsPage.merge(${it.id})">Merge</button>
            <button class="btn btn-sm btn-secondary" onclick="ListsPage.toggle(${it.id}, ${it.active ? "false" : "true"})">${it.active ? "Hide" : "Show"}</button>
            <button class="btn btn-sm btn-danger" ${it.usage > 0 ? 'disabled title="In use. Hide it or merge it instead."' : ""} onclick="ListsPage.remove(${it.id})">Delete</button>
          </td>
        </tr>`).join("")}</tbody>
    </table></div>`;
  },

  async switchTab(key) {
    this.current = key;
    document.querySelectorAll("#lists-tabs .tab-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === key));
    await this.refresh();
  },

  async run(call, okMessage) {
    const res = await call;
    if (!res.success) {
      Toast.error(res.error || "Could not save.");
      return false;
    }
    if (okMessage) Toast.success(okMessage);
    await this.refresh();
    await this.refreshCategories();
    return true;
  },

  // Product pickers read App.categories, so keep it in step with the list.
  async refreshCategories() {
    try {
      const r = await window.api.getCategories();
      if (r && r.success && Array.isArray(r.data)) App.categories = r.data;
    } catch (e) { /* pickers reload on their next visit */ }
  },

  async add() {
    const input = document.getElementById("lists-new-name");
    const name = input.value.trim();
    if (!name) return Toast.warning("Type a name first.");
    if (await this.run(window.api.addListItem(this.current, name), "Added.")) input.value = "";
  },

  rename(id) {
    const it = this.items.find((x) => x.id === id);
    Modal.showForm(`Rename ${this.esc(it.name)}`, `
      <div class="form-group"><label>New name</label>
        <input type="text" class="form-control" id="lists-rename" value="${this.esc(it.name)}"></div>
      <p style="color:var(--text-secondary);font-size:13px;">Every record using this name is updated too (${it.usage}).</p>`,
    async () => {
      const name = document.getElementById("lists-rename").value.trim();
      if (!name) return Toast.warning("Type a name.");
      if (await this.run(window.api.renameListItem(id, name), "Renamed.")) Modal.close();
    });
    setTimeout(() => { const f = document.getElementById("lists-rename"); if (f) { f.focus(); f.select(); } }, 50);
  },

  merge(id) {
    const it = this.items.find((x) => x.id === id);
    const others = this.items.filter((x) => x.id !== id);
    Modal.showForm(`Merge ${this.esc(it.name)}`, `
      <p style="margin-bottom:12px;">Move everything using <strong>${this.esc(it.name)}</strong> (${it.usage}) into another item, then remove <strong>${this.esc(it.name)}</strong>. Use this to fix spelling mistakes.</p>
      <div class="form-group"><label>Merge into</label>
        <select class="form-control" id="lists-merge-into">${others.map((o) => `<option value="${o.id}">${this.esc(o.name)}</option>`).join("")}</select></div>`,
    async () => {
      const into = Number(document.getElementById("lists-merge-into").value);
      if (await this.run(window.api.mergeListItems(id, into), "Merged.")) Modal.close();
    });
  },

  toggle(id, active) {
    return this.run(window.api.setListItemActive(id, active), active ? "Shown again." : "Hidden from new entries.");
  },

  remove(id) {
    const it = this.items.find((x) => x.id === id);
    Modal.showConfirm("Delete item", `Delete <strong>${this.esc(it.name)}</strong>? Nothing uses it.`, () => this.run(window.api.removeListItem(id), "Deleted."));
  },

  async move(index, delta) {
    const ids = this.items.map((x) => x.id);
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await this.run(window.api.reorderList(this.current, ids));
  },
};
