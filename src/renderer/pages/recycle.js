// Recycle Bin: deleted products and expenses wait here for 30 days. Restore brings them back exactly as they were.
const RecyclePage = {
  names: { product: "Product", expense: "Expense" },

  esc(v) { return ShopInfo.esc(v == null ? "" : String(v)); },

  async load() {
    document.getElementById("page-content").innerHTML = `
      <div class="page-header">
        <div><h1>Recycle Bin</h1><p>Deleted products and expenses are kept for 30 days. Restore one if it was a mistake.</p></div>
      </div>
      <div class="card"><div class="card-body" id="recycle-table"><div class="loading"><div class="spinner"></div></div></div></div>`;
    await this.refresh();
  },

  async refresh() {
    const box = document.getElementById("recycle-table");
    if (!box) return;
    const r = await window.api.listRecycle();
    if (!r.success) {
      box.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${this.esc(r.error)}</p></div>`;
      return;
    }
    if (!r.data.length) {
      box.innerHTML = '<div class="empty-state"><h3>The Recycle Bin is empty</h3><p>Deleted products and expenses will show up here.</p></div>';
      return;
    }
    box.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr><th>Type</th><th>What</th><th>Deleted</th><th>Actions</th></tr></thead>
      <tbody>${r.data.map((i) => `<tr>
        <td><span class="badge badge-reserved">${this.esc(this.names[i.entity] || i.entity)}</span></td>
        <td><strong>${this.esc(i.label)}</strong></td>
        <td>${this.esc(i.deleted_at)}</td>
        <td><div class="action-buttons">
          <button class="btn btn-sm btn-success" onclick="RecyclePage.restore(${i.id})">Restore</button>
          <button class="btn btn-sm btn-danger" onclick="RecyclePage.purge(${i.id})">Delete forever</button>
        </div></td>
      </tr>`).join("")}</tbody></table></div>`;
  },

  async restore(id) {
    const r = await window.api.restoreRecycle(id);
    if (!r.success) return Toast.error(r.error);
    Toast.success("Restored.");
    if (App.currentPage === "recycle") this.refresh();
    else App.refreshCurrentPage();
  },

  purge(id) {
    Modal.showConfirm("Delete forever", "This cannot be undone.", async () => {
      const r = await window.api.purgeRecycle(id);
      if (!r.success) return Toast.error(r.error);
      this.refresh();
    });
  },

  // After a delete: a few seconds to change your mind.
  async offerUndo(entity, message) {
    const r = await window.api.listRecycle();
    const latest = r.success ? r.data.find((i) => i.entity === entity) : null;
    if (!latest) return Toast.success(message);
    Toast.action(message, "Undo", () => this.restore(latest.id));
  },
};
