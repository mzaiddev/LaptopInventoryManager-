// Every IPC channel needs a logged-in session except these.
const PUBLIC = new Set(["auth:login", "auth:status", "vendor:provision", "vendor:installId"]);

// Successful calls on these channels go to the audit log: channel -> [action, entity].
const AUDITED = {
  "inventory:update": ["product.edit", "product"],
  "inventory:delete": ["product.delete", "product"],
  "sale:delete": ["sale.delete", "sale"],
  "sale:update": ["sale.edit", "sale"],
  "sale:deletePayment": ["payment.delete", "payment"],
  "sale:updatePayment": ["payment.edit", "payment"],
  "ledger:deleteEntry": ["ledger.delete", "ledger_entry"],
  "ledger:deleteCustomer": ["customer.delete", "customer"],
  "oldBalance:delete": ["old_balance.delete", "old_balance"],
  "expense:delete": ["expense.delete", "expense"],
  "supplier:add": ["supplier.add", "supplier"],
  "supplier:update": ["supplier.edit", "supplier"],
  "supplier:delete": ["supplier.delete", "supplier"],
  "supplier:addPurchase": ["supplier.purchase", "supplier_entry"],
  "supplier:addPayment": ["supplier.payment", "supplier_entry"],
  "supplier:updateEntry": ["supplier_entry.edit", "supplier_entry"],
  "supplier:deleteEntry": ["supplier_entry.delete", "supplier_entry"],
  "lists:add": ["list.add", "list_item"],
  "lists:rename": ["list.rename", "list_item"],
  "lists:merge": ["list.merge", "list_item"],
  "lists:setActive": ["list.archive", "list_item"],
  "lists:remove": ["list.remove", "list_item"],
  "tasks:enqueueWhatsapp": ["task.enqueue", "job"],
  "tasks:enqueueProductImport": ["product.import", "job"],
  "tasks:stop": ["task.stop", "job"],
  "tasks:resume": ["task.resume", "job"],
  "tasks:retryFailed": ["task.retry_failed", "job"],
  "auth:changePassword": ["password.change", "user"],
  "auth:changeSuperPassword": ["super_password.change", "user"],
  "vendor:provision": ["owner.provision", "user"],
};

function guardIpc(ipcMain, auth, audit) {
  return {
    handle(channel, fn) {
      ipcMain.handle(channel, async (event, ...args) => {
        if (!PUBLIC.has(channel) && !auth.isLoggedIn()) {
          return { success: false, error: "AUTH_REQUIRED" };
        }
        const result = await fn(event, ...args);
        if (audit && AUDITED[channel] && !(result && result.success === false)) audit(channel, args);
        return result;
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

module.exports = { guardIpc, requireSuper, AUDITED };
