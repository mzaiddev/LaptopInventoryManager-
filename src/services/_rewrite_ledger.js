const fs = require('fs');
const path = require('path');
const target = path.join(__dirname, 'ledgerService.js');

const content = `const { getDatabase } = require("../database/dbInit");

class LedgerService {

  generateReference(type) {
    const db = getDatabase();
    const prefix = type === "sale" ? "SALE" : "RET";
    const date = new Date();
    const dateStr = date.getFullYear() + String(date.getMonth()+1).padStart(2,"0") + String(date.getDate()).padStart(2,"0");
    const table = type === "sale" ? "sale_issues" : "returns";
    const count = db.prepare("SELECT COUNT(*) as cnt FROM " + table + " WHERE reference_no LIKE ?").get(prefix + "-" + dateStr + "-%");
    const num = String((count?.cnt || 0) + 1).padStart(4,"0");
    return prefix + "-" + dateStr + "-" + num;
  }

  getAllCustomers(filters) {
    if (!filters) filters = {};
    const db = getDatabase();
    let q = "SELECT * FROM customers WHERE 1=1";
    const p = [];
    if (filters.search) { q += " AND (customer_name LIKE ? OR phone LIKE ? OR address LIKE ? OR email LIKE ?)"; const s = "%" + filters.search + "%"; p.push(s,s,s,s); }
    if (filters.status) { q += " AND status = ?"; p.push(filters.status); }
    q += " ORDER BY customer_name ASC";
    if (filters.limit) {
      const off = filters.page ? (filters.page-1)*filters.limit : 0;
      const tr = db.prepare(q.replace("SELECT *","SELECT COUNT(*) as total")).get(...p);
      q += " LIMIT ? OFFSET ?"; p.push(filters.limit, off);
      return { customers: db.prepare(q).all(...p), total: tr?.total||0, page: filters.page||1, limit: filters.limit };
    }
    return db.prepare(q).all(...p);
  }

  getCustomerById(id) { const db = getDatabase(); return db.prepare("SELECT * FROM customers WHERE id = ?").get(id); }

  searchCustomers(query) {
    const db = getDatabase(); const s = "%" + query + "%";
    return db.prepare("SELECT id, customer_name, phone, address FROM customers WHERE (customer_name LIKE ? OR phone LIKE ? OR address LIKE ?) AND status='Active' ORDER BY customer_name ASC LIMIT 20").all(s,s,s);
  }

  addCustomer(data) {
    const db = getDatabase();
    const r = db.prepare("INSERT INTO customers (customer_name,phone,address,email,status,notes) VALUES (?,?,?,?,?,?)").run(data.customer_name,data.phone||"",data.address||"",data.email||"",data.status||"Active",data.notes||"");
    return { id: r.lastInsertRowid };
  }

  updateCustomer(id, data) {
    const db = getDatabase();
    db.prepare("UPDATE customers SET customer_name=?,phone=?,address=?,email=?,status=?,notes=?,updated_at=datetime('now','localtime') WHERE id=?").run(data.customer_name,data.phone||"",data.address||"",data.email||"",data.status||"Active",data.notes||"",id);
    return { success: true };
  }

  deleteCustomer(id) {
    const db = getDatabase();
    if (db.prepare("SELECT COUNT(*) as cnt FROM sale_issues WHERE customer_id=?").get(id)?.cnt > 0) throw new Error("Cannot delete customer with existing transactions. Mark as inactive instead.");
    db.prepare("DELETE FROM customers WHERE id=?").run(id);
    return { success: true };
  }

  getCustomerBalance(id) {
    const db = getDatabase();
    const s = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t, COALESCE(SUM(paid_amount),0) as p FROM sale_issues WHERE customer_id=?").get(id);
    return { opening_balance:0, total_sales:s.t, total_paid:s.p, outstanding_balance:s.t-s.p };
  }

  createSale(data) {
    const db = getDatabase();
    const errors = [];
    for (const item of data.items) {
      const prod = db.prepare("SELECT quantity, product_name FROM products WHERE id=?").get(item.product_id);
      if (!prod) { errors.push("Product ID " + item.product_id + " not found"); continue; }
      if (prod.quantity < item.quantity) errors.push("Insufficient stock for " + prod.product_name + ". Available: " + prod.quantity + ", Requested: " + item.quantity);
    }
    if (errors.length) throw new Error(errors.join("\\n"));

    const ref = this.generateReference("sale");
    const total = data.items.reduce((s,i)=> s + i.quantity*i.unit_price, 0);
    const lt = data.ledger_type || "Cash";
    const paid = lt === "Cash" ? total : Math.min(data.paid_amount||0, total);
    const rem = total - paid;
    const ps = rem <= 0 ? "Paid" : paid > 0 ? "Partial" : "Outstanding";

    return db.transaction(() => {
      const sr = db.prepare("INSERT INTO sale_issues (customer_id,reference_no,issue_date,transaction_type,total_amount,paid_amount,remaining_amount,payment_status,ledger_type,notes) VALUES (?,?,?,?,?,?,?,?,?,?)").run(data.customer_id,ref,data.issue_date,data.transaction_type||"Sale",total,paid,rem,ps,lt,data.notes||"");
      const sid = sr.lastInsertRowid;

      const ist = db.prepare("INSERT INTO sale_issue_items (sale_issue_id,product_id,product_name,quantity,unit_price,subtotal) VALUES (?,?,?,?,?,?)");
      const sst = db.prepare("UPDATE products SET quantity=quantity-?, status=CASE WHEN quantity-?<=0 THEN 'Sold' ELSE status END, updated_at=datetime('now','localtime') WHERE id=?");
      for (const item of data.items) {
        const prod = db.prepare("SELECT product_name FROM products WHERE id=?").get(item.product_id);
        ist.run(sid, item.product_id, prod?.product_name||"Unknown", item.quantity, item.unit_price, item.quantity*item.unit_price);
        sst.run(item.quantity, item.quantity, item.product_id);
      }

      if (paid > 0) {
        db.prepare("INSERT INTO payments (sale_issue_id,payment_date,amount,payment_method,note) VALUES (?,?,?,?,?)").run(sid, data.issue_date, paid, data.payment_method||"Cash", "Payment for " + ref);
      }
      return { saleId: sid, referenceNo: ref };
    })();
  }

  getAllSales(filters) {
    if (!filters) filters = {};
    const db = getDatabase();
    let q = "SELECT si.id as sale_id, si.reference_no as sale_reference, si.issue_date as transaction_date, si.transaction_type, si.total_amount, si.paid_amount, si.remaining_amount, si.payment_status as status, si.ledger_type, si.notes as sale_notes, c.id as customer_id, c.customer_name, c.phone as customer_phone, (SELECT COUNT(*) FROM sale_issue_items WHERE sale_issue_id=si.id) as items_count, (SELECT GROUP_CONCAT(product_name||' x'||quantity, ', ') FROM sale_issue_items WHERE sale_issue_id=si.id) as items_summary FROM sale_issues si LEFT JOIN customers c ON si.customer_id=c.id WHERE 1=1";
    const p = [];
    if (filters.search) { q += " AND (c.customer_name LIKE ? OR si.reference_no LIKE ?)"; const s = "%" + filters.search + "%"; p.push(s,s); }
    if (filters.customer_id) { q += " AND si.customer_id=?"; p.push(filters.customer_id); }
    if (filters.status) { q += " AND si.payment_status=?"; p.push(filters.status); }
    if (filters.ledger_type) { q += " AND si.ledger_type=?"; p.push(filters.ledger_type); }
    if (filters.date_from) { q += " AND si.issue_date>=?"; p.push(filters.date_from); }
    if (filters.date_to) { q += " AND si.issue_date<=?"; p.push(filters.date_to); }
    q += " ORDER BY " + (filters.sortBy||"si.created_at") + " " + (filters.sortOrder==="asc"?"ASC":"DESC");
    const limit = filters.limit||50;
    const offset = filters.page ? (filters.page-1)*limit : 0;
    const fi = q.indexOf('FROM sale_issues');
    const tr = db.prepare('SELECT COUNT(*) as total '+ (fi>=0?q.substring(fi):'')).get(...p);
    q += " LIMIT ? OFFSET ?"; p.push(limit, offset);
    const sales = db.prepare(q).all(...p);
    for (const s of sales) {
      const rp = db.prepare("SELECT * FROM payments WHERE sale_issue_id=? ORDER BY payment_date ASC, id ASC").all(s.sale_id);
      let r = 0;
      s.payments = rp.map(pm => { r += pm.amount; return {...pm, running_paid:r, remaining_after:Math.max(0,s.total_amount-r)}; });
    }
    return { sales, total: tr?.total||0, page: filters.page||1, limit };
  }

  getSaleById(id) {
    const db = getDatabase();
    const s = db.prepare("SELECT si.*, c.customer_name, c.phone, c.address FROM sale_issues si LEFT JOIN customers c ON si.customer_id=c.id WHERE si.id=?").get(id);
    if (!s) return null;
    s.items = db.prepare("SELECT sii.*, p.category, p.serial_number FROM sale_issue_items sii LEFT JOIN products p ON sii.product_id=p.id WHERE sii.sale_issue_id=?").all(id);
    s.payments = db.prepare("SELECT * FROM payments WHERE sale_issue_id=? ORDER BY payment_date DESC").all(id);
    s.returns = db.prepare("SELECT id, return_date, total_return_amount, reason, status FROM returns WHERE sale_issue_id=? ORDER BY return_date DESC").all(id);
    return s;
  }

  addPayment(data) {
    const db = getDatabase();
    const sale = db.prepare("SELECT * FROM sale_issues WHERE id=?").get(data.sale_issue_id);
    if (!sale) throw new Error("Sale not found");
    const np = sale.paid_amount + data.amount;
    const nr = sale.total_amount - np;
    const ns = nr <= 0 ? "Paid" : "Partial";
    db.prepare("INSERT INTO payments (sale_issue_id,payment_date,amount,payment_method,note) VALUES (?,?,?,?,?)").run(data.sale_issue_id,data.payment_date,data.amount,data.payment_method||"Cash",data.note||"");
    db.prepare("UPDATE sale_issues SET paid_amount=?, remaining_amount=?, payment_status=?, updated_at=datetime('now','localtime') WHERE id=?").run(np, nr, ns, data.sale_issue_id);
    return { success: true };
  }

  createReturn(data) {
    const db = getDatabase();
    const sale = db.prepare("SELECT * FROM sale_issues WHERE id=?").get(data.sale_issue_id);
    if (!sale) throw new Error("Sale/Issue not found");
    const errors = [];
    for (const item of data.items) {
      const orig = db.prepare("SELECT * FROM sale_issue_items WHERE sale_issue_id=? AND product_id=?").get(data.sale_issue_id, item.product_id);
      if (!orig) { errors.push("Product ID " + item.product_id + " was not in the original sale"); continue; }
      const ret = db.prepare("SELECT COALESCE(SUM(quantity),0) as q FROM return_items ri JOIN returns r ON ri.return_id=r.id WHERE r.sale_issue_id=? AND ri.product_id=? AND r.status='Completed'").get(data.sale_issue_id, item.product_id);
      if (item.quantity > orig.quantity - (ret?.q||0)) errors.push("Cannot return " + item.quantity + " of " + orig.product_name + ". Maximum returnable: " + (orig.quantity-(ret?.q||0)));
    }
    if (errors.length) throw new Error(errors.join("\\n"));

    const ref = this.generateReference("return");
    const totalRet = data.items.reduce((s,i)=> s+i.quantity*i.unit_price, 0);
    return db.transaction(() => {
      const rr = db.prepare("INSERT INTO returns (customer_id,sale_issue_id,reference_no,return_date,reason,total_return_amount,status) VALUES (?,?,?,?,?,?,'Completed')").run(data.customer_id,data.sale_issue_id,ref,data.return_date,data.reason||"",totalRet);
      const rid = rr.lastInsertRowid;
      const ist = db.prepare("INSERT INTO return_items (return_id,product_id,product_name,quantity,unit_price,subtotal) VALUES (?,?,?,?,?,?)");
      const sst = db.prepare("UPDATE products SET quantity=quantity+?, status=CASE WHEN status='Sold' THEN 'In Stock' ELSE status END, updated_at=datetime('now','localtime') WHERE id=?");
      for (const item of data.items) {
        const p = db.prepare("SELECT product_name FROM products WHERE id=?").get(item.product_id);
        ist.run(rid, item.product_id, p?.product_name||"Unknown", item.quantity, item.unit_price, item.quantity*item.unit_price);
        sst.run(item.quantity, item.product_id);
      }
      if (totalRet > 0 && sale.remaining_amount > 0) {
        const nt = Math.max(0, sale.total_amount - totalRet);
        const np = Math.min(sale.paid_amount, nt);
        db.prepare("UPDATE sale_issues SET total_amount=?, paid_amount=?, remaining_amount=?, payment_status=?, updated_at=datetime('now','localtime') WHERE id=?").run(nt, np, nt-np, nt-np<=0?(np>0?"Paid":"Outstanding"):"Partial", data.sale_issue_id);
      }
      return { returnId: rid, referenceNo: ref };
    })();
  }

  getAllReturns(filters) {
    if (!filters) filters = {};
    const db = getDatabase();
    let q = "SELECT r.*, c.customer_name, si.reference_no as sale_reference FROM returns r LEFT JOIN customers c ON r.customer_id=c.id LEFT JOIN sale_issues si ON r.sale_issue_id=si.id WHERE 1=1";
    const p = [];
    if (filters.search) { q += " AND (c.customer_name LIKE ? OR si.reference_no LIKE ? OR r.reason LIKE ?)"; const s = "%"+filters.search+"%"; p.push(s,s,s); }
    if (filters.customer_id) { q += " AND r.customer_id=?"; p.push(filters.customer_id); }
    if (filters.status) { q += " AND r.status=?"; p.push(filters.status); }
    if (filters.date_from) { q += " AND r.return_date>=?"; p.push(filters.date_from); }
    if (filters.date_to) { q += " AND r.return_date<=?"; p.push(filters.date_to); }
    q += " ORDER BY r.created_at DESC";
    const limit = filters.limit||50;
    const offset = filters.page?(filters.page-1)*limit:0;
    const tr = db.prepare(q.replace("SELECT r.*, c.customer_name, si.reference_no as sale_reference","SELECT COUNT(*) as total")).get(...p);
    q += " LIMIT ? OFFSET ?"; p.push(limit, offset);
    const returns = db.prepare(q).all(...p);
    for (const r of returns) r.items = db.prepare("SELECT * FROM return_items WHERE return_id=?").all(r.id);
    return { returns, total: tr?.total||0, page: filters.page||1, limit };
  }

  recordDamage(data) {
    const db = getDatabase();
    const prod = db.prepare("SELECT * FROM products WHERE id=?").get(data.product_id);
    if (!prod) throw new Error("Product not found");
    if (data.quantity > prod.quantity) throw new Error("Cannot record " + data.quantity + " damaged. Available quantity: " + prod.quantity);
    const d = new Date();
    const ds = d.getFullYear()+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0");
    const cnt = db.prepare("SELECT COUNT(*) as c FROM damage_records").get();
    const ref = "DMG-"+ds+"-"+String((cnt?.c||0)+1).padStart(4,"0");
    return db.transaction(() => {
      const ins = db.prepare("INSERT INTO damage_records (product_id,quantity,damage_type,reason,reference_no,recorded_by,recorded_date,notes) VALUES (?,?,?,?,?,?,?,?)").run(data.product_id,data.quantity,data.damage_type||'Damaged',data.reason||'',ref,data.recorded_by||'',data.recorded_date||new Date().toISOString().split('T')[0],data.notes||'');
      const nq = prod.quantity - data.quantity;
      db.prepare("UPDATE products SET quantity=?, status=?, updated_at=datetime('now','localtime') WHERE id=?").run(nq, nq<=0?'Damaged':prod.status, data.product_id);
      return { id: ins.lastInsertRowid, referenceNo: ref };
    })();
  }

  getAllDamages(filters) {
    if (!filters) filters = {};
    const db = getDatabase();
    let q = "SELECT dr.*, p.product_name, p.category, p.purchase_price, CASE WHEN dr.damage_type='Corrected' THEN 'Restored' ELSE dr.damage_type END as display_type FROM damage_records dr LEFT JOIN products p ON dr.product_id=p.id WHERE 1=1";
    const p = [];
    if (filters.product_id) { q += " AND dr.product_id=?"; p.push(filters.product_id); }
    if (filters.damage_type) { q += " AND dr.damage_type=?"; p.push(filters.damage_type); }
    if (filters.date_from) { q += " AND dr.recorded_date>=?"; p.push(filters.date_from); }
    if (filters.date_to) { q += " AND dr.recorded_date<=?"; p.push(filters.date_to); }
    q += " ORDER BY dr.created_at DESC";
    const limit = filters.limit||50;
    const offset = filters.page?(filters.page-1)*limit:0;
    const wm = q.match(/WHERE[\\s\\S]*/);
    let tr;
    try { tr = db.prepare("SELECT COUNT(*) as total FROM damage_records dr LEFT JOIN products p ON dr.product_id=p.id "+(wm?.[0]||'')).get(...p); } catch(e) { tr={total:0}; }
    q += " LIMIT ? OFFSET ?"; p.push(limit, offset);
    const damages = db.prepare(q).all(...p);
    for (const d of damages) { const pr = db.prepare("SELECT quantity,status FROM products WHERE id=?").get(d.product_id); d.current_qty = pr?pr.quantity:0; d.product_status = pr?pr.status:'Deleted'; }
    return { damages, total: tr?.total||0, page: filters.page||1, limit };
  }

  correctDamage(id, cd) {
    const db = getDatabase();
    const ex = db.prepare("SELECT * FROM damage_records WHERE id=?").get(id);
    if (!ex) throw new Error("Damage record not found");
    return db.transaction(() => {
      const nq = cd.quantity!==undefined?cd.quantity:ex.quantity;
      const rq = ex.quantity - nq;
      db.prepare("UPDATE damage_records SET damage_type='Corrected', reason=CASE WHEN ?!='' THEN ? ELSE reason END, notes=CASE WHEN ?!='' THEN ? ELSE notes END, updated_at=datetime('now','localtime') WHERE id=?").run(cd.reason||'',cd.reason||'',cd.notes||'',cd.notes||'',id);
      if (rq>0) {
        const pr = db.prepare("SELECT * FROM products WHERE id=?").get(ex.product_id);
        if (pr) { const n = pr.quantity+rq; db.prepare("UPDATE products SET quantity=?, status=?, updated_at=datetime('now','localtime') WHERE id=?").run(n, n>0?'In Stock':pr.status, ex.product_id); }
      }
      return { success: true };
    })();
  }

  getCustomerFullProfile(cid) {
    const db = getDatabase();
    const cust = db.prepare("SELECT * FROM customers WHERE id=?").get(cid);
    if (!cust) return null;

    const sales = db.prepare("SELECT si.*, (SELECT COUNT(*) FROM sale_issue_items WHERE sale_issue_id=si.id) as items_count FROM sale_issues si WHERE si.customer_id=? ORDER BY si.issue_date DESC").all(cid);
    for (const s of sales) {
      const rawP = db.prepare("SELECT * FROM payments WHERE sale_issue_id=? ORDER BY payment_date ASC, id ASC").all(s.id);
      let r = 0;
      s.payments = rawP.map(pm => { r+=pm.amount; return {...pm, running_paid:r, remaining_after:Math.max(0,s.total_amount-r)}; });
      s.items = db.prepare("SELECT sii.*, p.category, p.serial_number FROM sale_issue_items sii LEFT JOIN products p ON sii.product_id=p.id WHERE sii.sale_issue_id=?").all(s.id);
    }

    const returns = db.prepare("SELECT r.*, si.reference_no as sale_reference FROM returns r LEFT JOIN sale_issues si ON r.sale_issue_id=si.id WHERE r.customer_id=? ORDER BY r.return_date DESC").all(cid);
    for (const r of returns) r.items = db.prepare("SELECT * FROM return_items WHERE return_id=?").all(r.id);

    const damages = db.prepare("SELECT dr.*, p.product_name, p.category FROM damage_records dr LEFT JOIN products p ON dr.product_id=p.id WHERE dr.product_id IN (SELECT DISTINCT sii.product_id FROM sale_issue_items sii JOIN sale_issues si ON sii.sale_issue_id=si.id WHERE si.customer_id=?) ORDER BY dr.created_at DESC").all(cid);

    const bal = db.prepare("SELECT COALESCE(SUM(total_amount),0) as ts, COALESCE(SUM(paid_amount),0) as tp, COALESCE(SUM(remaining_amount),0) as to_ FROM sale_issues WHERE customer_id=?").get(cid);

    return { customer: cust, sales, returns, damages, balance: { opening_balance:0, total_sales:bal.ts, total_paid:bal.tp, total_outstanding:bal.to_ } };
  }

  getCustomerStatement(cid) {
    const db = getDatabase();
    const profile = this.getCustomerFullProfile(cid);
    if (!profile) return null;
    const settings = {};
    for (const row of db.prepare("SELECT * FROM settings").all()) settings[row.key] = row.value;
    return { shopName: settings.shop_name||'Laptop Inventory Manager', shopAddress: settings.shop_address||'', shopPhone: settings.phone_number||'', shopEmail: settings.email||'', currency: settings.currency||'USD', customer: profile.customer, sales: profile.sales, returns: profile.returns, damages: profile.damages, balance: profile.balance, generatedAt: new Date().toISOString() };
  }

  getSalesSummary() {
    const db = getDatabase();
    return {
      total_outstanding: db.prepare("SELECT COALESCE(SUM(remaining_amount),0) FROM sale_issues").get()['COALESCE(SUM(remaining_amount),0)'],
      total_sales: db.prepare("SELECT COALESCE(SUM(total_amount),0) FROM sale_issues").get()['COALESCE(SUM(total_amount),0)'],
      total_collected: db.prepare("SELECT COALESCE(SUM(paid_amount),0) FROM sale_issues").get()['COALESCE(SUM(paid_amount),0)'],
      active_customers: db.prepare("SELECT COUNT(*) FROM customers WHERE status='Active'").get()['COUNT(*)'],
      today_sales: db.prepare("SELECT COALESCE(SUM(total_amount),0) FROM sale_issues WHERE date(issue_date)=date('now','localtime')").get()['COALESCE(SUM(total_amount),0)'],
      today_payments: db.prepare("SELECT COALESCE(SUM(amount),0) FROM payments WHERE date(payment_date)=date('now','localtime')").get()['COALESCE(SUM(amount),0)'],
      sale_counts: db.prepare("SELECT payment_status, COUNT(*) as cnt FROM sale_issues GROUP BY payment_status").all()
    };
  }

  getSalesReport(filters) {
    if (!filters) filters = {};
    const db = getDatabase();
    let q = "SELECT si.*, c.customer_name, (SELECT GROUP_CONCAT(sii.product_name||' x'||sii.quantity, ', ') FROM sale_issue_items sii WHERE sii.sale_issue_id=si.id) as items_summary FROM sale_issues si LEFT JOIN customers c ON si.customer_id=c.id WHERE 1=1";
    const p = [];
    if (filters.date_from) { q += " AND si.issue_date>=?"; p.push(filters.date_from); }
    if (filters.date_to) { q += " AND si.issue_date<=?"; p.push(filters.date_to); }
    if (filters.customer_id) { q += " AND si.customer_id=?"; p.push(filters.customer_id); }
    if (filters.payment_status) { q += " AND si.payment_status=?"; p.push(filters.payment_status); }
    q += " ORDER BY si.created_at DESC";
    return db.prepare(q).all(...p);
  }

  getOutstandingReport() {
    const db = getDatabase();
    return db.prepare("SELECT c.id as customer_id, c.customer_name, c.phone, COALESCE(SUM(si.total_amount),0) as total_sales, COALESCE(SUM(si.paid_amount),0) as total_paid, COALESCE(SUM(si.remaining_amount),0) as total_outstanding, COUNT(si.id) as invoice_count FROM customers c LEFT JOIN sale_issues si ON c.id=si.customer_id AND si.remaining_amount>0 WHERE c.status='Active' GROUP BY c.id HAVING total_outstanding>0 ORDER BY total_outstanding DESC").all();
  }
}

module.exports = new LedgerService();
`;

fs.writeFileSync(target, content, 'utf8');
console.log('Written ' + content.length + ' bytes to ' + target);
`;

