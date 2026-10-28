// Trade-ins: buying a used device from a customer. It goes into stock; the value is credited to the customer
// or paid out in cash or by bank.
const TradeInsPage = {
  esc(v) { return ShopInfo.esc(v == null ? "" : String(v)); },
  settle: { credit: "Credit on account", cash: "Paid in cash", bank: "Paid by bank" },

  async load() {
    document.getElementById("page-content").innerHTML = `
      <div class="page-header">
        <div><h1>Trade-ins</h1><p>Used laptops bought from customers</p></div>
        <button class="btn btn-primary" onclick="TradeInsPage.showForm()">New Trade-in</button>
      </div>
      <div class="card"><div class="card-body" id="ti-table"><div class="loading"><div class="spinner"></div></div></div></div>`;
    await this.refresh();
  },

  async refresh() {
    const r = await window.api.listTradeIns();
    const box = document.getElementById("ti-table");
    if (!box) return;
    if (!r.success) { box.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${this.esc(r.error)}</p></div>`; return; }
    if (!r.data.length) { box.innerHTML = '<div class="empty-state"><h3>No trade-ins yet</h3><p>Record a used laptop you buy from a customer.</p></div>'; return; }
    box.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr><th>Date</th><th>Customer</th><th>Device</th><th style="text-align:right;">Value</th><th>Settled</th></tr></thead>
      <tbody>${r.data.map((t) => `<tr><td>${this.esc(t.trade_date)}</td><td>${this.esc(t.customer_name)}</td><td><strong>${this.esc(t.product_name)}</strong></td><td style="text-align:right;">${Pickers.money(t.value)}</td><td>${this.settle[t.settlement]}</td></tr>`).join("")}</tbody></table></div>`;
  },

  async showForm() {
    const cats = (App.categories || []).map((c) => `<option value="${this.esc(c)}" ${c === "Laptop" ? "selected" : ""}>${this.esc(c)}</option>`).join("");
    Modal.showForm("New trade-in", `
      <div class="form-group"><label>Customer *</label><select class="form-control" id="ti-customer">${await Pickers.customerOptions()}</select></div>
      <div class="form-row">
        <div class="form-group"><label>Device *</label><input class="form-control" id="ti-name" placeholder="e.g. Lenovo ThinkPad T14"></div>
        <div class="form-group"><label>Category</label><select class="form-control" id="ti-category">${cats}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Model</label><input class="form-control" id="ti-model"></div>
        <div class="form-group"><label>Serial number</label><input class="form-control" id="ti-serial"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Condition</label><select class="form-control" id="ti-condition"><option>Excellent</option><option selected>Good</option><option>Fair</option><option>For Parts</option></select></div>
        <div class="form-group"><label>Trade-in value *</label><input type="number" min="0.01" step="0.01" class="form-control" id="ti-value"></div>
      </div>
      <div class="form-group"><label>Settle as *</label>
        <select class="form-control" id="ti-settle"><option value="credit">Credit on the customer's account</option><option value="cash">Pay cash</option><option value="bank">Pay by bank</option></select></div>
      <div class="form-row">
        <div class="form-group"><label>Date</label><input type="date" class="form-control" id="ti-date" value="${Pickers.today()}"></div>
        <div class="form-group"><label>Notes</label><input class="form-control" id="ti-notes"></div>
      </div>`,
    async () => {
      const customer = Number(document.getElementById("ti-customer").value);
      if (!customer) return Toast.warning("Choose the customer.");
      const r = await window.api.addTradeIn({
        customer_id: customer, product_name: document.getElementById("ti-name").value, category: document.getElementById("ti-category").value,
        model: document.getElementById("ti-model").value, serial_number: document.getElementById("ti-serial").value,
        condition: document.getElementById("ti-condition").value, value: parseFloat(document.getElementById("ti-value").value),
        settlement: document.getElementById("ti-settle").value, trade_date: document.getElementById("ti-date").value, notes: document.getElementById("ti-notes").value,
      });
      if (!r.success) return Toast.error(r.error);
      Modal.close();
      Toast.success("Trade-in recorded and added to stock.");
      this.refresh();
    });
  },
};
