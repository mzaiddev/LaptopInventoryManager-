// Applies the business-type wording (shared/wording.js) to screen labels as they appear.
// Saved data is never rewritten: table cells, dropdown options, inputs and detail values are skipped.
const Wording = {
  type: null,
  observer: null,
  SKIP: "td, option, input, textarea, select, script, style, .stat-value, .detail-value, [data-no-wording]",

  start(type) {
    this.type = type;
    if (this.observer) { this.observer.disconnect(); this.observer = null; }
    if (!WordingRules.hasRules(type)) return;
    this.apply(document.body);
    this.observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") this.fixText(r.target);
        else r.addedNodes.forEach((n) => this.apply(n));
      }
    });
    this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  },

  fixText(node) {
    const parent = node.parentElement;
    if (!parent || parent.closest(this.SKIP)) return;
    const next = WordingRules.rewrite(node.nodeValue, this.type);
    if (next !== node.nodeValue) node.nodeValue = next;
  },

  apply(root) {
    if (!root) return;
    if (root.nodeType === 3) return this.fixText(root);
    if (root.nodeType !== 1) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((n) => this.fixText(n));
    root.querySelectorAll("[placeholder], [title]").forEach((el) => {
      for (const attr of ["placeholder", "title"]) {
        const v = el.getAttribute(attr);
        if (v) { const next = WordingRules.rewrite(v, this.type); if (next !== v) el.setAttribute(attr, next); }
      }
    });
  },
};
