// Shop contact and payment details for report headers/footers.
// Every function takes the raw settings map (window.api.getSettings().data).
const ShopInfo = {
  esc(value) {
    const d = document.createElement("div");
    d.textContent = value == null ? "" : String(value);
    return d.innerHTML;
  },

  phones(s) {
    return [s.phone_number, s.phone_number_2].map((p) => (p || "").trim()).filter(Boolean);
  },

  // Address, phone(s) and map link as small centered lines.
  contactHtml(s, style = "font-size:14px;color:#000;margin:1px 0;") {
    if (!s) return "";
    const line = (text) => `<div style="${style}">${text}</div>`;
    const out = [];
    if (s.shop_address) out.push(line(this.esc(s.shop_address)));
    const phones = this.phones(s);
    if (phones.length) out.push(line("Phone: " + phones.map((p) => this.esc(p)).join(" | ")));
    if (s.google_map_link) out.push(line("Location: " + this.esc(s.google_map_link)));
    return out.join("");
  },

  // Address, phones and map link as plain strings (for the new report header).
  contactList(s) {
    if (!s) return [];
    const out = [];
    if (s.shop_address) out.push(s.shop_address);
    const phones = this.phones(s);
    if (phones.length) out.push("Phone: " + phones.join(" | "));
    if (s.google_map_link) out.push("Location: " + s.google_map_link);
    return out;
  },

  hasPayment(s) {
    return !!(s && (s.easypaisa_number || s.bank_account_number));
  },

  paymentLines(s) {
    const out = [];
    if (s.easypaisa_number) out.push(["EasyPaisa", s.easypaisa_number]);
    if (s.bank_account_number) {
      out.push(["Bank Account", s.bank_name ? s.bank_name + " - " + s.bank_account_number : s.bank_account_number]);
    }
    return out;
  },

  // "Pay to" block for customer-facing documents (statements, invoices).
  paymentHtml(s, style = "font-size:13px;color:#000;margin:2px 0;") {
    if (!this.hasPayment(s)) return "";
    const rows = this.paymentLines(s)
      .map(([label, value]) => `<div style="${style}"><strong>${this.esc(label)}:</strong> ${this.esc(value)}</div>`)
      .join("");
    return `<div style="margin-top:14px;padding-top:10px;border-top:1px solid #000;text-align:center;">
      <div style="${style}font-weight:700;">Payment Details</div>${rows}</div>`;
  },

  // Plain-text version for the WhatsApp message.
  paymentText(s, t = (x) => x) {
    if (!this.hasPayment(s)) return "";
    return this.paymentLines(s).map(([label, value]) => t(label) + ": " + value).join("\n");
  },
};

window.ShopInfo = ShopInfo;
