const { initDatabase, closeDatabase } = require("../src/database/dbInit");

// Fresh in-memory DB with the full production schema.
function freshDb() {
  closeDatabase();
  return initDatabase(":memory:");
}

module.exports = { freshDb, closeDatabase };
