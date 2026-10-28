// Service Jobs: repair job cards. Received -> Repairing -> Ready -> Delivered.
const ServiceJobsPage = {
  filters: { status: "", search: "" },
  rows: [],
  steps: ["Received", "Repairing", "Ready", "Delivered"],
  nextLabel: { Received: "Start repair", Repairing: "Mark ready", Ready: "Deliver" },
  badge: { Received: "badge-reserved", Repairing: "badge-returned", Ready: "badge-in-stock", Delivered: "badge-sold", Cancelled: "badge-lost" },

  esc(v) { return ShopInfo.esc(v == null ? "" : String(v)); },
  money(v) { return Pickers.money(v); },

  async load() {
    this.filters = { status: "", search: "" };
    document.getElementById("page-content").innerHTML = `
      <div class="page-header">
        <div><h1>Service Jobs</h1><p>Laptops in for repair: track each one from drop-off to delivery</p></div>
        <button class="btn btn-primary" onclick="ServiceJobsPage.showForm()">New Job</button>
      </div>
      <div class="tab-bar" id="sj-tabs">
        ${["", ...this.steps, "Cancelled"].map((s) => `<button class="tab-item ${s === "" ? "active" : ""}" data-status="${s}" onclick="ServiceJobsPage.setStatus('${s}')">${s || "All"}</button>`).join("")}
      </div>
      <div class="card"><div class="card-body">
        <div class="filters-bar"><div class="search-box"><input type="text" id="sj-search" placeholder="Search job no, customer, device, serial..." oninput="ServiceJobsPage.onSearch()"></div></div>
        <div id="sj-table"></div>
      </div></div>`;
    await this.refresh();
  },

  async refresh() {
    const r = await window.api.listServiceJobs(this.filters);
    const box = document.getElementById("sj-table");
    if (!box) return;
    if (!r.success) { box.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${this.esc(r.error)}</p></div>`; return; }
    this.rows = r.data;
    if (!this.rows.length) {
      box.innerHTML = '<div class="empty-state"><h3>No service jobs</h3><p>Press New Job when a customer drops off a laptop.</p></div>';
      return;
    }
    box.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr><th>Job</th><th>Customer</th><th>Device</th><th>Fault</th><th>Status</th><th style="text-align:right;">Charge</th><th style="text-align:right;">Paid</th><th>Received</th><th>Actions</th></tr></thead>
      <tbody>${this.rows.map((j) => {
        const open = !["Delivered", "Cancelled"].includes(j.status);
        return `<tr>
          <td><strong>${this.esc(j.job_no)}</strong></td>
          <td>${this.esc(j.customer_name)}<br><small style="color:var(--text-muted);">${this.esc(j.phone)}</small></td>
          <td>${this.esc(j.device)}${j.serial_number ? `<br><small style="color:var(--text-muted);">${this.esc(j.serial_number)}</small>` : ""}</td>
          <td>${this.esc(j.fault) || "-"}</td>
          <td><span class="badge ${this.badge[j.status]}">${j.status}</span></td>
          <td style="text-align:right;">${this.money(j.charge)}</td>
          <td style="text-align:right;">${this.money(j.paid)}</td>
          <td>${this.esc(j.received_date)}</td>
          <td><div class="action-buttons">
            ${open ? `<button class="btn btn-sm btn-success" onclick="ServiceJobsPage.advance(${j.id})">${this.nextLabel[j.status]}</button>` : ""}
            <button class="btn btn-sm btn-secondary" onclick="ServiceJobsPage.showPayment(${j.id})">Payment</button>
            ${open ? `<button class="btn btn-sm btn-warning" onclick="ServiceJobsPage.showForm(${j.id})">Edit</button><button class="btn btn-sm btn-danger" onclick="ServiceJobsPage.cancel(${j.id})">Cancel</button>` : ""}
          </div></td></tr>`;
      }).join("")}</tbody></table></div>`;
  },

  setStatus(status) {
    this.filters.status = status;
    document.querySelectorAll("#sj-tabs .tab-item").forEach((b) => b.classList.toggle("active", b.dataset.status === status));
    this.refresh();
  },

  onSearch() {
    clearTimeout(this._t);
    this._t = setTimeout(() => { this.filters.search = document.getElementById("sj-search").value.trim(); this.refresh(); }, 250);
  },

  async advance(id) {
    const job = this.rows.find((j) => j.id === id);
    const next = this.steps[this.steps.indexOf(job.status) + 1];
    const r = await window.api.setServiceJobStatus(id, next, {});
    if (!r.success) return Toast.error(r.error);
    Toast.success(next === "Delivered" ? "Delivered. The charge was added to the customer's account." : `Job is now ${next}.`);
    this.refresh();
  },

  cancel(id) {
    Modal.showConfirm("Cancel job", "Cancel this service job? Money already received stays on the customer's account.", async () => {
      const r = await window.api.setServiceJobStatus(id, "Cancelled", {});
      if (!r.success) return Toast.error(r.error);
      this.refresh();
    });
  },

  async showForm(id = null) {
    const j = id ? this.rows.find((x) => x.id === id) : { device: "", serial_number: "", fault: "", charge: "", notes: "" };
    const customers = id ? "" : `<div class="form-group"><label>Customer *</label><select class="form-control" id="sj-customer">${await Pickers.customerOptions()}</select></div>`;
    Modal.showForm(id ? "Edit service job" : "New service job", `
      ${customers}
      <div class="form-row">
        <div class="form-group"><label>Device *</label><input class="form-control" id="sj-device" value="${this.esc(j.device)}" placeholder="e.g. Dell Latitude 5420"></div>
        <div class="form-group"><label>Serial number</label><input class="form-control" id="sj-serial" value="${this.esc(j.serial_number)}"></div>
      </div>
      <div class="form-group"><label>Fault</label><input class="form-control" id="sj-fault" value="${this.esc(j.fault)}" placeholder="What is wrong?"></div>
      <div class="form-row">
        <div class="form-group"><label>Quoted charge</label><input type="number" min="0" step="0.01" class="form-control" id="sj-charge" value="${j.charge}"></div>
        <div class="form-group"><label>Notes</label><input class="form-control" id="sj-notes" value="${this.esc(j.notes)}"></div>
      </div>
      <p style="color:var(--text-muted);font-size:13px;">The charge is added to the customer's account when the job is delivered.</p>`,
    async () => {
      const data = {
        device: document.getElementById("sj-device").value, serial_number: document.getElementById("sj-serial").value,
        fault: document.getElementById("sj-fault").value, charge: document.getElementById("sj-charge").value, notes: document.getElementById("sj-notes").value,
      };
      let r;
      if (id) r = await window.api.updateServiceJob(id, data);
      else {
        data.customer_id = Number(document.getElementById("sj-customer").value);
        if (!data.customer_id) return Toast.warning("Choose the customer.");
        r = await window.api.addServiceJob(data);
      }
      if (!r.success) return Toast.error(r.error);
      Modal.close();
      Toast.success(id ? "Job updated." : `Job ${r.data.job_no} created.`);
      this.refresh();
    }, "sm");
  },

  showPayment(id) {
    const j = this.rows.find((x) => x.id === id);
    Modal.showForm(`Payment for ${this.esc(j.job_no)}`, `
      <p style="margin-bottom:12px;">Charge ${this.money(j.charge)}, received so far ${this.money(j.paid)}.</p>
      <div class="form-row">
        <div class="form-group"><label>Amount *</label><input type="number" min="0.01" step="0.01" class="form-control" id="sjp-amount" value="${Math.max(0, j.charge - j.paid) || ""}"></div>
        <div class="form-group"><label>Paid by</label><select class="form-control" id="sjp-method"><option value="Cash">Cash</option><option value="Bank">Bank Transfer</option></select></div>
      </div>
      <div class="form-group"><label>Date</label><input type="date" class="form-control" id="sjp-date" value="${Pickers.today()}"></div>`,
    async () => {
      const r = await window.api.addServiceJobPayment(id, {
        amount: parseFloat(document.getElementById("sjp-amount").value), payment_method: document.getElementById("sjp-method").value,
        payment_date: document.getElementById("sjp-date").value,
      });
      if (!r.success) return Toast.error(r.error);
      Modal.close();
      Toast.success("Payment recorded.");
      this.refresh();
    }, "sm");
  },
};
