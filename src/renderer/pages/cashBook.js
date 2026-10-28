// Cash & Bank Book: every movement of cash and bank with a running balance.
const CashBookPage = {
  filters: { from: "", to: "", account: "" },
  data: null,

  money(v) {
    return Formatters.formatCurrency(v, App.currency);
  },

  esc(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  },

  async load() {
    this.filters = { from: "", to: "", account: "" };
    document.getElementById("page-content").innerHTML = `
      <div class="page-header">
        <div>
          <h1>Cash &amp; Bank Book</h1>
          <p>Every rupee in and out: customer payments, expenses and supplier payments</p>
        </div>
        <button class="btn btn-secondary" onclick="CashBookPage.print()">Print</button>
      </div>
      <div class="card" style="margin-bottom:16px;"><div class="card-body">
        <div class="form-row">
          <div class="form-group"><label>From</label><input type="date" class="form-control" id="cb-from" onchange="CashBookPage.onFilter()"></div>
          <div class="form-group"><label>To</label><input type="date" class="form-control" id="cb-to" onchange="CashBookPage.onFilter()"></div>
          <div class="form-group"><label>Show</label>
            <select class="form-control" id="cb-account" onchange="CashBookPage.onFilter()">
              <option value="">Cash and Bank</option><option value="Cash">Cash only</option><option value="Bank">Bank only</option>
            </select></div>
        </div>
      </div></div>
      <div id="cb-summary"></div>
      <div class="card"><div class="card-body" id="cb-table"></div></div>`;
    await this.refresh();
  },

  onFilter() {
    this.filters = {
      from: document.getElementById("cb-from").value,
      to: document.getElementById("cb-to").value,
      account: document.getElementById("cb-account").value,
    };
    this.refresh();
  },

  async refresh() {
    const res = await window.api.getCashBook(this.filters);
    if (!res.success) {
      document.getElementById("cb-table").innerHTML = `<div class="empty-state"><h3>Error</h3><p>${this.esc(res.error)}</p></div>`;
      return;
    }
    this.data = res.data;
    const d = res.data;
    const t = d.totals;
    document.getElementById("cb-summary").innerHTML = `
      <div class="stats-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:16px;">
        <div class="stat-card"><div class="stat-label">Cash</div>
          <div class="stat-trend"><span>Opening: ${this.money(d.openingCash)}</span> &nbsp; <span>In: ${this.money(t.cashIn)}</span> &nbsp; <span>Out: ${this.money(t.cashOut)}</span></div>
          <div class="stat-value" style="color:${d.closingCash < 0 ? "var(--danger)" : ""};">${this.money(d.closingCash)}</div></div>
        <div class="stat-card"><div class="stat-label">Bank</div>
          <div class="stat-trend"><span>Opening: ${this.money(d.openingBank)}</span> &nbsp; <span>In: ${this.money(t.bankIn)}</span> &nbsp; <span>Out: ${this.money(t.bankOut)}</span></div>
          <div class="stat-value" style="color:${d.closingBank < 0 ? "var(--danger)" : ""};">${this.money(d.closingBank)}</div></div>
      </div>`;
    document.getElementById("cb-table").innerHTML = this.tableHtml(d, false);
  },

  tableHtml(d, forPrint) {
    const th = forPrint ? "padding:5px 7px;border:1px solid #000;text-align:left;font-size:12px;" : "";
    const td = forPrint ? "padding:5px 7px;border:1px solid #999;font-size:12px;" : "";
    const num = "text-align:right;";
    const rows = d.rows.map((r) => `
      <tr>
        <td style="${td}">${Formatters.formatDate(r.date)}</td>
        <td style="${td}">${this.esc(r.kind)}</td>
        <td style="${td}">${this.esc(r.who)}${r.detail ? `<br><small>${this.esc(r.detail)}</small>` : ""}</td>
        <td style="${td}">${r.account}</td>
        <td style="${td}${num}color:${forPrint ? "#000" : "var(--success)"};">${r.in ? this.money(r.in) : ""}</td>
        <td style="${td}${num}color:${forPrint ? "#000" : "var(--danger)"};">${r.out ? this.money(r.out) : ""}</td>
        <td style="${td}${num}">${this.money(r.cash)}</td>
        <td style="${td}${num}">${this.money(r.bank)}</td>
      </tr>`).join("");
    if (!d.rows.length) return '<div class="empty-state"><h3>No movements</h3><p>Nothing was received or paid in this period.</p></div>';
    return `<div class="table-wrapper"><table style="${forPrint ? "width:100%;border-collapse:collapse;" : ""}">
      <thead><tr><th style="${th}">Date</th><th style="${th}">Type</th><th style="${th}">Who / Details</th><th style="${th}">Account</th>
        <th style="${th}${num}">Money In</th><th style="${th}${num}">Money Out</th><th style="${th}${num}">Cash Balance</th><th style="${th}${num}">Bank Balance</th></tr></thead>
      <tbody>
        <tr><td colspan="6" style="${td}"><em>Opening balance</em></td><td style="${td}${num}">${this.money(d.openingCash)}</td><td style="${td}${num}">${this.money(d.openingBank)}</td></tr>
        ${rows}
      </tbody></table></div>`;
  },

  async print() {
    if (!this.data) return;
    const st = (await window.api.getSettings()).data || {};
    const range = this.filters.from || this.filters.to ? `${this.filters.from || "..."} to ${this.filters.to || "..."}` : "All time";
    const html = I18n.translateHtml(`<html><head><meta charset="utf-8"><title>Cash and Bank Book</title>
      <style>@page{margin:10mm;size:A4 landscape} body{font-family:Arial,Helvetica,sans-serif;padding:12px;color:#000;font-size:13px}</style></head><body>
      <div style="text-align:center;margin-bottom:12px;padding-bottom:8px;border-bottom:3px solid #000;">
        <h2 style="font-size:22px;">${this.esc(st.shop_name || "")}</h2>
        ${ShopInfo.contactHtml(st, "font-size:13px;color:#000;margin:1px 0;")}
        <h3 style="margin-top:6px;font-size:19px;">Cash and Bank Book</h3><div>${this.esc(range)}</div>
      </div>
      ${this.tableHtml(this.data, true)}
      <p style="margin-top:10px;text-align:right;"><strong>Closing: Cash ${this.money(this.data.closingCash)} &nbsp; Bank ${this.money(this.data.closingBank)}</strong></p>
      <script>window.onload=function(){setTimeout(function(){window.print()},400)};<\/script></body></html>`);
    const w = window.open("", "_blank", "width=1100,height=800");
    if (!w) return Toast.error("Please allow pop-ups for printing.");
    w.document.write(html);
    w.document.close();
  },
};
