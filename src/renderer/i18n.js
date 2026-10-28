// Language switch (English / Urdu) for the whole screen.
// The app writes English everywhere; this layer translates text, placeholders and tooltips
// as they appear, and puts the English back when the language is switched.
const I18n = {
  lang: "en",
  translate: null,
  originals: new WeakMap(), // text node -> English text
  applied: new WeakMap(), // text node -> the text we last wrote
  attrOriginals: new WeakMap(), // element -> { attr: English }
  attrApplied: new WeakMap(), // element -> { attr: text we last wrote }
  observer: null,
  ATTRS: ["placeholder", "title", "alt", "aria-label"],
  SKIP: new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE"]),

  init() {
    this.translate = createTranslator(window.UR_DICT);
    try {
      this.lang = localStorage.getItem("lim_lang") === "ur" ? "ur" : "en";
    } catch {
      this.lang = "en";
    }
    this.wrapNativeDialogs();
    this.setDirection();
    if (this.lang === "ur") this.start();
  },

  hasLocalChoice() {
    try {
      return localStorage.getItem("lim_lang") !== null;
    } catch {
      return false;
    }
  },

  isUrdu() {
    return this.lang === "ur";
  },

  setDirection() {
    const ur = this.isUrdu();
    document.documentElement.lang = ur ? "ur" : "en";
    document.documentElement.dir = ur ? "rtl" : "ltr";
    this.updateToggle();
  },

  updateToggle() {
    const btn = document.getElementById("lang-toggle");
    if (btn) btn.textContent = this.isUrdu() ? "English" : "اردو";
  },

  // confirm() and alert() are native windows, outside the page.
  wrapNativeDialogs() {
    const confirmNative = window.confirm.bind(window);
    const alertNative = window.alert.bind(window);
    window.confirm = (m) => confirmNative(this.t(m));
    window.alert = (m) => alertNative(this.t(m));
  },

  t(text) {
    return this.isUrdu() ? this.translate(text) : text;
  },

  start() {
    this.apply(document.body);
    if (this.observer) return;
    this.observer = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "childList") m.addedNodes.forEach((n) => this.apply(n));
        else if (m.type === "characterData") this.translateText(m.target);
        else if (m.type === "attributes") this.translateAttrs(m.target);
      }
    });
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: this.ATTRS,
    });
  },

  // Elements: a textarea's placeholder still needs translating, only its inner text is skipped.
  skippedElement(el) {
    for (let e = el; e; e = e.parentElement) {
      if (e.tagName === "SCRIPT" || e.tagName === "STYLE" || e.hasAttribute("data-no-i18n")) return true;
    }
    return false;
  },

  skipped(node) {
    for (let el = node.nodeType === 1 ? node : node.parentElement; el; el = el.parentElement) {
      if (this.SKIP.has(el.tagName) || el.hasAttribute("data-no-i18n")) return true;
    }
    return false;
  },

  apply(root) {
    if (!root) return;
    if (root.nodeType === 3) return this.skipped(root) ? undefined : this.translateText(root);
    if (root.nodeType !== 1 || this.skippedElement(root)) return;
    this.translateAttrs(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === 3) {
        if (!this.skipped(n)) this.translateText(n);
      } else if (!this.skippedElement(n)) {
        this.translateAttrs(n);
      }
    }
  },

  translateText(node) {
    if (!this.isUrdu() || this.skipped(node)) return;
    const cur = node.data;
    if (!this.originals.has(node) || cur !== this.applied.get(node)) this.originals.set(node, cur); // the app wrote new text
    const out = this.translate(this.originals.get(node));
    this.applied.set(node, out);
    if (out !== cur) node.data = out;
  },

  translateAttrs(el) {
    if (!this.isUrdu() || el.nodeType !== 1) return;
    const orig = this.attrOriginals.get(el) || {};
    const last = this.attrApplied.get(el) || {};
    for (const a of this.ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      if (!(a in orig) || cur !== last[a]) orig[a] = cur;
      const out = this.translate(orig[a]);
      last[a] = out;
      if (out !== cur) el.setAttribute(a, out);
    }
    this.attrOriginals.set(el, orig);
    this.attrApplied.set(el, last);
  },

  // Put every translated text back to English.
  restore() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === 3) {
        if (this.originals.has(n) && n.data === this.applied.get(n)) n.data = this.originals.get(n);
      } else {
        const orig = this.attrOriginals.get(n);
        const last = this.attrApplied.get(n);
        if (orig) for (const a in orig) if (n.getAttribute(a) === last[a]) n.setAttribute(a, orig[a]);
      }
    }
  },

  async setLanguage(lang, save = true) {
    if (lang === this.lang) return this.updateToggle();
    this.lang = lang === "ur" ? "ur" : "en";
    try {
      localStorage.setItem("lim_lang", this.lang);
    } catch {}
    this.setDirection();
    if (this.isUrdu()) {
      this.start();
    } else {
      if (this.observer) this.observer.disconnect();
      this.observer = null;
      this.restore();
    }
    if (save && window.api) window.api.updateSettings({ language: this.lang }).catch(() => {});
    // Pages build their text when they are drawn, so draw the current one again.
    // App and LoginPage are top-level consts, so they are globals but not window properties.
    if (typeof App !== "undefined" && document.getElementById("app").style.display !== "none" && App.currentPage) {
      Modal.close();
      App.navigate(App.currentPage);
    } else if (typeof LoginPage !== "undefined" && document.getElementById("login-screen").style.display !== "none") {
      LoginPage.show();
    }
  },

  toggle() {
    return this.setLanguage(this.isUrdu() ? "en" : "ur");
  },

  // For documents built as text (print windows, PDFs): returns translated, right-to-left HTML.
  translateHtml(html) {
    if (!this.isUrdu()) return html;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === 3) {
        const p = n.parentElement;
        if (!p || this.SKIP.has(p.tagName)) continue;
        n.data = this.translate(n.data);
      } else {
        for (const a of this.ATTRS) if (n.hasAttribute(a)) n.setAttribute(a, this.translate(n.getAttribute(a)));
      }
    }
    doc.documentElement.setAttribute("lang", "ur");
    doc.documentElement.setAttribute("dir", "rtl");
    const style = doc.createElement("style");
    style.textContent =
      "body{font-family:'Segoe UI','Tahoma','Urdu Typesetting',sans-serif;} th,td{text-align:right !important;} .invoice-totals{text-align:left !important;}";
    (doc.head || doc.documentElement).appendChild(style);
    return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
  },
};
