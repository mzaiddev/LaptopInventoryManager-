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

  // desc: one plain sentence under the figure. key: opens "how is this worked out".
  card(color, icon, value, label, sub = "", page = "", valueColor = "", desc = "", key = "") {
    return `
      <div class="stat-card ${page ? "clickable" : ""}" ${page ? `onclick="App.navigate('${page}')"` : ""} style="position:relative;">
        ${key ? `<button class="stat-info" title="How is this worked out?" onclick="event.stopPropagation(); DashboardPage.showInfo('${key}')">i</button>` : ""}
        <div class="stat-icon ${color}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">${icon}</svg>
        </div>
        <div class="stat-value" ${valueColor ? `style="color:${valueColor};"` : ""}>${value}</div>
        <div class="stat-label">${label}</div>
        ${sub ? `<div class="stat-trend">${sub}</div>` : ""}
        ${desc ? `<div class="stat-desc">${desc}</div>` : ""}
      </div>`;
  },

  render(d) {
    this.data = d;
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
          ${this.card("blue", I.sales, this.money(d.sales), "Sales", `${d.salesCount} sales`, "sales-history", "", "Your bills in this period, after discounts and returns.", "sales")}
          ${this.card("green", I.cash, this.money(d.received.total), "Received", `Cash ${this.money(d.received.cash)} · Bank ${this.money(d.received.bank)}`, "ledgers", "", "All money collected in this period, in cash or bank.", "received")}
          ${this.card("red", I.exp, this.money(d.expenses.total), "Expenses", `Cash ${this.money(d.expenses.cash)} · Bank ${this.money(d.expenses.bank)}`, "expenses", "", "Money you spent on the shop in this period.", "expenses")}
          ${this.card("yellow", I.ret, this.money(d.returns.total), "Returns", `${d.returns.count} returns`, "returns", "", "Goods customers gave back. Already taken out of Sales.", "returns")}
          ${this.card("green", I.profit, this.money(d.netProfit), "Net Profit", d.netProfit === null ? "Click •••• and enter super-password" : "Sales − cost − expenses", "", profitColor, "What you really earned: Sales, minus the cost of the goods, minus expenses.", "profit")}
        </div>
      </div>
      <div class="dashboard-section">
        <h2>Cash, Bank and Dues</h2>
        <div class="stats-grid">
          ${this.card("green", I.cash, this.money(d.cashInHand), "Cash in Hand", "All time", "", "", "Cash that should be in your drawer now.", "cash")}
          ${this.card("blue", I.bank, this.money(d.bankBalance), "Bank Balance", "All time", "", "", "Money that should be in your bank now.", "bank")}
          ${this.card("yellow", I.due, this.money(d.oldBalance.amount), "Old Balances", `${d.oldBalance.customers} customers`, "ledgers", "", "Money customers owed you before you started using this system. It is not part of Net Profit.", "old")}
          ${this.card("red", I.due, this.money(d.outstanding.amount), "Customers Owe You", `${d.outstanding.customersOwing} customers`, "ledgers", d.outstanding.amount > 0 ? "var(--danger)" : "", "What customers still have to pay you, including old balances.", "owe")}
        </div>
      </div>
      <div class="dashboard-section">
        <h2>Stock</h2>
        <div class="stats-grid">
          ${this.card("blue", I.box, d.stock.itemsInStock, "Items in Stock", "", "inventory", "", "Units you can sell right now.", "")}
          ${this.card("yellow", I.box, this.money(d.stock.stockValue), "Stock Value (cost)", d.stock.stockValue === null ? "Click •••• and enter super-password" : "", "", "", "Items in stock multiplied by what you paid for them.", "")}
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

  // ---- "How is this worked out?" for each card
  sumTable(rows, totalLabel, total) {
    const row = ([sign, label, amount]) =>
      `<tr><td style="width:28px;text-align:center;font-weight:700;">${sign}</td><td>${label}</td><td style="text-align:right;">${this.money(amount)}</td></tr>`;
    return `<table class="info-sum">${rows.map(row).join("")}
      <tr class="info-total"><td style="text-align:center;font-weight:700;">=</td><td><strong>${totalLabel}</strong></td><td style="text-align:right;"><strong>${this.money(total)}</strong></td></tr></table>`;
  },

  showInfo(key) {
    const d = this.data;
    const x = d.details;
    const note = (t) => `<p class="info-note">${t}</p>`;
    let title = "", body = "";
    switch (key) {
      case "sales":
        title = "Sales";
        body = this.sumTable([["", "Total of your bills", d.sales]], "Sales", d.sales) +
          note("Discounts you gave and goods customers returned are already taken out of this figure.") +
          this.sumTable([["", "Discounts given (already taken out)", x.sales.discounts], ["", "Returns taken back (already taken out)", x.sales.returns]], "For your information", x.sales.discounts + x.sales.returns);
        break;
      case "received":
        title = "Received";
        body = this.sumTable([["", "Payments on sales", x.received.onSales], ["+", "Payments on old balances and other ledger payments", x.received.onLedger]], "Received", d.received.total) +
          this.sumTable([["", "Cash", d.received.cash], ["+", "Bank", d.received.bank]], "Received", d.received.total) +
          note("Received can be more than Sales. It also counts money paid for old balances, and money paid on a sale that was later returned.");
        break;
      case "expenses":
        title = "Expenses";
        body = this.sumTable([["", "Paid in cash", d.expenses.cash], ["+", "Paid from bank", d.expenses.bank]], "Expenses", d.expenses.total);
        break;
      case "returns":
        title = "Returns";
        body = note("The value of goods customers gave back in this period. It is already taken out of Sales, and the goods go back into your stock.") +
          this.sumTable([["", "Returns", d.returns.total]], "Returns", d.returns.total);
        break;
      case "profit":
        title = "Net Profit";
        body = x.profit === null
          ? note("Purchase prices are hidden. Click •••• and enter the super-password to see the profit.")
          : this.sumTable([["", "Sales", x.profit.sales], ["−", "Cost of the goods customers kept", x.profit.cogs], ["−", "Expenses", x.profit.expenses]], "Net Profit", d.netProfit) +
            note("A return takes away the sale and the cost of that item, so only the profit on that item is lost.");
        break;
      case "cash":
      case "bank": {
        const c = key === "cash" ? x.cash : x.bank;
        title = key === "cash" ? "Cash in Hand" : "Bank Balance";
        body = this.sumTable([["", key === "cash" ? "Opening cash (Settings)" : "Opening bank balance (Settings)", c.opening], ["+", key === "cash" ? "Cash received" : "Bank received", c.received], ["−", key === "cash" ? "Cash expenses" : "Bank expenses", c.expenses]], title, key === "cash" ? d.cashInHand : d.bankBalance) +
          note("All time. If you paid money back to a customer, it is not recorded here.");
        break;
      }
      case "old": {
        title = "Old Balances";
        body = this.sumTable([["", "Old balances recorded for customers", d.oldBalance.amount]], "Old Balances", d.oldBalance.amount) +
          this.sumTable([["", "Paid on the ledger in this period (not linked to a sale)", x.received.onLedger]], "For your information", x.received.onLedger) +
          note("This is money from before you used the system, so it is not profit. When a customer pays it, the money counts in Received and Cash in Hand, but not in Net Profit. It is also included in Customers Owe You.");
        break;
      }
      case "owe": {
        const o = x.owe;
        title = "Customers Owe You";
        const rows = [["", "Old balances", o.old_balance], ["+", "Sales (before returns)", o.sales], ["−", "Returns", o.returns], ["−", "Payments received", o.payments]];
        if (o.other) rows.push([o.other > 0 ? "+" : "−", "Other adjustments", Math.abs(o.other)]);
        body = this.sumTable(rows, o.balance >= 0 ? "Customers owe you" : "You owe customers", Math.abs(o.balance)) +
          note("All time, for all customers. Open the Ledgers page to see each customer.");
        break;
      }
    }
    Modal.show({ title, body, footer: '<button class="btn btn-primary" onclick="window.Modal.close()">Close</button>', size: "sm" });
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
