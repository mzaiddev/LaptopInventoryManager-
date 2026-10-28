// System Health: is the data safe, is anything stuck. One screen the owner (or support) can read at a glance.
const HealthPage = {
  esc(v) { return ShopInfo.esc(v == null ? "" : String(v)); },

  size(bytes) {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
    if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
    return bytes + " bytes";
  },

  ago(iso) {
    if (!iso) return { text: "Never", level: "bad" };
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    const when = new Date(iso).toLocaleString();
    if (days < 1) return { text: `Today (${when})`, level: "ok" };
    return { text: `${days} day${days === 1 ? "" : "s"} ago (${when})`, level: days >= 2 ? "warn" : "ok" };
  },

  card(label, value, level = "", sub = "") {
    return `<div class="stat-card"><div class="stat-value health-${level}" style="font-size:20px;">${value}</div><div class="stat-label">${label}</div>${sub ? `<div class="stat-trend">${sub}</div>` : ""}</div>`;
  },

  async load() {
    const el = document.getElementById("page-content");
    el.innerHTML = `
      <div class="page-header">
        <div><h1>System Health</h1><p>Is your data safe and is anything stuck?</p></div>
        <button class="btn btn-secondary" onclick="HealthPage.load()">Check again</button>
      </div>
      <div id="health-body"><div class="loading"><div class="spinner"></div></div></div>`;
    const r = await window.api.getHealth();
    const body = document.getElementById("health-body");
    if (!body) return;
    if (!r.success) {
      body.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${this.esc(r.error)}</p></div>`;
      return;
    }
    const h = r.data;
    const backup = this.ago(h.lastBackupAt);
    const integrity = h.integrity.ok ? { text: "No problems found", level: "ok" } : { text: `${h.integrity.problems} problem${h.integrity.problems === 1 ? "" : "s"} found`, level: "bad" };
    const tasks = h.tasks.failed ? { text: `${h.tasks.failed} need a look`, level: "warn" } : { text: h.tasks.running ? `${h.tasks.running} running` : "Nothing waiting", level: "ok" };
    body.innerHTML = `
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin-bottom:16px;">
        ${this.card("Last backup", this.esc(backup.text), backup.level)}
        ${this.card("Data check", this.esc(integrity.text), integrity.level, h.integrity.ok ? "Sales, payments and ledgers add up" : "")}
        ${this.card("Background tasks", this.esc(tasks.text), tasks.level)}
        ${this.card("Database size", this.esc(this.size(h.dbSizeBytes)), "ok")}
        ${this.card("App version", this.esc(h.version || "-"), "ok")}
      </div>
      ${h.integrity.ok ? "" : `<div class="card" style="margin-bottom:16px;"><div class="card-header"><h3>Problems</h3></div><div class="card-body"><ul style="margin-left:18px;">${h.integrity.details.map((d) => `<li>${this.esc(d)}</li>`).join("")}</ul></div></div>`}
      <div class="card"><div class="card-header"><h3>What is stored</h3></div><div class="card-body">
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));">
          ${["products", "customers", "sales", "suppliers"].map((k) => `<div class="stat-card"><div class="stat-value">${h.counts[k]}</div><div class="stat-label">${k[0].toUpperCase() + k.slice(1)}</div></div>`).join("")}
        </div>
      </div></div>`;
  },
};
