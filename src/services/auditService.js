const { getDatabase } = require("../database/dbInit");

class AuditService {
  // Never throws: a logging problem must not undo a real action.
  log(action, entity, entityId = null, detail = null) {
    try {
      getDatabase()
        .prepare("INSERT INTO audit_log (action, entity, entity_id, detail) VALUES (?, ?, ?, ?)")
        .run(action, entity, entityId, detail ? JSON.stringify(detail) : null);
    } catch (err) {
      console.error("audit log failed:", err.message);
    }
  }

  list({ page = 1, pageSize = 50 } = {}) {
    return getDatabase()
      .prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?")
      .all(pageSize, (Math.max(1, page) - 1) * pageSize)
      .map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));
  }
}

module.exports = new AuditService();
