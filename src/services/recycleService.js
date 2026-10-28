const { getDatabase } = require("../database/dbInit");

// Insert order matters: parents before children.
const RESTORE_ORDER = {
  product: ["products", "inspection_notes", "damage_records", "sale_issue_items", "return_items", "supplier_ledger"],
  expense: ["expenses"],
};

const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;

// Deleted products and expenses are kept for a while. archive() runs inside the delete's own transaction.
class RecycleService {
  archive({ entity, entityId, label, tables }) {
    const r = getDatabase()
      .prepare("INSERT INTO recycle_bin (entity, entity_id, label, data_json) VALUES (?, ?, ?, ?)")
      .run(entity, entityId, String(label || ""), JSON.stringify(tables));
    return Number(r.lastInsertRowid);
  }

  list() {
    return getDatabase().prepare("SELECT id, entity, entity_id, label, deleted_at FROM recycle_bin ORDER BY id DESC").all();
  }

  restore(id) {
    const db = getDatabase();
    const entry = db.prepare("SELECT * FROM recycle_bin WHERE id = ?").get(id);
    if (!entry) throw new Error("Nothing to restore");
    const order = RESTORE_ORDER[entry.entity];
    if (!order) throw new Error("Cannot restore this kind of record");
    const data = JSON.parse(entry.data_json);
    const main = data[order[0]] && data[order[0]][0];
    if (main && db.prepare(`SELECT 1 FROM ${quote(order[0])} WHERE id = ?`).get(main.id)) {
      throw new Error("This record is already back in the system");
    }

    db.transaction(() => {
      for (const table of order) {
        for (const row of data[table] || []) {
          const exists = db.prepare(`SELECT 1 FROM ${quote(table)} WHERE id = ?`).get(row.id);
          if (exists) {
            // A supplier bill that was only detached from the product, not deleted: link it back.
            if (table === "supplier_ledger") db.prepare("UPDATE supplier_ledger SET product_id = ?, note = ? WHERE id = ?").run(row.product_id, row.note, row.id);
            continue;
          }
          const cols = Object.keys(row);
          db.prepare(`INSERT INTO ${quote(table)} (${cols.map(quote).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...cols.map((c) => row[c]));
        }
      }
      db.prepare("DELETE FROM recycle_bin WHERE id = ?").run(id);
    })();
    return { entity: entry.entity, entityId: entry.entity_id };
  }

  purge(id) {
    getDatabase().prepare("DELETE FROM recycle_bin WHERE id = ?").run(id);
    return { success: true };
  }

  purgeOld(days = 30) {
    return getDatabase().prepare("DELETE FROM recycle_bin WHERE deleted_at < datetime('now','localtime', ?)").run(`-${Number(days) || 30} days`).changes;
  }
}

module.exports = new RecycleService();
