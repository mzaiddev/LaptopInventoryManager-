/**
 * Fills the app database with a small, consistent set of sample data covering the tables the app uses
 * (products, suppliers, customers, sales, payments, returns, damages, ledgers, expenses ...).
 *
 * The better-sqlite3 build in node_modules targets Electron, so run it through Electron's Node:
 *   PowerShell:  $env:ELECTRON_RUN_AS_NODE=1; .\node_modules\electron\dist\electron.exe seed-sample-data.js
 *   bash:        ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe seed-sample-data.js
 *
 * Add --force to seed a database that already has products or customers.
 * Set LIM_DATA_DIR to seed a copy elsewhere instead of the real app data.
 */
const path = require("path");
const { initDatabase, closeDatabase } = require("./src/database/dbInit");

const dataDir = process.env.LIM_DATA_DIR || path.join(process.env.APPDATA, "LaptopInventoryManager");
const dbPath = path.join(dataDir, "data", "inventory.db");
console.log(`Using database: ${dbPath}`);

const db = initDatabase(dbPath);

const have = db.prepare("SELECT (SELECT COUNT(*) FROM products) p, (SELECT COUNT(*) FROM customers) c").get();
if ((have.p || have.c) && !process.argv.includes("--force")) {
  console.log(`Database already has ${have.p} products and ${have.c} customers. Re-run with --force to add the sample data anyway.`);
  closeDatabase();
  process.exit(0);
}

const round = (n) => Math.round(n * 100) / 100;
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("sv-SE");
};

// ---- helpers mirroring the services -------------------------------------------------------
function addLedger(customerId, type, refId, description, debit, credit, date, method = null) {
  const last = db.prepare("SELECT running_balance FROM customer_ledger WHERE customer_id = ? ORDER BY entry_date DESC, id DESC LIMIT 1").get(customerId);
  const balance = round((last ? last.running_balance : 0) + debit - credit);
  db.prepare(`INSERT INTO customer_ledger (customer_id, reference_type, reference_id, description, debit, credit, running_balance, entry_date, payment_method)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(customerId, type, refId, description, debit, credit, balance, date, method);
  return balance;
}

const refCounters = {};
function nextRef(prefix, date) {
  const key = `${prefix}-${date.replace(/-/g, "")}`;
  refCounters[key] = (refCounters[key] || 0) + 1;
  return `${key}-${String(refCounters[key]).padStart(4, "0")}`;
}

const supplierIds = {};
function addSupplier(s, opening) {
  const id = Number(db.prepare("INSERT INTO suppliers (name, phone, phone2, address, notes, status) VALUES (?, ?, ?, ?, ?, ?)")
    .run(s.name, s.phone, s.phone2 || "", s.address, s.notes || "", s.status || "Active").lastInsertRowid);
  supplierIds[s.name] = id;
  if (opening) {
    db.prepare("INSERT INTO supplier_ledger (supplier_id, entry_date, entry_type, charge, note) VALUES (?, ?, 'Opening', ?, 'Opening balance')").run(id, daysAgo(90), opening);
  }
}

function addProduct(p) {
  const id = Number(db.prepare(`INSERT INTO products (product_name, category, model, serial_number, supplier, purchase_price, selling_price, quantity,
      purchase_date, warranty, storage_location, notes, status, condition) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'In Stock', ?)`)
    .run(p.name, p.category, p.model, p.serial || "", p.supplier, p.buy, p.sell, p.qty, p.date, p.warranty || "", p.location, p.notes || "", p.condition || "Excellent").lastInsertRowid);
  // Same bill the app makes when a product is added with a supplier
  const sid = supplierIds[p.supplier];
  db.prepare("INSERT INTO supplier_ledger (supplier_id, entry_date, entry_type, charge, note, product_id, product_qty) VALUES (?, ?, 'Purchase', ?, ?, ?, ?)")
    .run(sid, p.date, round(p.buy * p.qty), `${p.name} x ${p.qty}`, id, p.qty);
  if (p.paidNow) {
    db.prepare("INSERT INTO supplier_ledger (supplier_id, entry_date, entry_type, paid, payment_source, note, product_id) VALUES (?, ?, 'Payment', ?, ?, 'Paid with product', ?)")
      .run(sid, p.date, p.paidNow, p.paySource || "Cash", id);
  }
  return id;
}

function addSale(s) {
  const ref = nextRef("SALE", s.date);
  const total = round(s.items.reduce((sum, i) => sum + i.qty * i.price, 0));
  const paid = s.type === "Cash" ? total : round(Math.min(s.paid || 0, total));
  const remaining = round(total - paid);
  const status = remaining <= 0 ? "Paid" : paid > 0 ? "Partial" : "Outstanding";
  const saleId = Number(db.prepare(`INSERT INTO sale_issues (customer_id, reference_no, issue_date, transaction_type, total_amount, paid_amount, remaining_amount,
      payment_status, ledger_type, notes) VALUES (?, ?, ?, 'Sale', ?, ?, ?, ?, ?, ?)`).run(s.customer, ref, s.date, total, paid, remaining, status, s.type, s.notes || "").lastInsertRowid);
  for (const i of s.items) {
    const prod = db.prepare("SELECT product_name FROM products WHERE id = ?").get(i.product);
    db.prepare("INSERT INTO sale_issue_items (sale_issue_id, product_id, product_name, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)")
      .run(saleId, i.product, prod.product_name, i.qty, i.price, round(i.qty * i.price));
    db.prepare("UPDATE products SET quantity = quantity - ?, status = CASE WHEN quantity - ? <= 0 THEN 'Sold' ELSE status END WHERE id = ?").run(i.qty, i.qty, i.product);
  }
  addLedger(s.customer, "Sale", saleId, `Sale ${ref}`, total, 0, s.date);
  if (paid > 0) payOnSale(saleId, ref, s.customer, paid, s.date, s.method || "Cash", `Payment for ${ref}`, false);
  return { saleId, ref, total };
}

function payOnSale(saleId, ref, customer, amount, date, method, note, updateSale = true) {
  const paymentId = Number(db.prepare("INSERT INTO payments (sale_issue_id, payment_date, amount, payment_method, note) VALUES (?, ?, ?, ?, ?)")
    .run(saleId, date, amount, method, note).lastInsertRowid);
  addLedger(customer, "Payment", paymentId, `Payment for ${ref} - ${method}`, 0, amount, date);
  if (updateSale) {
    const sale = db.prepare("SELECT total_amount, paid_amount FROM sale_issues WHERE id = ?").get(saleId);
    const paid = round(sale.paid_amount + amount);
    const remaining = round(sale.total_amount - paid);
    db.prepare("UPDATE sale_issues SET paid_amount = ?, remaining_amount = ?, payment_status = ? WHERE id = ?")
      .run(paid, remaining, remaining <= 0 ? "Paid" : "Partial", saleId);
  }
}

function addReturn(r) {
  const sale = db.prepare("SELECT * FROM sale_issues WHERE id = ?").get(r.saleId);
  const ref = nextRef("RET", r.date);
  const amount = round(r.items.reduce((sum, i) => sum + i.qty * i.price, 0));
  const returnId = Number(db.prepare("INSERT INTO returns (customer_id, sale_issue_id, reference_no, return_date, reason, total_return_amount, status) VALUES (?, ?, ?, ?, ?, ?, 'Completed')")
    .run(sale.customer_id, r.saleId, ref, r.date, r.reason, amount).lastInsertRowid);
  for (const i of r.items) {
    const prod = db.prepare("SELECT product_name FROM products WHERE id = ?").get(i.product);
    db.prepare("INSERT INTO return_items (return_id, product_id, product_name, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)")
      .run(returnId, i.product, prod.product_name, i.qty, i.price, round(i.qty * i.price));
    db.prepare("UPDATE products SET quantity = quantity + ?, status = CASE WHEN status = 'Sold' THEN 'In Stock' ELSE status END WHERE id = ?").run(i.qty, i.product);
  }
  addLedger(sale.customer_id, "Return", returnId, `Return ${ref}`, 0, amount, r.date);
  const newTotal = round(Math.max(0, sale.total_amount - amount));
  const newPaid = Math.min(sale.paid_amount, newTotal);
  const newRemaining = round(newTotal - newPaid);
  db.prepare("UPDATE sale_issues SET total_amount = ?, paid_amount = ?, remaining_amount = ?, payment_status = ? WHERE id = ?")
    .run(newTotal, newPaid, newRemaining, newRemaining <= 0 ? (newPaid > 0 ? "Paid" : "Outstanding") : "Partial", r.saleId);
}

function addDamage(d) {
  const n = db.prepare("SELECT COUNT(*) c FROM damage_records").get().c + 1;
  const ref = `DMG-${d.date.replace(/-/g, "")}-${String(n).padStart(4, "0")}`;
  db.prepare(`INSERT INTO damage_records (product_id, quantity, damage_type, reason, reference_no, recorded_by, recorded_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(d.product, d.qty, d.type, d.reason, ref, "Admin", d.date, d.notes || "");
  db.prepare("UPDATE products SET quantity = quantity - ?, status = CASE WHEN quantity - ? <= 0 THEN 'Damaged' ELSE status END WHERE id = ?").run(d.qty, d.qty, d.product);
}

function audit(action, entity, entityId, detail) {
  db.prepare("INSERT INTO audit_log (action, entity, entity_id, detail) VALUES (?, ?, ?, ?)").run(action, entity, entityId, detail);
}

// ---- the data -----------------------------------------------------------------------------
db.transaction(() => {
  // Cash/bank to start from, so supplier payments and expenses never push the cash book negative
  const setSetting = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  setSetting.run("opening_cash", "20000");
  setSetting.run("opening_bank", "10000");

  addSupplier({ name: "TechSource Wholesale", phone: "03001234567", phone2: "03211234567", address: "Hall Road, Lahore", notes: "Main laptop supplier" }, 1500);
  addSupplier({ name: "Karachi Laptop Hub", phone: "03331112233", address: "Saddar, Karachi" });
  addSupplier({ name: "PowerPlus Accessories", phone: "03452223344", address: "Gulf Market, Lahore", notes: "Chargers, cables and adapters" });
  addSupplier({ name: "Old Import Traders", phone: "03009998877", address: "Rawalpindi", status: "Inactive", notes: "No longer dealing" });

  const P = {
    latitude: addProduct({ name: "Dell Latitude 5420", category: "Laptop", model: "Latitude 5420", serial: "DL5420-0001", supplier: "TechSource Wholesale", buy: 280, sell: 340, qty: 10, date: daysAgo(70), warranty: "3 Months", location: "Shelf A1", paidNow: 1500, notes: "Core i5 11th Gen, 8GB RAM, 256GB SSD" }),
    elitebook: addProduct({ name: "HP EliteBook 840 G7", category: "Laptop", model: "EliteBook 840 G7", serial: "HP840G7-0001", supplier: "TechSource Wholesale", buy: 310, sell: 375, qty: 8, date: daysAgo(65), warranty: "3 Months", location: "Shelf A2", condition: "Good", notes: "Core i7 10th Gen, 16GB RAM, 512GB SSD" }),
    thinkpad: addProduct({ name: "Lenovo ThinkPad T14", category: "Laptop", model: "ThinkPad T14 Gen 1", serial: "LT14G1-0001", supplier: "Karachi Laptop Hub", buy: 295, sell: 360, qty: 6, date: daysAgo(55), warranty: "1 Month", location: "Shelf A3", condition: "Good", paidNow: 600, paySource: "Bank" }),
    macbook: addProduct({ name: "Apple MacBook Air M1", category: "Laptop", model: "MacBook Air M1 2020", serial: "MBA-M1-0001", supplier: "Karachi Laptop Hub", buy: 520, sell: 620, qty: 4, date: daysAgo(50), warranty: "6 Months", location: "Locker 1", notes: "8GB RAM, 256GB SSD" }),
    probook: addProduct({ name: "HP ProBook 450 G6", category: "Laptop", model: "ProBook 450 G6", serial: "HP450G6-0001", supplier: "TechSource Wholesale", buy: 190, sell: 240, qty: 5, date: daysAgo(45), location: "Shelf B1", condition: "Fair", notes: "Light scratches on lid" }),
    dellCharger: addProduct({ name: "Dell 65W USB-C Charger", category: "Charger", model: "LA65NM190", supplier: "PowerPlus Accessories", buy: 9, sell: 15, qty: 50, date: daysAgo(40), warranty: "1 Month", location: "Drawer C1", paidNow: 450, paySource: "Cash" }),
    hpCharger: addProduct({ name: "HP 90W Smart Pin Charger", category: "Charger", model: "PA-1900-32HE", supplier: "PowerPlus Accessories", buy: 8, sell: 14, qty: 40, date: daysAgo(40), location: "Drawer C2" }),
    hub: addProduct({ name: "USB-C Hub 7-in-1", category: "Adapter", model: "HUB-7C", supplier: "PowerPlus Accessories", buy: 11, sell: 19, qty: 30, date: daysAgo(35), warranty: "1 Month", location: "Drawer D1" }),
    hdmi: addProduct({ name: "USB-C to HDMI Adapter", category: "Adapter", model: "UCH-4K", supplier: "PowerPlus Accessories", buy: 4, sell: 8, qty: 60, date: daysAgo(35), location: "Drawer D2" }),
    ram: addProduct({ name: "Kingston 8GB DDR4 Laptop RAM", category: "Accessory", model: "KVR26S19S8/8", supplier: "TechSource Wholesale", buy: 17, sell: 26, qty: 25, date: daysAgo(30), warranty: "6 Months", location: "Drawer E1" }),
  };

  // Customers
  const cust = {};
  for (const c of [
    { key: "ali", name: "Ali Computers", phone: "03001112222", address: "Hafeez Center, Lahore", email: "ali@example.com", notes: "Regular wholesale buyer" },
    { key: "bilal", name: "Bilal Traders", phone: "03213334444", address: "Saddar, Karachi", notes: "Pays in installments" },
    { key: "city", name: "City IT Solutions", phone: "03335556666", address: "Blue Area, Islamabad", email: "orders@cityit.example.com" },
    { key: "hassan", name: "Hassan Electronics", phone: "03457778888", address: "Raja Bazaar, Rawalpindi" },
    { key: "usman", name: "Usman Walk-in", phone: "03119990000", address: "", status: "Inactive", notes: "Old shop contact" },
  ]) {
    cust[c.key] = Number(db.prepare("INSERT INTO customers (customer_name, phone, address, email, status, notes) VALUES (?, ?, ?, ?, ?, ?)")
      .run(c.name, c.phone, c.address, c.email || "", c.status || "Active", c.notes || "").lastInsertRowid);
  }

  // Balances carried over from before the software was used
  for (const o of [
    { customer: cust.usman, amount: 1200, type: "Debit", notes: "Old balance from paper register", date: daysAgo(60) },
    { customer: cust.hassan, amount: 150, type: "Credit", notes: "Advance given earlier", date: daysAgo(60) },
  ]) {
    const id = Number(db.prepare("INSERT INTO old_balances (customer_id, amount, balance_type, notes) VALUES (?, ?, ?, ?)").run(o.customer, o.amount, o.type, o.notes).lastInsertRowid);
    addLedger(o.customer, o.type === "Debit" ? "OldBalanceDebit" : "OldBalanceCredit", id, o.notes, o.type === "Debit" ? o.amount : 0, o.type === "Credit" ? o.amount : 0, o.date);
  }

  // Sales, oldest first so each ledger's running balance stays in order
  const s1 = addSale({ customer: cust.ali, date: daysAgo(40), type: "Cash", method: "Cash", items: [{ product: P.latitude, qty: 2, price: 340 }, { product: P.dellCharger, qty: 5, price: 15 }], notes: "Paid on pickup" });
  const s2 = addSale({ customer: cust.bilal, date: daysAgo(30), type: "Loan", paid: 500, method: "Cash", items: [{ product: P.elitebook, qty: 3, price: 375 }], notes: "Balance in two weeks" });
  const s3 = addSale({ customer: cust.city, date: daysAgo(25), type: "Loan", paid: 0, items: [{ product: P.probook, qty: 2, price: 240 }, { product: P.hub, qty: 10, price: 19 }, { product: P.hdmi, qty: 10, price: 8 }], notes: "Payment promised next month" });
  const s4 = addSale({ customer: cust.ali, date: daysAgo(18), type: "Loan", paid: 400, method: "Bank", items: [{ product: P.thinkpad, qty: 2, price: 360 }, { product: P.ram, qty: 4, price: 26 }] });
  const s5 = addSale({ customer: cust.hassan, date: daysAgo(10), type: "Cash", method: "Bank", items: [{ product: P.macbook, qty: 1, price: 620 }, { product: P.hpCharger, qty: 6, price: 14 }] });
  const s6 = addSale({ customer: cust.bilal, date: daysAgo(6), type: "Cash", method: "Cash", items: [{ product: P.latitude, qty: 1, price: 340 }, { product: P.ram, qty: 5, price: 26 }] });

  // Later payments against open sales
  payOnSale(s4.saleId, s4.ref, cust.ali, 200, daysAgo(8), "Cash", "Second installment");
  payOnSale(s2.saleId, s2.ref, cust.bilal, 300, daysAgo(7), "Cash", "Installment");
  addLedger(cust.city, "Payment", null, "Direct payment - Bank", 0, 300, daysAgo(3), "Bank");
  addLedger(cust.bilal, "Payment", null, "Direct payment - Cash", 0, 200, daysAgo(2), "Cash");

  // A return against the partly paid EliteBook sale
  addReturn({ saleId: s2.saleId, date: daysAgo(12), reason: "Keyboard fault on one unit", items: [{ product: P.elitebook, qty: 1, price: 375 }] });

  // Damaged / repaired stock
  addDamage({ product: P.hdmi, qty: 3, type: "Damaged", reason: "Broken connectors on arrival", date: daysAgo(20) });
  addDamage({ product: P.hpCharger, qty: 2, type: "Disposed", reason: "Burnt cable", date: daysAgo(15), notes: "Thrown away" });
  addDamage({ product: P.probook, qty: 1, type: "Repaired", reason: "Screen replaced", date: daysAgo(9), notes: "Cost covered by shop" });

  // Supplier payments
  const payInsert = db.prepare("INSERT INTO supplier_ledger (supplier_id, entry_date, entry_type, paid, payment_source, reference_no, note) VALUES (?, ?, 'Payment', ?, ?, ?, ?)");
  payInsert.run(supplierIds["TechSource Wholesale"], daysAgo(30), 1000, "Bank", "TS-PAY-01", "Part payment");
  payInsert.run(supplierIds["Karachi Laptop Hub"], daysAgo(22), 800, "Cash", "KLH-PAY-01", "Part payment");
  payInsert.run(supplierIds["PowerPlus Accessories"], daysAgo(14), 300, "Cash", "", "Cash on delivery");

  // Expenses
  const exp = db.prepare("INSERT INTO expenses (expense_date, category, amount, payment_source, note) VALUES (?, ?, ?, ?, ?)");
  exp.run(daysAgo(30), "Rent", 600, "Bank", "Shop rent");
  exp.run(daysAgo(26), "Electricity", 85, "Cash", "Monthly bill");
  exp.run(daysAgo(20), "Transport", 40, "Cash", "Delivery of laptops to Karachi");
  exp.run(daysAgo(10), "Salary", 400, "Bank", "Helper salary");
  exp.run(daysAgo(4), "Tea & Refreshments", 12, "Cash", "");

  // Inspection notes
  const note = db.prepare("INSERT INTO inspection_notes (product_id, note) VALUES (?, ?)");
  note.run(P.latitude, "Tested all ports, battery health 87%.");
  note.run(P.probook, "Lid scratches, screen replaced once. Works fine.");
  note.run(P.macbook, "Battery cycle count 112. Original charger included.");
  note.run(P.elitebook, "Keyboard backlight tested OK.");

  // Back-dated rows (the return) were added after later ones, so put every running balance back in date order
  for (const { id } of db.prepare("SELECT id FROM customers").all()) {
    let balance = 0;
    for (const e of db.prepare("SELECT id, debit, credit FROM customer_ledger WHERE customer_id = ? ORDER BY entry_date ASC, id ASC").all(id)) {
      balance = round(balance + e.debit - e.credit);
      db.prepare("UPDATE customer_ledger SET running_balance = ? WHERE id = ?").run(balance, e.id);
    }
  }

  audit("create", "product", P.latitude, "Sample data: products added");
  audit("create", "customer", cust.ali, "Sample data: customers added");
  audit("create", "sale", s1.saleId, `Sample data: sale ${s1.ref}`);
  audit("create", "sale", s6.saleId, `Sample data: sale ${s6.ref}`);
})();

for (const t of ["products", "suppliers", "supplier_ledger", "customers", "old_balances", "sale_issues", "sale_issue_items", "payments", "returns", "return_items",
  "damage_records", "customer_ledger", "expenses", "inspection_notes", "audit_log"]) {
  console.log(t.padEnd(18), db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c);
}
closeDatabase();
