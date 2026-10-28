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
    const num = 'text-align:right;';
    const money = (v) => (forPrint ? Formatters.formatCurrency(v, App.currency, true) : this.money(v));
    const rows = d.rows.map((r) => '<tr>' +
      '<td>' + Formatters.formatDate(r.date) + '</td>' +
      '<td>' + this.esc(r.kind) + '</td>' +
      '<td>' + this.esc(r.who) + (r.detail ? '<br><small class="muted">' + this.esc(r.detail) + '</small>' : '') + '</td>' +
      '<td>' + (forPrint ? '<span class="badge ' + (r.account === 'Cash' ? 'ok' : 'neutral') + '">' + r.account + '</span>' : r.account) + '</td>' +
      '<td class="num ' + (r.in ? 'pos' : 'muted') + '" style="' + num + (r.in && !forPrint ? 'color:var(--success);' : '') + '">' + (r.in ? '+ ' + money(r.in) : '-') + '</td>' +
      '<td class="num ' + (r.out ? 'neg' : 'muted') + '" style="' + num + (r.out && !forPrint ? 'color:var(--danger);' : '') + '">' + (r.out ? '&minus; ' + money(r.out) : '-') + '</td>' +
      '<td class="num strong" style="' + num + '">' + money(r.cash) + '</td>' +
      '<td class="num strong" style="' + num + '">' + money(r.bank) + '</td></tr>').join('');
    if (!d.rows.length) return '<div class="empty-state"><h3>No movements</h3><p>Nothing was received or paid in this period.</p></div>';
    return '<div class="table-wrapper"><table>' +
      '<thead><tr><th>Date</th><th>Type</th><th>Who / Details</th><th>Account</th><th class="num" style="' + num + '">Money In (+)</th><th class="num" style="' + num + '">Money Out (&minus;)</th><th class="num" style="' + num + '">Cash Balance</th><th class="num" style="' + num + '">Bank Balance</th></tr></thead>' +
      '<tbody><tr><td colspan="6"><i>Opening balance</i></td><td class="num" style="' + num + '">' + money(d.openingCash) + '</td><td class="num" style="' + num + '">' + money(d.openingBank) + '</td></tr>' + rows + '</tbody></table></div>';
  },

  async print() {
    if (!this.data) return;
    const T = ReportTheme;
    const fx = (v) => Formatters.formatCurrency(v, App.currency, true);
    const st = (await window.api.getSettings()).data || {};
    const d = this.data;
    const f = this.filters;
    const range = f.from || f.to ? (f.from || '...') + ' to ' + (f.to || '...') : 'All time';
    const body =
      T.header({ shop: st, title: 'Cash and Bank Book', meta: [['Period', range], ['Date', Formatters.formatDate(new Date().toISOString())]] }) +
      T.kpis([
        { label: 'Opening cash', value: fx(d.openingCash) },
        { label: 'Cash in (+)', value: fx(d.totals.cashIn), tone: 'ok' },
        { label: 'Cash out (-)', value: fx(d.totals.cashOut), tone: 'bad' },
        { label: 'Cash now', value: fx(d.closingCash), tone: d.closingCash < 0 ? 'bad' : '' },
      ]) +
      T.kpis([
        { label: 'Opening bank', value: fx(d.openingBank) },
        { label: 'Bank in (+)', value: fx(d.totals.bankIn), tone: 'ok' },
        { label: 'Bank out (-)', value: fx(d.totals.bankOut), tone: 'bad' },
        { label: 'Bank now', value: fx(d.closingBank), tone: d.closingBank < 0 ? 'bad' : '' },
      ]) +
      this.tableHtml(d, true) +
      T.footer({ shop: st });
    const html = I18n.translateHtml(T.wrap({ title: 'Cash and Bank Book', body, landscape: true, autoPrint: true }));
    const w = window.open('', '_blank', 'width=1100,height=800');
    if (!w) return Toast.error('Please allow pop-ups for printing.');
    w.document.write(html);
    w.document.close();
  },
};
