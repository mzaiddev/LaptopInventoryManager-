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

module.exports = { guardIpc };
