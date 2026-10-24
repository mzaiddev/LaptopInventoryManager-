// Dashboard Page: the few numbers the owner needs, for a chosen date range.
const DashboardPage = {
  preset: "month",
  custom: { from: "", to: "" },

  pad(n) {
    return String(n).padStart(2, "0");
  },

  iso(d) {
    return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`;
  },

  range() {
    const now = new Date();
    const today = this.iso(now);
    switch (this.preset) {
      case "today":
        return { from: today, to: today };
      case "week": {
        const d = new Date(now);
        d.setDate(d.getDate() - 6);
        return { from: this.iso(d), to: today };
      }
      case "month":
        return { from: this.iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
      case "lastMonth":
        return {
          from: this.iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
          to: this.iso(new Date(now.getFullYear(), now.getMonth(), 0)),
        };
      case "all":
        return { from: "", to: "" };
      default:
        return { from: this.custom.from, to: this.custom.to };
    }
  },

  async load() {
    const presets = [
      ["today", "Today"],
      ["week", "Last 7 Days"],
      ["month", "This Month"],
      ["lastMonth", "Last Month"],
      ["all", "All Time"],
      ["custom", "Custom"],
    ];
    document.getElementById("page-content").innerHTML = `
      <div class="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Your shop at a glance</p>
        </div>
      </div>
      <div class="dashboard-filter" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:20px;">
        ${presets
          .map(([k, label]) => `<button class="btn btn-sm ${this.preset === k ? "btn-primary" : "btn-secondary"}" onclick="DashboardPage.setPreset('${k}')">${label}</button>`)
          .join("")}
        <span id="dash-custom" style="display:${this.preset === "custom" ? "inline-flex" : "none"};gap:8px;align-items:center;">
          <input type="date" class="form-control" id="dash-from" value="${this.custom.from}" onchange="DashboardPage.onCustom()">
          <span>to</span>
          <input type="date" class="form-control" id="dash-to" value="${this.custom.to}" onchange="DashboardPage.onCustom()">
        </span>
      </div>
      <div id="dashboard-content"><div class="loading"><div class="spinner"></div></div></div>
    `;
    await this.refresh();
  },

  setPreset(key) {
    this.preset = key;
    this.load();
  },

  onCustom() {
    this.custom.from = document.getElementById("dash-from").value;
    this.custom.to = document.getElementById("dash-to").value;
    if (this.custom.from && this.custom.to && this.custom.from > this.custom.to) {
      Toast.error("'From' date must not be after 'To' date.");
      return;
    }
    this.refresh();
  },

  async refresh() {
    const container = document.getElementById("dashboard-content");
    if (!container) return;
    try {
      const result = await window.api.getDashboardData(this.range());
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><h3>Error loading dashboard</h3><p>${this.escapeHtml(result.error)}</p></div>`;
        return;
      }
      App.currency = result.data.currency || "USD";
      container.innerHTML = this.render(result.data);
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${this.escapeHtml(err.message)}</p></div>`;
    }
  },

  reveal: '<a href="#" class="reveal-link" onclick="App.toggleCost(); return false;" title="Click and enter the super-password to show">••••</a>',

  money(v) {
    return v === null || v === undefined ? this.reveal : Formatters.formatCurrency(v, App.currency);
  },

  card(color, icon, value, label, sub = "", page = "", valueColor = "") {
    return `
      <div class="stat-card ${page ? "clickable" : ""}" ${page ? `onclick="App.navigate('${page}')"` : ""}>
        <div class="stat-icon ${color}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">${icon}</svg>
        </div>
        <div class="stat-value" ${valueColor ? `style="color:${valueColor};"` : ""}>${value}</div>
        <div class="stat-label">${label}</div>
        ${sub ? `<div class="stat-trend">${sub}</div>` : ""}
      </div>`;
  },

  render(d) {
    const I = {
      sales: '<polyline points="20 6 9 17 4 12"/>',
      cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/>',
      bank: '<path d="M3 21h18M5 21V10m14 11V10M9 21V10m6 11V10M12 3l9 5H3z"/>',
      due: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
      ret: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
      exp: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
      profit: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>',
      box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
    };
    const profitColor = d.netProfit === null ? "" : d.netProfit < 0 ? "var(--danger)" : "var(--success)";
    return `
      <div class="dashboard-section">
        <h2>Money In and Out</h2>
        <div class="stats-grid">
          ${this.card("blue", I.sales, this.money(d.sales), "Sales", `${d.salesCount} sales`, "sales-history")}
          ${this.card("green", I.cash, this.money(d.received.total), "Received", `Cash ${this.money(d.received.cash)} · Bank ${this.money(d.received.bank)}`, "ledgers")}
          ${this.card("red", I.exp, this.money(d.expenses.total), "Expenses", `Cash ${this.money(d.expenses.cash)} · Bank ${this.money(d.expenses.bank)}`, "expenses")}
          ${this.card("yellow", I.ret, this.money(d.returns.total), "Returns", `${d.returns.count} returns`, "returns")}
          ${this.card("green", I.profit, this.money(d.netProfit), "Net Profit", d.netProfit === null ? "Click •••• and enter super-password" : "Sales − cost − expenses", "", profitColor)}
        </div>
      </div>
      <div class="dashboard-section">
        <h2>Cash, Bank and Dues</h2>
        <div class="stats-grid">
          ${this.card("green", I.cash, this.money(d.cashInHand), "Cash in Hand", "All time")}
          ${this.card("blue", I.bank, this.money(d.bankBalance), "Bank Balance", "All time")}
          ${this.card("red", I.due, this.money(d.outstanding.amount), "Customers Owe You", `${d.outstanding.customersOwing} customers`, "ledgers", d.outstanding.amount > 0 ? "var(--danger)" : "")}
        </div>
      </div>
      <div class="dashboard-section">
        <h2>Stock</h2>
        <div class="stats-grid">
          ${this.card("blue", I.box, d.stock.itemsInStock, "Items in Stock", "", "inventory")}
          ${this.card("yellow", I.box, this.money(d.stock.stockValue), "Stock Value (cost)", d.stock.stockValue === null ? "Click •••• and enter super-password" : "")}
        </div>
      </div>
      <div class="dashboard-section">
        <h2>Recent Activity</h2>
        <div class="dashboard-grid">
          <div class="card"><div class="card-header"><h3>Recent Sales</h3></div>
            <div class="card-body">${this.list(d.recentSales, (s) => [this.escapeHtml(s.reference_no), `${this.escapeHtml(s.customer_name)} - ${Formatters.formatCurrency(s.total_amount, App.currency)}`, s.issue_date])}</div></div>
          <div class="card"><div class="card-header"><h3>Recent Payments</h3></div>
            <div class="card-body">${this.list(d.recentPayments, (p) => [`${Formatters.formatCurrency(p.amount, App.currency)} received`, `${this.escapeHtml(p.customer_name)} - ${this.escapeHtml(p.sale_ref)} (${p.payment_method === "Cash" ? "Cash" : "Bank"})`, p.payment_date])}</div></div>
        </div>
      </div>`;
  },

  list(items, row) {
    if (!items || items.length === 0) {
      return '<p style="color:var(--text-muted);text-align:center;padding:20px;">Nothing yet.</p>';
    }
    return `<ul class="activity-list">${items
      .map((it) => {
        const [title, subtitle, date] = row(it);
        return `<li class="activity-item">
          <div class="activity-info"><div class="activity-title">${title}</div><div class="activity-subtitle">${subtitle}</div></div>
          <div class="activity-time">${Formatters.formatDate(date)}</div>
        </li>`;
      })
      .join("")}</ul>`;
  },

  escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  },
};
