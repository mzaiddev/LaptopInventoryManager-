// File-level backup helpers. No Electron here, so they are unit-testable.
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const REQUIRED_TABLES = ["products", "customers", "sale_issues", "settings"];

// { ok: true } or { ok: false, error }
function verify(filePath) {
  if (!fs.existsSync(filePath)) return { ok: false, error: "Backup file not found." };
  let db;
  try {
    db = new Database(filePath, { readonly: true, fileMustExist: true });
    const check = db.pragma("integrity_check", { simple: true });
    if (check !== "ok") return { ok: false, error: `Database is damaged: ${check}` };
    const have = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
    if (!REQUIRED_TABLES.every((t) => have.has(t))) {
      return { ok: false, error: "This file is not a Laptop Inventory Manager backup." };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `This file is not a valid database: ${err.message}` };
  } finally {
    if (db) db.close();
  }
}

const stamp = (d) => d.toISOString().replace(/[:.]/g, "-");

// The live database must be closed by the caller. Verifies first, keeps a safety copy of the
// current database, and removes stale -wal/-shm files that would corrupt the restored one.
function restoreFile(backupPath, dbPath, safetyDir) {
  const v = verify(backupPath);
  if (!v.ok) throw new Error(v.error.startsWith("This file is not a valid") ? v.error : `${v.error} (not a valid backup)`);

  let safetyPath = null;
  if (fs.existsSync(dbPath)) {
    fs.mkdirSync(safetyDir, { recursive: true });
    safetyPath = path.join(safetyDir, `pre-restore-${stamp(new Date())}.db`);
    fs.copyFileSync(dbPath, safetyPath);
  }
  const tmpPath = dbPath + ".restore-tmp";
  fs.copyFileSync(backupPath, tmpPath);
  for (const ext of ["-wal", "-shm"]) fs.rmSync(dbPath + ext, { force: true });
  fs.renameSync(tmpPath, dbPath);
  return { safetyPath };
}

const AUTO = /^auto-\d{4}-\d{2}-\d{2}\.db$/;

// Deletes the oldest automatic backups beyond `keep`; returns how many were removed.
function pruneOld(dir, keep = 30) {
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir).filter((f) => AUTO.test(f)).sort();
  const extra = files.slice(0, Math.max(0, files.length - keep));
  extra.forEach((f) => fs.rmSync(path.join(dir, f), { force: true }));
  return extra.length;
}

// One consistent file per day (auto-YYYY-MM-DD.db), refreshed on every call.
function autoBackup(db, dir, now = new Date()) {
  fs.mkdirSync(dir, { recursive: true });
  const pad = (n) => String(n).padStart(2, "0");
  const file = path.join(dir, `auto-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.db`);
  fs.rmSync(file, { force: true });
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  pruneOld(dir, 30);
  return file;
}

module.exports = { verify, restoreFile, pruneOld, autoBackup };
