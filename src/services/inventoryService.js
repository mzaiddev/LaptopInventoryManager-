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

    return { id: result.lastInsertRowid };
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

    return { success: true };
  }

  deleteProduct(id) {
    const db = getDatabase();
    db.prepare("DELETE FROM products WHERE id = ?").run(id);
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
