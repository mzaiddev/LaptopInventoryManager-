// Small shared form helpers for the screens that pick a customer.
const Pickers = {
  esc(v) { return ShopInfo.esc(v == null ? "" : String(v)); },

  // <option> list of active customers (and, if given, the one already chosen).
  async customerOptions(selectedId) {
    const r = await window.api.getAllCustomers({ limit: 5000, status: "Active" });
    const list = r.success ? r.data.customers || [] : [];
    return '<option value="">Select customer</option>' +
      list.map((c) => `<option value="${c.id}" ${Number(selectedId) === c.id ? "selected" : ""}>${this.esc(c.customer_name)}${c.phone ? " - " + this.esc(c.phone) : ""}</option>`).join("");
  },

  money(v) { return Formatters.formatCurrency(v || 0, App.currency); },

  today() { return new Date().toLocaleDateString("sv-SE"); },
};
