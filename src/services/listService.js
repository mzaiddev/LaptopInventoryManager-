const { getDatabase } = require("../database/dbInit");

// Which column of which table holds each list's value, so usage counts, renames and merges reach the records.
const SOURCES = {
  product_category: { table: "products", column: "category" },
  expense_category: { table: "expenses", column: "category" },
  storage_location: { table: "products", column: "storage_location" },
};

function source(key) {
  const s = SOURCES[key];
  if (!s) throw new Error("Unknown list");
  return s;
}

function cleanName(name) {
  const n = String(name || "").trim().replace(/\s+/g, " ");
  if (!n) throw new Error("Name is required");
  return n;
}

class ListService {
  _item(id) {
    const item = getDatabase().prepare("SELECT * FROM list_items WHERE id = ?").get(id);
    if (!item) throw new Error("List item not found");
    return item;
  }

  _usage(item) {
    const s = source(item.list_key);
    return getDatabase()
      .prepare(`SELECT COUNT(*) n FROM ${s.table} WHERE LOWER(TRIM(${s.column})) = LOWER(?)`)
      .get(item.name).n;
  }

  _findByName(key, name) {
    return getDatabase().prepare("SELECT * FROM list_items WHERE list_key = ? AND name = ? COLLATE NOCASE").get(key, name);
  }

  list(key, { includeArchived = false } = {}) {
    source(key);
    const rows = getDatabase()
      .prepare(`SELECT * FROM list_items WHERE list_key = ? ${includeArchived ? "" : "AND active = 1"} ORDER BY sort_order, name COLLATE NOCASE`)
      .all(key);
    return rows.map((r) => ({ ...r, active: !!r.active, usage: this._usage(r) }));
  }

  // Active items plus archived ones still on records: what a filter box needs to show.
  usedNames(key) {
    return this.list(key, { includeArchived: true }).filter((i) => i.active || i.usage > 0).map((i) => i.name);
  }

  add(key, name) {
    source(key);
    const n = cleanName(name);
    if (this._findByName(key, n)) throw new Error(`"${n}" already exists in this list`);
    const next = getDatabase().prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 n FROM list_items WHERE list_key = ?").get(key).n;
    const r = getDatabase().prepare("INSERT INTO list_items (list_key, name, sort_order) VALUES (?, ?, ?)").run(key, n, next);
    return { id: Number(r.lastInsertRowid) };
  }

  // Used by forms and imports that accept a new name: adds it quietly if it is not there yet.
  ensure(key, name) {
    source(key);
    const n = String(name || "").trim().replace(/\s+/g, " ");
    if (!n) return null;
    const found = this._findByName(key, n);
    return found ? found.id : this.add(key, n).id;
  }

  rename(id, name) {
    const item = this._item(id);
    const n = cleanName(name);
    const clash = this._findByName(item.list_key, n);
    if (clash && clash.id !== item.id) throw new Error(`"${n}" already exists. Use Merge to combine the two.`);
    const s = source(item.list_key);
    const db = getDatabase();
    db.transaction(() => {
      db.prepare(`UPDATE ${s.table} SET ${s.column} = ? WHERE LOWER(TRIM(${s.column})) = LOWER(?)`).run(n, item.name);
      db.prepare("UPDATE list_items SET name = ? WHERE id = ?").run(n, id);
    })();
    return { success: true };
  }

  merge(fromId, intoId) {
    const from = this._item(fromId);
    const into = this._item(intoId);
    if (from.list_key !== into.list_key) throw new Error("Both items must be in the same list");
    if (from.id === into.id) throw new Error("Pick a different item to merge into");
    const s = source(from.list_key);
    const db = getDatabase();
    db.transaction(() => {
      db.prepare(`UPDATE ${s.table} SET ${s.column} = ? WHERE LOWER(TRIM(${s.column})) = LOWER(?)`).run(into.name, from.name);
      db.prepare("DELETE FROM list_items WHERE id = ?").run(from.id);
    })();
    return { success: true };
  }

  setActive(id, active) {
    this._item(id);
    getDatabase().prepare("UPDATE list_items SET active = ? WHERE id = ?").run(active ? 1 : 0, id);
    return { success: true };
  }

  remove(id) {
    const item = this._item(id);
    if (this._usage(item) > 0) throw new Error("This item is in use. Archive it or merge it into another item instead.");
    getDatabase().prepare("DELETE FROM list_items WHERE id = ?").run(id);
    return { success: true };
  }

  reorder(key, ids) {
    source(key);
    const db = getDatabase();
    const update = db.prepare("UPDATE list_items SET sort_order = ? WHERE id = ? AND list_key = ?");
    db.transaction(() => ids.forEach((id, i) => update.run(i, id, key)))();
    return { success: true };
  }

  syncFromData() {
    const db = getDatabase();
    db.transaction(() => {
      for (const [key, s] of Object.entries(SOURCES)) {
        const rows = db.prepare(`SELECT DISTINCT TRIM(${s.column}) v FROM ${s.table} WHERE TRIM(COALESCE(${s.column}, '')) <> ''`).all();
        rows.forEach((r) => this.ensure(key, r.v));
      }
    })();
  }
}

module.exports = new ListService();
