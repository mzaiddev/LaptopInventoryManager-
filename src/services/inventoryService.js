const { getDatabase } = require("../database/dbInit");

const DEFAULT_CATEGORIES = [
  "Laptop",
  "Charger",
  "Adapter",
  "Mouse",
  "Keyboard",
  "SSD",
  "HDD",
  "RAM",
  "Monitor",
  "Printer",
  "Router",
  "UPS",
  "Networking Equipment",
  "Accessories",
  "Other",
];

const normalizeCategories = (categories = []) => {
  const seen = new Set();
  const normalized = [];

  [...DEFAULT_CATEGORIES, ...categories]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim())
    .forEach((value) => {
      if (!seen.has(value)) {
        seen.add(value);
        normalized.push(value);
      }
    });

  return normalized;
};

class InventoryService {
  getAllProducts(filters = {}) {
    const db = getDatabase();
    let query = "SELECT * FROM products WHERE 1=1";
    const params = [];

    if (filters.search) {
      query +=
        " AND (product_name LIKE ? OR model LIKE ? OR category LIKE ? OR serial_number LIKE ?)";
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (filters.category) {
      query += " AND category = ?";
      params.push(filters.category);
    }

    if (filters.supplier) {
      query += " AND supplier = ?";
      params.push(filters.supplier);
    }

    if (filters.status) {
      query += " AND status = ?";
      params.push(filters.status);
    }

    if (filters.condition) {
      query += " AND condition = ?";
      params.push(filters.condition);
    }

    const sortColumn = filters.sortBy || "created_at";
    const sortOrder = filters.sortOrder === "asc" ? "ASC" : "DESC";
    const allowedSortColumns = [
      "product_name",
      "purchase_date",
      "purchase_price",
      "selling_price",
      "quantity",
      "created_at",
      "updated_at",
    ];
    const safeSortColumn = allowedSortColumns.includes(sortColumn)
      ? sortColumn
      : "created_at";
    query += ` ORDER BY ${safeSortColumn} ${sortOrder}`;

    const offset = filters.page
      ? (filters.page - 1) * (filters.limit || 50)
      : 0;
    const limit = filters.limit || 50;

    const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as total");
    const totalResult = db.prepare(countQuery).get(...params);
    const total = totalResult ? totalResult.total : 0;

    query += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const products = db.prepare(query).all(...params);

    return {
      products,
      total,
      page: filters.page || 1,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  getProductById(id) {
    const db = getDatabase();
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
    if (product) {
      product.inspection_notes = db
        .prepare(
          "SELECT * FROM inspection_notes WHERE product_id = ? ORDER BY created_at DESC",
        )
        .all(id);
    }
    return product;
  }

  addProduct(productData) {
    const db = getDatabase();
    const {
      product_name,
      category,
      model,
      serial_number,
      supplier,
      purchase_price,
      selling_price,
      quantity,
      purchase_date,
      warranty,
      storage_location,
      notes,
      status,
      condition,
    } = productData;

    const suppliers = require("./supplierService");
    return db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO products (product_name, category, model, serial_number, supplier,
        purchase_price, selling_price, quantity, purchase_date, warranty,
        storage_location, notes, status, condition)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      product_name,
      category,
      model || "",
      serial_number || "",
      supplier || "",
      purchase_price,
      selling_price,
      quantity || 1,
      purchase_date || "",
      warranty || "",
      storage_location || "",
      notes || "",
      status || "In Stock",
      condition || "Excellent",
    );

    const id = Number(result.lastInsertRowid);
    suppliers.billProduct(db, {
      product_id: id, supplier, name: product_name, price: purchase_price, qty: quantity || 1,
      date: purchase_date, paid_now: productData.paid_now, payment_source: productData.payment_source,
    });
    return { id };
    })();
  }

  importProduct(productData) {
    const serial = String(productData.serial_number || '').trim();
    if (serial) {
      const existing = getDatabase().prepare('SELECT id FROM products WHERE lower(trim(serial_number))=lower(?) LIMIT 1').get(serial);
      if (existing) throw new Error(`Serial number already exists on product #${existing.id}.`);
    }
    return this.addProduct(productData);
  }

  updateProduct(id, productData) {
    const db = getDatabase();
    const {
      product_name,
      category,
      model,
      serial_number,
      supplier,
      purchase_price,
      selling_price,
      quantity,
      purchase_date,
      warranty,
      storage_location,
      notes,
      status,
      condition,
    } = productData;

    const suppliers = require("./supplierService");
    return db.transaction(() => {
    const before = db.prepare("SELECT quantity FROM products WHERE id = ?").get(id);
    const stmt = db.prepare(`
      UPDATE products SET
        product_name = ?, category = ?, model = ?, serial_number = ?,
        supplier = ?, purchase_price = ?, selling_price = ?, quantity = ?,
        purchase_date = ?, warranty = ?, storage_location = ?, notes = ?,
        status = ?, condition = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `);

    stmt.run(
      product_name,
      category,
      model || "",
      serial_number || "",
      supplier || "",
      purchase_price,
      selling_price,
      quantity || 1,
      purchase_date || "",
      warranty || "",
      storage_location || "",
      notes || "",
      status || "In Stock",
      condition || "Excellent",
      id,
    );

    suppliers.adjustProductBill(db, id, { supplier, name: product_name, price: purchase_price, qty: quantity || 1, oldQty: before ? before.quantity : 0 });
    return { success: true };
    })();
  }

  bulkUpdateProducts(ids, change = {}) {
    const db = getDatabase();
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 2000) throw new Error('Select between 1 and 2,000 products.');
    const unique = [...new Set(ids.map(Number))];
    if (unique.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new Error('Invalid product selection.');
    const allowed = ['category','supplier','location','status','condition','price_percent','price_amount'];
    const field = String(change.field || '');
    if (!allowed.includes(field)) throw new Error('This field cannot be bulk edited.');
    const raw = String(change.value ?? '').trim();
    if (!raw) throw new Error('Enter a value for the selected field.');
    if (['category','supplier','location'].includes(field) && raw.length > 200) throw new Error('Text values must be 200 characters or fewer.');
    if (field === 'status' && !['In Stock','Reserved','Lost'].includes(raw)) throw new Error('Use an individual sale, return, or damage workflow for sold, returned, or damaged status.');
    if (field === 'condition' && !['Excellent','Good','Fair','Damaged','For Parts'].includes(raw)) throw new Error('Invalid product condition.');
    const amount = Number(raw);
    if (field.startsWith('price_') && (!Number.isFinite(amount) || Math.abs(amount) > 1000000000)) throw new Error('Enter a valid price change.');
    const marks = unique.map(() => '?').join(',');
    const products = db.prepare(`SELECT id,product_name,category,supplier,storage_location,status,condition,selling_price,purchase_price,quantity FROM products WHERE id IN (${marks})`).all(...unique);
    if (products.length !== unique.length) throw new Error('Some selected products no longer exist. Refresh the list and try again.');
    const col = ({ category:'category', supplier:'supplier', location:'storage_location', status:'status', condition:'condition' })[field];
    const result = db.transaction(() => {
      const update = db.prepare(`UPDATE products SET ${col || 'selling_price'}=?,updated_at=datetime('now','localtime') WHERE id=?`);
      const supplierService = require('./supplierService');
      for (const p of products) {
        let next = raw;
        if (field === 'price_percent') next = Math.round((p.selling_price * (1 + amount / 100) + Number.EPSILON) * 100) / 100;
        if (field === 'price_amount') next = Math.round((p.selling_price + amount + Number.EPSILON) * 100) / 100;
        if (field.startsWith('price_') && (!Number.isFinite(next) || next < 0)) throw new Error(`${p.product_name}: price change would result in a negative sale price.`);
        if (field === 'status' && ['In Stock','Reserved'].includes(next) && p.quantity <= 0) throw new Error(`${p.product_name}: a product with no stock cannot be set to ${next}.`);
        update.run(next, p.id);
        if (field === 'supplier') supplierService.adjustProductBill(db, p.id, {
          supplier: next, name: p.product_name, price: p.purchase_price, qty: p.quantity, oldQty: p.quantity,
        });
      }
      return { updated: products.length, field, ids: unique };
    });
    return result();
  }

  deleteProduct(id) {
    const db = getDatabase();
    
    return db.transaction(() => {
      require("./supplierService").releaseProductBill(db, id);
      // First delete all related records that have FK constraints
      // 1. Delete damage records for this product
      db.prepare("DELETE FROM damage_records WHERE product_id = ?").run(id);
      // 2. Delete inspection notes
      db.prepare("DELETE FROM inspection_notes WHERE product_id = ?").run(id);
      // 3. Delete sale issue items (removes product from sales records)
      db.prepare("DELETE FROM sale_issue_items WHERE product_id = ?").run(id);
      // 4. Delete return items
      db.prepare("DELETE FROM return_items WHERE product_id = ?").run(id);
      // 5. Now delete the product itself
      db.prepare("DELETE FROM products WHERE id = ?").run(id);
    })();
    
    return { success: true };
  }

  changeStatus(id, status) {
    const db = getDatabase();
    db.prepare(
      "UPDATE products SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?",
    ).run(status, id);
    return { success: true };
  }

  changeCondition(id, condition) {
    const db = getDatabase();
    db.prepare(
      "UPDATE products SET condition = ?, updated_at = datetime('now','localtime') WHERE id = ?",
    ).run(condition, id);
    return { success: true };
  }

  addInspectionNote(productId, note) {
    const db = getDatabase();
    const stmt = db.prepare(
      "INSERT INTO inspection_notes (product_id, note) VALUES (?, ?)",
    );
    const result = stmt.run(productId, note);
    return { id: result.lastInsertRowid };
  }

  getInspectionNotes(productId) {
    const db = getDatabase();
    return db
      .prepare(
        "SELECT * FROM inspection_notes WHERE product_id = ? ORDER BY created_at DESC",
      )
      .all(productId);
  }

  deleteInspectionNote(noteId) {
    const db = getDatabase();
    db.prepare("DELETE FROM inspection_notes WHERE id = ?").run(noteId);
    return { success: true };
  }

  getCategories() {
    const db = getDatabase();
    const dbCategories = db
      .prepare(
        'SELECT DISTINCT category FROM products WHERE category != "" ORDER BY category',
      )
      .all()
      .map((r) => r.category);

    return normalizeCategories(dbCategories);
  }

  getSuppliers() {
    const db = getDatabase();
    return db
      .prepare(
        'SELECT DISTINCT supplier FROM products WHERE supplier != "" ORDER BY supplier',
      )
      .all()
      .map((r) => r.supplier);
  }
}

module.exports = new InventoryService();
