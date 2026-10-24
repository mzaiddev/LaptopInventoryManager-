const test = require("node:test");
const assert = require("node:assert");
const { guardIpc } = require("../src/ipc/guard");

function fakeIpc() {
  const handlers = {};
  return { handlers, handle: (ch, fn) => (handlers[ch] = fn) };
}

test("data channels return AUTH_REQUIRED and do not run when logged out", async () => {
  const ipc = fakeIpc();
  let ran = false;
  const auth = { isLoggedIn: () => false };
  guardIpc(ipc, auth).handle("inventory:getAll", async () => { ran = true; return { success: true }; });
  const r = await ipc.handlers["inventory:getAll"]({});
  assert.deepStrictEqual(r, { success: false, error: "AUTH_REQUIRED" });
  assert.strictEqual(ran, false);
});

test("data channels run when logged in and pass arguments through", async () => {
  const ipc = fakeIpc();
  const auth = { isLoggedIn: () => true };
  guardIpc(ipc, auth).handle("x:y", async (e, a, b) => ({ success: true, data: a + b }));
  assert.deepStrictEqual(await ipc.handlers["x:y"]({}, 1, 2), { success: true, data: 3 });
});

test("login, status and vendor channels stay reachable while logged out", async () => {
  const ipc = fakeIpc();
  const auth = { isLoggedIn: () => false };
  const g = guardIpc(ipc, auth);
  for (const ch of ["auth:login", "auth:status", "vendor:provision", "vendor:installId"]) {
    g.handle(ch, async () => ({ success: true }));
    assert.deepStrictEqual(await ipc.handlers[ch]({}), { success: true }, ch);
  }
});

test("other auth channels (password changes) need a session", async () => {
  const ipc = fakeIpc();
  guardIpc(ipc, { isLoggedIn: () => false }).handle("auth:changePassword", async () => ({ success: true }));
  assert.strictEqual((await ipc.handlers["auth:changePassword"]({})).error, "AUTH_REQUIRED");
});
