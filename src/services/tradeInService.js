const { getDatabase } = require("../database/dbInit");
const { roundMoney } = require("../utils/money");

const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));

// Buying a used device from a customer. The device goes into stock at the agreed value, and the value is either
// taken off what the customer owes (credit) or paid out of Cash/Bank. A cash payout is recorded as a payment to a
// "Trade-in: <customer>" supplier, so the cash book is right and it is not counted as an expense (the cost reaches
// profit when the device is sold).
class TradeInService {
  add(data) {
    const db = getDatabase();
    const customer = db.prepare("SELECT id, customer_name FROM customers WHERE id = ?").get(data.customer_id);
    if (!customer) throw new Error("Customer not found");
    const name = String(data.product_name || "").trim();
    if (!name) throw new Error("Product name is required");
    const value = roundMoney(data.value);
    if (!(value > 0)) throw new Error("Trade-in value must be greater than 0");
    if (!["credit", "cash", "bank"].includes(data.settlement)) throw new Error("Settle the trade-in as credit, cash or bank");
    const date = isDate(data.trade_date) ? data.trade_date : new Date().toLocaleDateString("sv-SE");

    return db.transaction(() => {
      const payout = data.settlement !== "credit";
      let supplier = "";
      if (payout) {
        supplier = `Trade-in: ${customer.customer_name}`;
        if (!db.prepare("SELECT 1 FROM suppliers WHERE name = ? COLLATE NOCASE").get(supplier)) {
          require("./supplierService").add({ name: supplier, notes: "Created for trade-in payouts" });
        }
      }
      const product = require("./inventoryService").importProduct({
        product_name: name, category: data.category || "Laptop", model: data.model || "", serial_number: data.serial_number || "",
        supplier, purchase_price: value, selling_price: roundMoney(data.selling_price || 0), quantity: 1, purchase_date: date,
        condition: data.condition || "Good", notes: [`Trade-in from ${customer.customer_name}`, data.notes].filter(Boolean).join(". "),
        paid_now: payout ? value : 0, payment_source: data.settlement === "bank" ? "Bank" : "Cash",
      });
      const trade = Number(db.prepare("INSERT INTO trade_ins (customer_id, product_id, product_name, value, settlement, trade_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(customer.id, product.id, name, value, data.settlement, date, String(data.notes || "")).lastInsertRowid);
      if (!payout) {
        require("./ledgerService")._addLedgerEntry(customer.id, "Adjustment", trade, `Trade-in: ${name}`, 0, value, date);
      }
      return { id: trade, product_id: product.id };
    })();
  }

  list() {
    return getDatabase().prepare("SELECT t.*, c.customer_name FROM trade_ins t JOIN customers c ON c.id = t.customer_id ORDER BY t.id DESC").all();
  }
}

module.exports = new TradeInService();
