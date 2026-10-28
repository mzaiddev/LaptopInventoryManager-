// One professional look for every printed report, invoice, statement and WhatsApp PDF.
//
// Colour is only ever a second signal. Every colour has a word or a shape next to it, so a black-and-white
// printer (or a grey photocopy) reads exactly the same:
//   - status:   PAID = soft fill + thin border, PARTIAL = dashed border, DUE = solid dark fill with white text
//   - amounts:  money in / out carry + and - signs
//   - headings: tinted light so they print as pale grey, with a thick dark rule underneath
//   - totals:   bold, thick top border, tinted row
//   - the amount due sits in a heavy bordered box with a bold label
const ReportTheme = {
  esc(v) {
    return ShopInfo.esc(v);
  },

  css(orientation = "portrait") {
    return `
@page { size: A4 ${orientation}; margin: 12mm 12mm 16mm; }
.rpt, .rpt * { box-sizing: border-box; }
.rpt {
  --ink:#14171c; --muted:#566070; --line:#cdd3dc; --line-strong:#8793a4;
  --brand:#1f3a5f; --brand-soft:#e8eef6;
  --ok:#17663a; --ok-soft:#e4f2e9; --bad:#a31d1d; --bad-soft:#fbe8e8; --warn:#85530a; --warn-soft:#fcf0d6;
  font-family: 'Segoe UI', 'Noto Sans', Arial, sans-serif; font-size: 12.5px; line-height: 1.45; color: var(--ink); background: #fff;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.rpt-toolbar { text-align: center; margin-bottom: 12px; }
.rpt-toolbar button { padding: 8px 20px; margin: 0 5px; border: 1px solid var(--brand); border-radius: 6px; cursor: pointer; font-size: 13px; background: #fff; color: var(--brand); font-weight: 600; }
@media print { .no-print { display: none !important; } }

/* header */
.rpt-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; padding-bottom: 10px; border-bottom: 3px solid var(--brand); margin-bottom: 14px; }
.rpt-shop h1 { font-size: 22px; line-height: 1.15; color: var(--brand); margin: 0 0 3px; font-weight: 800; letter-spacing: .2px; }
.rpt-shop .line { font-size: 11.5px; color: var(--muted); }
.rpt-doc { text-align: end; }
.rpt-doc .title { font-size: 17px; font-weight: 800; color: var(--brand); text-transform: uppercase; letter-spacing: .9px; }
.rpt-doc .meta { font-size: 11.5px; color: var(--muted); }
.rpt-doc .meta b { color: var(--ink); }
.rpt-sub { color: var(--muted); font-size: 12px; margin: -6px 0 10px; }

/* section titles */
.rpt h2.sec { font-size: 12.5px; font-weight: 800; color: var(--brand); text-transform: uppercase; letter-spacing: .7px; border-inline-start: 4px solid var(--brand); padding-inline-start: 8px; margin: 18px 0 6px; }

/* info boxes */
.rpt .info { display: flex; gap: 12px; margin-bottom: 8px; }
.rpt .info .box { flex: 1; border: 1px solid var(--line-strong); border-radius: 6px; padding: 8px 11px; }
.rpt .info .k { font-size: 10.5px; color: var(--muted); text-transform: uppercase; font-weight: 700; letter-spacing: .5px; }
.rpt .info .v { font-size: 13px; font-weight: 700; }
.rpt .info .s { font-size: 11.5px; color: var(--muted); }

/* tables */
.rpt table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 6px 0 12px; }
.rpt thead { display: table-header-group; }
.rpt thead th { background: var(--brand-soft); color: var(--brand); font-weight: 800; text-align: start; padding: 7px 8px; border-top: 1px solid var(--line-strong); border-bottom: 2px solid var(--brand); font-size: 10.5px; text-transform: uppercase; letter-spacing: .5px; white-space: nowrap; }
.rpt tbody td { padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
.rpt tbody tr:nth-child(even) td { background: #f7f9fc; }
.rpt tfoot td { font-weight: 800; border-top: 2px solid var(--brand); background: var(--brand-soft); padding: 7px 8px; }
.rpt tr { page-break-inside: avoid; }
.rpt .num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rpt .ctr { text-align: center; }
.rpt .muted { color: var(--muted); }
.rpt .pos { color: var(--ok); font-weight: 700; }
.rpt .neg { color: var(--bad); font-weight: 700; }
.rpt .strong { font-weight: 800; }

/* status badges: fill, dashed or solid-dark, so they differ without colour */
.rpt .badge { display: inline-block; padding: 1px 9px; border-radius: 10px; font-size: 10.5px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase; border: 1.5px solid var(--line-strong); white-space: nowrap; }
.rpt .badge.ok { color: var(--ok); background: var(--ok-soft); border-color: var(--ok); }
.rpt .badge.bad { color: #fff; background: var(--bad); border-color: var(--bad); }
.rpt .badge.warn { color: var(--warn); background: var(--warn-soft); border-color: var(--warn); border-style: dashed; }
.rpt .badge.neutral { color: var(--muted); background: #f1f3f6; }

/* summary tiles */
.rpt .kpis { display: flex; gap: 10px; flex-wrap: wrap; margin: 8px 0 12px; }
.rpt .kpi { flex: 1; min-width: 118px; border: 1px solid var(--line-strong); border-top: 4px solid var(--brand); border-radius: 5px; padding: 7px 10px; }
.rpt .kpi .k { font-size: 10px; color: var(--muted); text-transform: uppercase; font-weight: 700; letter-spacing: .5px; }
.rpt .kpi .v { font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; }
.rpt .kpi.ok { border-top-color: var(--ok); } .rpt .kpi.ok .v { color: var(--ok); }
.rpt .kpi.bad { border-top-color: var(--bad); } .rpt .kpi.bad .v { color: var(--bad); }
.rpt .kpi.warn { border-top-color: var(--warn); } .rpt .kpi.warn .v { color: var(--warn); }

/* the amount due: heavy border, big bold figure, a label that says what it is */
.rpt .duebox { display: flex; justify-content: space-between; align-items: center; gap: 12px; border: 3px solid var(--bad); background: var(--bad-soft); border-radius: 7px; padding: 10px 16px; margin: 12px 0; page-break-inside: avoid; }
.rpt .duebox .lbl { font-size: 12px; font-weight: 800; letter-spacing: .9px; text-transform: uppercase; color: var(--bad); }
.rpt .duebox .note { font-size: 11.5px; color: var(--muted); }
.rpt .duebox .amt { font-size: 25px; font-weight: 800; color: var(--bad); font-variant-numeric: tabular-nums; white-space: nowrap; }
.rpt .duebox.ok { border-color: var(--ok); background: var(--ok-soft); }
.rpt .duebox.ok .lbl, .rpt .duebox.ok .amt { color: var(--ok); }

/* account summary that adds up */
.rpt table.sum td { padding: 7px 10px; border-bottom: 1px solid var(--line); background: transparent !important; }
.rpt table.sum td.sign { width: 30px; text-align: center; font-weight: 800; color: var(--brand); }
.rpt table.sum tr.total td { border-top: 2px solid var(--brand); border-bottom: 2px solid var(--brand); background: var(--brand-soft) !important; font-weight: 800; font-size: 13.5px; }

/* how to pay */
.rpt .pay { border: 2px solid var(--brand); border-radius: 7px; overflow: hidden; margin: 14px 0; page-break-inside: avoid; }
.rpt .pay .bar { background: var(--brand); color: #fff; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 5px 12px; font-size: 11.5px; }
.rpt .pay .items { display: flex; gap: 28px; padding: 9px 14px; flex-wrap: wrap; }
.rpt .pay .k { font-size: 10px; color: var(--muted); text-transform: uppercase; font-weight: 800; letter-spacing: .5px; }
.rpt .pay .v { font-size: 16px; font-weight: 800; letter-spacing: .4px; font-variant-numeric: tabular-nums; }

/* invoice totals */
.rpt .totals { margin-inline-start: auto; width: 290px; margin-top: 4px; }
.rpt .totals .row { display: flex; justify-content: space-between; padding: 4px 8px; border-bottom: 1px solid var(--line); }
.rpt .totals .row.grand { border-top: 2px solid var(--brand); border-bottom: 2px solid var(--brand); background: var(--brand-soft); font-weight: 800; font-size: 14px; }
.rpt .totals .row.due { font-weight: 800; color: var(--bad); }

/* a sale inside a statement */
.rpt .sale { border: 1px solid var(--line-strong); border-radius: 6px; padding: 8px 10px; margin: 0 0 10px; page-break-inside: avoid; }
.rpt .sale .top { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.rpt .sale table { margin: 6px 0 0; }

/* footer */
.rpt-foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid var(--line-strong); font-size: 10.5px; color: var(--muted); display: flex; justify-content: space-between; gap: 12px; }
.rpt-thanks { text-align: center; font-weight: 700; color: var(--brand); margin-top: 14px; }
`;
  },

  styleTag(orientation) {
    return `<style>${this.css(orientation)}</style>`;
  },

  // A full page (print window / PDF). body is already-built HTML.
  wrap({ title, body, landscape = false, toolbar = true, autoPrint = false }) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${this.esc(title)}</title>${this.styleTag(landscape ? "landscape" : "portrait")}
<style>body{margin:0;padding:14px;background:#fff;} @media print{body{padding:0;}}</style></head><body>
<div class="rpt">
${toolbar ? '<div class="rpt-toolbar no-print"><button onclick="window.print()">Print</button><button onclick="window.print()">Save as PDF</button></div>' : ""}
${body}
</div>${autoPrint ? "<script>window.onload=function(){setTimeout(function(){window.print()},400)};<\/script>" : ""}</body></html>`;
  },

  // shop: the raw settings map. meta: [[label, value], ...] shown under the document title.
  header({ shop = {}, title, meta = [], subtitle = "" }) {
    const lines = ShopInfo.contactList(shop).map((l) => `<div class="line">${this.esc(l)}</div>`).join("");
    const metaHtml = meta
      .filter((m) => m && m[1] !== "" && m[1] != null)
      .map(([k, v]) => `<div class="meta">${this.esc(k)}: <b>${this.esc(v)}</b></div>`)
      .join("");
    return `<div class="rpt-head">
  <div class="rpt-shop"><h1>${this.esc(shop.shop_name || shop.shopName || "")}</h1>${lines}</div>
  <div class="rpt-doc"><div class="title">${this.esc(title)}</div>${metaHtml}</div>
</div>${subtitle ? `<div class="rpt-sub">${this.esc(subtitle)}</div>` : ""}`;
  },

  footer({ shop = {}, note = "" } = {}) {
    const now = new Date();
    return `<div class="rpt-foot"><span>${this.esc(note || "Computer-generated document from " + (shop.shop_name || shop.shopName || "our system"))}</span><span><span>Generated:</span> ${this.esc(now.toLocaleDateString())} ${this.esc(now.toLocaleTimeString())}</span></div>`;
  },

  // A discount as a percent of what it came off, e.g. "10%" ("" when there is no discount or no base).
  pct(discount, base) {
    if (!(discount > 0) || !(base > 0)) return "";
    return Math.round((discount / base) * 10000) / 100 + "%";
  },

  // kind: ok | bad | warn | neutral
  badge(kind, text) {
    return `<span class="badge ${kind}">${this.esc(text)}</span>`;
  },

  // Sale/invoice payment status as a badge.
  paymentBadge(status) {
    const s = String(status || "").toLowerCase();
    if (s === "paid") return this.badge("ok", "Paid");
    if (s === "partial") return this.badge("warn", "Partial");
    if (["unpaid", "pending", "due", "outstanding"].includes(s)) return this.badge("bad", "Due");
    return this.badge("neutral", status || "-");
  },

  // Stock status / condition as a badge.
  stockBadge(value) {
    const v = String(value || "");
    if (["In Stock", "Excellent"].includes(v)) return this.badge("ok", v);
    if (["Reserved", "Good", "Fair"].includes(v)) return this.badge("warn", v);
    if (["Damaged", "Lost", "For Parts"].includes(v)) return this.badge("bad", v);
    return this.badge("neutral", v || "-");
  },

  // items: [{ label, value, tone }]  tone: ok | bad | warn | ""
  kpis(items) {
    return `<div class="kpis">${items
      .map((i) => `<div class="kpi ${i.tone || ""}"><div class="k">${this.esc(i.label)}</div><div class="v">${i.value}</div></div>`)
      .join("")}</div>`;
  },

  // tone: bad (money owed) | ok (settled / in credit)
  dueBox({ label, amount, note = "", tone = "bad" }) {
    return `<div class="duebox ${tone === "ok" ? "ok" : ""}"><div><div class="lbl">${this.esc(label)}</div>${note ? `<div class="note">${this.esc(note)}</div>` : ""}</div><div class="amt">${amount}</div></div>`;
  },

  // "How to pay" block; empty when the shop has not entered payment details.
  paymentBox(shop = {}) {
    if (!ShopInfo.hasPayment(shop)) return "";
    const items = ShopInfo.paymentLines(shop)
      .map(([k, v]) => `<div><div class="k">${this.esc(k)}</div><div class="v">${this.esc(v)}</div></div>`)
      .join("");
    return `<div class="pay"><div class="bar">How to pay</div><div class="items">${items}</div></div>`;
  },

  section(title) {
    return `<h2 class="sec">${this.esc(title)}</h2>`;
  },
};

window.ReportTheme = ReportTheme;
