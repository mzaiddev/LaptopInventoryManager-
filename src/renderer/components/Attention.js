// The bell in the top bar: what needs the owner's attention today (backup, overdue customers, low stock, failed tasks).
// An alert can be marked read. A read alert leaves the count and moves under "Read". It comes back as unread only
// when it changes (a new overdue customer, a different item low on stock), so it does not nag about the same thing.
const Attention = {
  items: [],
  openState: false,
  initialized: false,
  timer: null,
  readMap: {},
  READ_KEY: "lim_attention_read",

  esc(v) { return ShopInfo.esc(v == null ? "" : String(v)); },

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    this.loadRead();
    document.addEventListener("pointerdown", (e) => {
      const root = document.getElementById("attention-root");
      if (this.openState && root && !root.contains(e.target)) this.close();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && this.openState) this.close(); });
    // WhatsApp connecting or dropping changes an alert, so re-check soon after it happens.
    try { if (window.api.onWaChanged) window.api.onWaChanged(() => { clearTimeout(this.waTimer); this.waTimer = setTimeout(() => this.refresh(), 1500); }); } catch (e) { /* the 5 minute check still runs */ }
    await this.refresh();
    // Quiet re-check so the count stays fresh while the app stays open.
    this.timer = setInterval(() => this.refresh(), 5 * 60 * 1000);
  },

  // ---- Read state (kept on this PC; losing it only makes alerts show as unread again)
  loadRead() {
    try { this.readMap = JSON.parse(localStorage.getItem(this.READ_KEY) || "{}") || {}; } catch (e) { this.readMap = {}; }
  },

  saveRead() {
    try { localStorage.setItem(this.READ_KEY, JSON.stringify(this.readMap)); } catch (e) { /* kept for this session only */ }
  },

  // What the alert is about right now. When this changes, the alert is new again.
  signature(item) {
    const who = (item.entries || []).map((e) => e.target ? [e.target.type, e.target.id || e.target.saleId || ""].join(":") : e.label).join(",");
    return [item.id, item.count == null ? "" : item.count, who || item.detail || ""].join("|");
  },

  isRead(item) { return this.readMap[item.id] === this.signature(item); },

  unread() { return this.items.filter((i) => !this.isRead(i)); },

  markRead(index) {
    const item = this.items[index];
    if (!item) return;
    this.readMap[item.id] = this.signature(item);
    this.saveRead();
    this.update();
  },

  markUnread(index) {
    const item = this.items[index];
    if (!item) return;
    delete this.readMap[item.id];
    this.saveRead();
    this.update();
  },

  markAllRead() {
    this.items.forEach((i) => { this.readMap[i.id] = this.signature(i); });
    this.saveRead();
    this.update();
  },

  async refresh() {
    try {
      const r = await window.api.getAttention();
      if (r && r.success) this.items = r.data || [];
    } catch (e) { return; }
    // Forget read marks for alerts that no longer exist.
    const live = new Set(this.items.map((i) => i.id));
    Object.keys(this.readMap).forEach((id) => { if (!live.has(id)) delete this.readMap[id]; });
    this.saveRead();
    this.update();
  },

  // The number on the bell counts unread alerts only.
  update() {
    const unread = this.unread();
    const count = document.getElementById("attention-count");
    if (count) {
      count.textContent = String(unread.length);
      count.style.display = unread.length ? "inline-flex" : "none";
      count.classList.toggle("bad", unread.some((i) => i.level === "bad"));
    }
    if (this.openState) this.render();
  },

  toggle() {
    if (this.openState) return this.close();
    this.openState = true;
    document.getElementById("attention-toggle").setAttribute("aria-expanded", "true");
    this.render();
    this.refresh();
  },

  close() {
    this.openState = false;
    const panel = document.getElementById("attention-panel");
    if (panel) panel.style.display = "none";
    const btn = document.getElementById("attention-toggle");
    if (btn) btn.setAttribute("aria-expanded", "false");
  },

  groupHtml(i, idx) {
    const read = this.isRead(i);
    const amount = i.amount ? ` &middot; ${this.esc(Formatters.formatCurrency(i.amount, App.currency))}` : "";
    const entries = (i.entries || []).map((e, n) => {
      const owed = e.amount ? `<em>${this.esc(Formatters.formatCurrency(e.amount, App.currency))}</em>` : "";
      return `<button class="attention-entry" onclick="Attention.openEntry(${idx},${n})">
        <span class="attention-entry-text"><strong>${this.esc(e.label)}</strong><small>${this.esc(e.detail || "")}</small></span>${owed}
      </button>`;
    }).join("");
    const more = i.count > (i.entries || []).length && (i.entries || []).length
      ? `<button class="attention-more" onclick="Attention.open(${idx})">View all ${this.esc(i.count)} &rarr;</button>` : "";
    const toggle = read
      ? `<button class="attention-mark" onclick="Attention.markUnread(${idx})" title="Show it as new again">Unread</button>`
      : `<button class="attention-mark" onclick="Attention.markRead(${idx})" title="Remove it from the bell until something changes">Mark read</button>`;
    return `<div class="attention-group${read ? " is-read" : ""}">
      <div class="attention-group-head">
        <button class="attention-item ${this.esc(i.level)}" onclick="Attention.open(${idx})">
          <span class="attention-dot"></span>
          <span class="attention-text"><strong>${this.esc(i.title)}</strong><small>${this.esc(i.detail || "")}${amount}</small></span>
        </button>${toggle}
      </div>${entries}${more}
    </div>`;
  },

  render() {
    const panel = document.getElementById("attention-panel");
    if (!panel) return;
    const fresh = this.items.map((i, idx) => ({ i, idx })).filter((x) => !this.isRead(x.i));
    const old = this.items.map((i, idx) => ({ i, idx })).filter((x) => this.isRead(x.i));
    const head = `<div class="attention-head"><span>Needs attention</span>${fresh.length ? '<button class="attention-mark" onclick="Attention.markAllRead()">Mark all read</button>' : ""}</div>`;
    const body = fresh.length
      ? fresh.map((x) => this.groupHtml(x.i, x.idx)).join("")
      : `<div class="attention-empty">${this.items.length ? "All caught up. Nothing new." : "All clear. Nothing needs your attention."}</div>`;
    const earlier = old.length ? `<div class="attention-subhead">Read</div>${old.map((x) => this.groupHtml(x.i, x.idx)).join("")}` : "";
    panel.innerHTML = head + `<div class="attention-scroll">${body}${earlier}</div>`;
    panel.style.display = "block";
  },

  // The whole alert: its page (or the task list). Opening it counts as having seen it.
  open(index) {
    const item = this.items[index];
    this.close();
    if (!item) return;
    this.readMap[item.id] = this.signature(item);
    this.saveRead();
    this.update();
    if (item.action === "tasks" && window.TaskCenter) return TaskCenter.open();
    if (item.page) App.navigate(item.page);
  },

  // One person or thing in the alert: land on exactly that customer, item, plan or task.
  async openEntry(index, entryIndex) {
    const item = this.items[index];
    const entry = item && (item.entries || [])[entryIndex];
    this.close();
    if (!entry || !entry.target) return;
    this.readMap[item.id] = this.signature(item);
    this.saveRead();
    this.update();
    await this.go(entry.target);
  },

  async go(target) {
    try {
      if (target.type === "customer") {
        await App.navigate("customers");
        await CustomersPage.viewCustomer(target.id);
      } else if (target.type === "product") {
        await App.navigate("inventory");
        await InventoryPage.viewProduct(target.id);
      } else if (target.type === "instalment") {
        await App.navigate("instalments");
        await InstalmentsPage.showPlan(target.saleId);
      } else if (target.type === "supplier") {
        await App.navigate("suppliers");
        await SuppliersPage.showStatement(target.id);
      } else if (target.type === "servicejob") {
        await App.navigate("service-jobs");
        await ServiceJobsPage.showForm(target.id);
      } else if (target.type === "task" && window.TaskCenter) {
        await TaskCenter.open(target.id);
      } else if (target.page) {
        await App.navigate(target.page);
      }
    } catch (e) {
      Toast.error("Could not open that. Try from the page itself.");
    }
  },
};
