// better-sqlite3 is built for Electron, so tests run under Electron's Node.
const { spawnSync } = require("child_process");
const path = require("path");
const electron = require("electron");

const r = spawnSync(electron, ["--test", path.join(__dirname, "..", "tests")], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
});
process.exit(r.status === null ? 1 : r.status);
