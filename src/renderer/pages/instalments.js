// Instalments: payment plans on loan sales. Receive each payment here, see who is late or due soon, and search.
const InstalmentsPage = {
  esc(v) { return ShopInfo.esc(v == null ? "" : String(v)); },
  badge: { Overdue: "badge-damaged", "Due soon": "badge-reserved", Paid: "badge-in-stock", Pending: "badge-lost", Partial: "badge-returned" },
  due: [],
  plans: [],
  query: "",
  show: "",

  async load() {
    this.query = "";
    this.show = "";
    document.getElementById("page-content").innerHTML = `
      <div class="page-header">
        <div><h1>Instalments</h1><p>Customers paying a sale in parts: receive payments, see who is late and who is due soon</p></div>
        <button class="btn btn-primary" onclick="InstalmentsPage.showCreate()">New Plan</button>
      </div>
      <div class="filters-bar" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
        <input type="search" class="form-control" id="in-search" style="max-width:340px;" placeholder="Search customer, phone or sale number" oninput="InstalmentsPage.onSearch()">
        <select class="form-control" id="in-show" style="max-width:220px;" onchange="InstalmentsPage.onSearch()">
          <option value="">All plans</option><option value="Overdue">Late</option><option value="On track">On track</option><option value="Complete">Complete</option>
        </select>
      </div>
      <div class="card" style="margin-bottom:16px;"><div class="card-header"><h3>Overdue and due in the next 7 days</h3></div><div class="card-body" id="in-due"></div></div>
      <div class="card"><div class="card-header"><h3>All plans</h3></div><div class="card-body" id="in-plans"></div></div>`;
    await this.refresh();
  },

  async refresh() {
    const [due, plans] = await Promise.all([window.api.dueInstalments({ withinDays: 7 }), window.api.listInstalmentPlans()]);
    this.due = due.success ? due.data : [];
    this.plans = plans.success ? plans.data : [];
    this.dueError = due.success ? "" : due.error;
    this.plansError = plans.success ? "" : plans.error;
    this.render();
  },

  onSearch() {
    this.query = (document.getElementById("in-search")?.value || "").trim().toLowerCase();
    this.show = document.getElementById("in-show")?.value || "";
    this.render();
  },

  matches(row) {
    if (!this.query) return true;
    return [row.customer_name, row.phone, row.reference_no].some((v) => String(v || "").toLowerCase().includes(this.query));
  },

  render() {
    const dueBox = document.getElementById("in-due");
    const planBox = document.getElementById("in-plans");
    if (!dueBox || !planBox) return;

    const due = this.due.filter((i) => this.matches(i) && (!this.show || (this.show === "Overdue" ? i.status === "Overdue" : false)));
    dueBox.innerHTML = this.dueError ? this.esc(this.dueError) : due.length ? `<div class="table-wrapper"><table>
      <thead><tr><th>Due date</th><th>Customer</th><th>Sale</th><th style="text-align:right;">Part</th><th style="text-align:right;">Still owed</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>${due.map((i) => `<tr><td>${this.esc(i.due_date)}</td><td><strong>${this.esc(i.customer_name)}</strong>${i.phone ? `<br><small>${this.esc(i.phone)}</small>` : ""}</td><td>${this.esc(i.reference_no)} (#${i.seq}${i.parts ? " of " + i.parts : ""})</td>
        <td style="text-align:right;">${Pickers.money(i.amount)}</td><td style="text-align:right;">${Pickers.money(i.balance)}</td><td><span class="badge ${this.badge[i.status]}">${i.status}</span></td>
        <td><button class="btn btn-sm btn-success" onclick="InstalmentsPage.showPay(${i.sale_issue_id})">Receive payment</button></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty-state"><h3>${this.query || this.show ? "No late or due-soon instalment matches" : "Nothing is late or due soon"}</h3></div>`;

    const plans = this.plans.filter((p) => this.matches(p) && (!this.show || p.status === this.show));
    planBox.innerHTML = this.plansError ? this.esc(this.plansError) : plans.length ? `<div class="table-wrapper"><table>
      <thead><tr><th>Sale</th><th>Customer</th><th>Parts</th><th style="text-align:right;">Still owed</th><th>Next due</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${plans.map((p) => `<tr><td>${this.esc(p.reference_no)}</td><td><strong>${this.esc(p.customer_name)}</strong>${p.phone ? `<br><small>${this.esc(p.phone)}</small>` : ""}</td><td>${p.count}</td>
        <td style="text-align:right;">${Pickers.money(p.balance)}</td><td>${this.esc(p.next_due) || "-"}</td>
        <td><span class="badge ${p.status === "Overdue" ? "badge-damaged" : p.status === "Complete" ? "badge-in-stock" : "badge-reserved"}">${p.status === "Overdue" ? "Late" : p.status}</span></td>
        <td><div class="action-buttons">
          ${p.status === "Complete" ? "" : `<button class="btn btn-sm btn-success" onclick="InstalmentsPage.showPay(${p.sale_issue_id})">Receive payment</button>`}
          <button class="btn btn-sm btn-secondary" onclick="InstalmentsPage.showPlan(${p.sale_issue_id})">View</button>
          <button class="btn btn-sm btn-danger" onclick="InstalmentsPage.cancel(${p.sale_issue_id})">Remove plan</button></div></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty-state"><h3>${this.query || this.show ? "No plan matches" : "No plans yet"}</h3>${this.query || this.show ? "" : "<p>Press New Plan to split a loan sale into dated payments.</p>"}</div>`;
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
      <p style="color:var(--text-muted);font-size:13px;">When the customer pays, press Receive payment on the plan. The parts are filled in order.</p>`,
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

  // ---- Receive a payment on a plan
  async showPay(saleId, backToPlan) {
    const r = await window.api.getInstalmentPlan(saleId);
    if (!r.success || !r.data) return Toast.error(r.error || "Plan not found");
    const p = r.data;
    const open = p.items.filter((i) => i.balance > 0.004);
    if (!open.length) return Toast.info("This plan is fully paid.");
    const next = open[0];
    const left = open.reduce((s, i) => s + i.balance, 0);
    Modal.showForm(`Receive payment - ${this.esc(p.customer_name)}`, `
      <div class="summary-box" style="margin-bottom:14px;padding:12px 14px;border-radius:10px;background:var(--bg-secondary);font-size:14px;line-height:1.7;">
        <div><strong>${this.esc(p.reference_no)}</strong> &middot; ${p.items.length} parts</div>
        <div>Next part: <strong>#${next.seq}</strong> due <strong>${this.esc(next.due_date)}</strong> &middot; still owed <strong>${Pickers.money(next.balance)}</strong>${next.status === "Overdue" ? ' <span class="badge badge-damaged">Late</span>' : ""}</div>
        <div>Whole plan still owed: <strong>${Pickers.money(left)}</strong></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Amount received *</label><input type="number" min="0.01" step="0.01" class="form-control" id="inpay-amount" value="${next.balance}"></div>
        <div class="form-group"><label>Paid by</label><select class="form-control" id="inpay-method"><option value="Cash">Cash</option><option value="Bank Transfer">Bank Transfer</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Date</label><input type="date" class="form-control" id="inpay-date" value="${Pickers.today()}"></div>
        <div class="form-group"><label>Note</label><input class="form-control" id="inpay-note" placeholder="Instalment ${next.seq} of ${p.items.length}"></div>
      </div>
      <p style="color:var(--text-muted);font-size:13px;">Paying more than this part carries on to the next parts. The payment goes into the customer's ledger and the Cash Book.</p>`,
    async () => {
      const amount = parseFloat(document.getElementById("inpay-amount").value);
      if (!(amount > 0)) return Toast.warning("Enter the amount received.");
      const res = await window.api.payInstalment({
        sale_issue_id: saleId, amount, payment_method: document.getElementById("inpay-method").value,
        payment_date: document.getElementById("inpay-date").value, note: document.getElementById("inpay-note").value,
      });
      if (!res.success) return Toast.error(res.error);
      Modal.close();
      const paidNow = res.data.items.filter((i) => i.status === "Paid").length;
      Toast.success(res.data.items.every((i) => i.status === "Paid") ? "Payment recorded. The plan is fully paid." : `Payment recorded. ${paidNow} of ${res.data.items.length} parts paid.`);
      if (backToPlan) this.showPlan(saleId);
      this.refresh();
    }, "sm");
  },

  async showPlan(saleId) {
    const r = await window.api.getInstalmentPlan(saleId);
    if (!r.success || !r.data) return Toast.error(r.error || "Plan not found");
    const p = r.data;
    const open = p.items.some((i) => i.balance > 0.004);
    Modal.show({
      title: `${this.esc(p.reference_no)} - ${this.esc(p.customer_name)}`,
      body: `
        <div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:14px;font-size:14px;">
          <span>Sale total <strong>${Pickers.money(p.sale_total)}</strong></span>
          <span>Paid so far <strong>${Pickers.money(p.sale_paid)}</strong></span>
          <span>Still owed <strong>${Pickers.money(p.sale_remaining)}</strong></span>
          ${p.phone ? `<span>${this.esc(p.phone)}</span>` : ""}
        </div>
        <div class="table-wrapper"><table><thead><tr><th>#</th><th>Due</th><th style="text-align:right;">Amount</th><th style="text-align:right;">Paid</th><th>Status</th></tr></thead>
        <tbody>${p.items.map((i) => `<tr><td>${i.seq}</td><td>${this.esc(i.due_date)}</td><td style="text-align:right;">${Pickers.money(i.amount)}</td><td style="text-align:right;">${Pickers.money(i.paid)}</td><td><span class="badge ${this.badge[i.status]}">${i.status === "Overdue" ? "Late" : i.status}</span></td></tr>`).join("")}</tbody></table></div>
        <h4 style="margin:16px 0 8px;">Payments on this sale</h4>
        ${p.payments.length ? `<div class="table-wrapper"><table><thead><tr><th>Date</th><th style="text-align:right;">Amount</th><th>Paid by</th><th>Note</th></tr></thead>
        <tbody>${p.payments.map((x) => `<tr><td>${this.esc(x.payment_date)}</td><td style="text-align:right;">${Pickers.money(x.amount)}</td><td>${this.esc(x.payment_method)}</td><td>${this.esc(x.note)}</td></tr>`).join("")}</tbody></table></div>` : '<p style="color:var(--text-muted);">No payment has been received yet.</p>'}`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Close</button>${open ? `<button class="btn btn-success" onclick="InstalmentsPage.showPay(${saleId}, true)">Receive payment</button>` : ""}`,
      size: "lg",
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
