// A full-screen "working" panel for anything that takes a moment (sending, creating a PDF, linking).
// It blocks clicks so an action cannot be started twice, and always ends with a clear result.
const Busy = {
  _el: null,
  _depth: 0,

  _ensure() {
    if (this._el) return this._el;
    const el = document.createElement("div");
    el.id = "busy-overlay";
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-live", "polite");
    el.style.cssText = "display:none;position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.55);align-items:center;justify-content:center;";
    el.innerHTML =
      '<div style="background:var(--card-bg,#fff);color:var(--text-primary,#111);border-radius:12px;padding:26px 34px;min-width:280px;max-width:420px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.35);">' +
      '<div class="spinner" id="busy-spinner" style="margin:0 auto 14px;"></div>' +
      '<div id="busy-title" style="font-size:16px;font-weight:700;"></div>' +
      '<div id="busy-sub" style="font-size:13px;color:var(--text-muted,#64748b);margin-top:6px;"></div></div>';
    document.body.appendChild(el);
    this._el = el;
    return el;
  },

  show(title, sub) {
    const el = this._ensure();
    this._depth += 1;
    this.update(title, sub);
    el.style.display = "flex";
  },

  update(title, sub) {
    this._ensure();
    document.getElementById("busy-title").textContent = title || "";
    document.getElementById("busy-sub").textContent = sub || "";
  },

  hide() {
    this._depth = Math.max(0, this._depth - 1);
    if (this._depth === 0 && this._el) this._el.style.display = "none";
  },

  // Runs fn while the panel is up; the panel always closes, even when fn throws.
  async run(title, sub, fn) {
    this.show(title, sub);
    try {
      return await fn();
    } finally {
      this.hide();
    }
  },
};

window.Busy = Busy;
