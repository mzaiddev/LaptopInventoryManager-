const fs = require("fs");
const path = require("path");

// Loads NNN-name.js files exporting { version, up(db) }.
module.exports = fs
  .readdirSync(__dirname)
  .filter((f) => /^\d{3}-.*\.js$/.test(f))
  .map((f) => require(path.join(__dirname, f)));
