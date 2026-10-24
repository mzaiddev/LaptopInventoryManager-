// Every IPC channel needs a logged-in session except these.
const PUBLIC = new Set(["auth:login", "auth:status", "vendor:provision", "vendor:installId"]);

function guardIpc(ipcMain, auth) {
  return {
    handle(channel, fn) {
      ipcMain.handle(channel, (event, ...args) => {
        if (!PUBLIC.has(channel) && !auth.isLoggedIn()) {
          return { success: false, error: "AUTH_REQUIRED" };
        }
        return fn(event, ...args);
      });
    },
  };
}

// Edit/delete handlers run only right after the owner entered the super-password (one use per grant).
function requireSuper(auth, fn) {
  return async (event, ...args) => {
    if (!auth.consumeSuper()) return { success: false, error: "SUPER_REQUIRED" };
    const result = await fn(event, ...args);
    // A rejected save (validation) keeps the grant so the form can be fixed and saved again.
    if (result && result.success === false) auth.restoreSuper();
    return result;
  };
}

module.exports = { guardIpc, requireSuper };
