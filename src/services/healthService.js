const fs = require("fs");
const { getDatabase } = require("../database/dbInit");

// One screen of facts about the installation: is the data safe, is anything stuck.
class HealthService {
  report({ version = "", dbPath = null, lastBackupAt = null } = {}) {
    const db = getDatabase();
    const count = (table) => db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
    const check = require("./integrityService").check();
    const taskCount = (statuses) => db.prepare(`SELECT COUNT(*) n FROM jobs WHERE status IN (${statuses.map(() => "?").join(",")})`).get(...statuses).n;
    let dbSizeBytes = 0;
    try { if (dbPath && fs.existsSync(dbPath)) dbSizeBytes = fs.statSync(dbPath).size; } catch (e) { /* size stays 0 */ }
    return {
      version,
      dbSizeBytes,
      lastBackupAt: lastBackupAt ? new Date(lastBackupAt).toISOString() : null,
      counts: { products: count("products"), customers: count("customers"), sales: count("sale_issues"), suppliers: count("suppliers") },
      integrity: { ok: check.ok, problems: check.problems.length, details: check.problems.slice(0, 5).map((p) => p.detail) },
      tasks: { running: taskCount(["queued", "running"]), failed: taskCount(["failed", "partial", "interrupted"]) },
    };
  }
}

module.exports = new HealthService();
