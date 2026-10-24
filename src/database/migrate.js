// Versioned migrations tracked in PRAGMA user_version. Each runs in its own
// transaction; backupFn(version) is called first so a bad one can be undone.
function runMigrations(db, migrations, { backupFn } = {}) {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  let current = db.pragma("user_version", { simple: true });
  for (const m of sorted) {
    if (m.version <= current) continue;
    if (backupFn) backupFn(m.version);
    db.transaction(() => {
      m.up(db);
      db.pragma(`user_version = ${m.version}`);
    })();
    current = m.version;
  }
  return current;
}

module.exports = { runMigrations };
