// Plain-text error log in the app data folder, rotated at 1 MB so it cannot grow forever.
const fs = require("fs");
const path = require("path");

const MAX_BYTES = 1024 * 1024;

function logError(context, err, dir) {
  try {
    const logDir = dir || path.join(require("electron").app.getPath("userData"), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const file = path.join(logDir, "app.log");
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) {
      fs.renameSync(file, path.join(logDir, "app.old.log"));
    }
    const text = err && err.stack ? err.stack : String(err);
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${context}: ${text}\n`);
  } catch {
    // logging must never crash the app
  }
}

module.exports = { logError };
