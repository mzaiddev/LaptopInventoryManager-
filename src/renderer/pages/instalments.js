// Instalments: payment plans on loan sales, with what is overdue or due soon.
const InstalmentsPage = {
  esc(v) { return ShopInfo.esc(v == null ? "" : String(v)); },
  badge: { Overdue: "badge-damaged", "Due soon": "badge-reserved", Paid: "badge-in-stock", Pending: "badge-lost", Partial: "badge-returned" },

  async load() {
    document.getElementById("page-content").innerHTML = `
      <div class="page-header">
        <div><h1>Instalments</h1><p>Customers paying a sale in parts: who is late and who is due soon</p></div>
        <button class="btn btn-primary" onclick="InstalmentsPage.showCreate()">New Plan</button>
      </div>
      <div class="card" style="margin-bottom:16px;"><div class="card-header"><h3>Overdue and due in the next 7 days</h3></div><div class="card-body" id="in-due"></div></div>
      <div class="card"><div class="card-header"><h3>All plans</h3></div><div class="card-body" id="in-plans"></div></div>`;
    await this.refresh();
  },

  async refresh() {
    const [due, plans] = await Promise.all([window.api.dueInstalments({ withinDays: 7 }), window.api.listInstalmentPlans()]);
    const dueBox = document.getElementById("in-due");
    const planBox = document.getElementById("in-plans");
    if (!dueBox || !planBox) return;
    dueBox.innerHTML = !due.success ? this.esc(due.error) : due.data.length ? `<div class="table-wrapper"><table>
      <thead><tr><th>Due date</th><th>Customer</th><th>Sale</th><th style="text-align:right;">Part</th><th style="text-align:right;">Still owed</th><th>Status</th></tr></thead>
      <tbody>${due.data.map((i) => `<tr><td>${this.esc(i.due_date)}</td><td><strong>${this.esc(i.customer_name)}</strong></td><td>${this.esc(i.reference_no)} (#${i.seq})</td>
        <td style="text-align:right;">${Pickers.money(i.amount)}</td><td style="text-align:right;">${Pickers.money(i.balance)}</td><td><span class="badge ${this.badge[i.status]}">${i.status}</span></td></tr>`).join("")}</tbody></table></div>`
      : '<div class="empty-state"><h3>Nothing is late or due soon</h3></div>';
    planBox.innerHTML = !plans.success ? this.esc(plans.error) : plans.data.length ? `<div class="table-wrapper"><table>
      <thead><tr><th>Sale</th><th>Customer</th><th>Parts</th><th style="text-align:right;">Still owed</th><th>Next due</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${plans.data.map((p) => `<tr><td>${this.esc(p.reference_no)}</td><td><strong>${this.esc(p.customer_name)}</strong></td><td>${p.count}</td>
        <td style="text-align:right;">${Pickers.money(p.balance)}</td><td>${this.esc(p.next_due) || "-"}</td>
        <td><span class="badge ${p.status === "Overdue" ? "badge-damaged" : p.status === "Complete" ? "badge-in-stock" : "badge-reserved"}">${p.status}</span></td>
        <td><div class="action-buttons"><button class="btn btn-sm btn-secondary" onclick="InstalmentsPage.showPlan(${p.sale_issue_id})">View</button>
        <button class="btn btn-sm btn-danger" onclick="InstalmentsPage.cancel(${p.sale_issue_id})">Remove plan</button></div></td></tr>`).join("")}</tbody></table></div>`
      : '<div class="empty-state"><h3>No plans yet</h3><p>Press New Plan to split a loan sale into dated payments.</p></div>';
  },

  async showCreate() {
    const r = await window.api.instalmentCandidates();
    if (!r.success) return Toast.error(r.error);
    if (!r.data.length) return Toast.warning("No sale has money left to put on a plan.");
    const first = new Date(); first.setDate(first.getDate() + 30);
    Modal.showForm("New instalment plan", `
      <div class="form-group"><label>Sale *</label><select class="form-control" id="inp-sale">${r.data.map((s) => `<option value="${s.id}">${this.esc(s.reference_no)} - ${this.esc(s.customer_name)} - owes ${Pickers.money(s.remaining_amount)}</option>`).join("")}</select></div>
      <div class="form-row">
        <div class="form-group"><label>Number of parts *</label><input type="number" min="1" max="60" step="1" class="form-control" id="inp-count" value="3"></div>
        <div class="form-group"><label>Days between parts</label><input type="number" min="1" step="1" class="form-control" id="inp-gap" value="30"></div>
      </div>
      <div class="form-group"><label>First due date *</label><input type="date" class="form-control" id="inp-first" value="${first.toLocaleDateString("sv-SE")}"></div>
      <p style="color:var(--text-muted);font-size:13px;">Payments you record on the sale after this fill the parts in order.</p>`,
    async () => {
      const res = await window.api.createInstalmentPlan({
        sale_issue_id: Number(document.getElementById("inp-sale").value), count: Number(document.getElementById("inp-count").value),
        interval_days: Number(document.getElementById("inp-gap").value), first_due_date: document.getElementById("inp-first").value,
      });
      if (!res.success) return Toast.error(res.error);
      Modal.close();
      Toast.success("Plan created.");
      this.refresh();
    }, "sm");
  },

  async showPlan(saleId) {
    const r = await window.api.getInstalmentPlan(saleId);
    if (!r.success || !r.data) return Toast.error(r.error || "Plan not found");
    const p = r.data;
    Modal.show({
      title: `${this.esc(p.reference_no)} - ${this.esc(p.customer_name)}`,
      body: `<div class="table-wrapper"><table><thead><tr><th>#</th><th>Due</th><th style="text-align:right;">Amount</th><th style="text-align:right;">Paid</th><th>Status</th></tr></thead>
        <tbody>${p.items.map((i) => `<tr><td>${i.seq}</td><td>${this.esc(i.due_date)}</td><td style="text-align:right;">${Pickers.money(i.amount)}</td><td style="text-align:right;">${Pickers.money(i.paid)}</td><td><span class="badge ${this.badge[i.status]}">${i.status}</span></td></tr>`).join("")}</tbody></table></div>`,
      footer: '<button class="btn btn-secondary" onclick="Modal.close()">Close</button>',
    });
  },

  cancel(saleId) {
    Modal.showConfirm("Remove plan", "Remove this instalment plan? The sale and its payments are not changed.", async () => {
      const r = await window.api.cancelInstalmentPlan(saleId);
      if (!r.success) return Toast.error(r.error);
      this.refresh();
    });
  },
};
