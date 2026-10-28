const test = require("node:test");
const assert = require("node:assert");
const { freshDb } = require("./helpers");
const auth = require("../src/services/authService");

function setup() {
  const db = freshDb();
  auth._reset();
  auth.setOwner({ username: "owner", password: "pass123", superPassword: "super999" });
  return db;
}

test("correct login succeeds, wrong password is INVALID", () => {
  setup();
  assert.deepStrictEqual(auth.login("owner", "nope"), { ok: false, error: "INVALID" });
  assert.strictEqual(auth.isLoggedIn(), false);
  assert.deepStrictEqual(auth.login("owner", "pass123"), { ok: true });
  assert.strictEqual(auth.isLoggedIn(), true);
});

test("wrong username is INVALID", () => {
  setup();
  assert.strictEqual(auth.login("someone", "pass123").ok, false);
});

test("passwords are never stored in plain text", () => {
  const db = setup();
  const u = db.prepare("SELECT password_hash FROM users").get();
  const s = db.prepare("SELECT value FROM settings WHERE key='super_password_hash'").get();
  assert.ok(!u.password_hash.includes("pass123"));
  assert.ok(!s.value.includes("super999"));
});

test("grantSuperOnce works once per correct password", () => {
  setup();
  assert.strictEqual(auth.grantSuperOnce("wrong"), false);
  assert.strictEqual(auth.consumeSuper(), false);
  assert.strictEqual(auth.grantSuperOnce("super999"), true);
  assert.strictEqual(auth.consumeSuper(), true);
  assert.strictEqual(auth.consumeSuper(), false);
});

test("revealCost shows cost until hideCost or logout", () => {
  setup();
  auth.login("owner", "pass123");
  assert.strictEqual(auth.revealCost("bad"), false);
  assert.strictEqual(auth.isCostVisible(), false);
  assert.strictEqual(auth.revealCost("super999"), true);
  assert.strictEqual(auth.isCostVisible(), true);
  auth.hideCost();
  assert.strictEqual(auth.isCostVisible(), false);
  auth.revealCost("super999");
  auth.logout();
  assert.strictEqual(auth.isCostVisible(), false);
  assert.strictEqual(auth.isLoggedIn(), false);
});

test("changePassword needs the current password", () => {
  setup();
  assert.throws(() => auth.changePassword("wrong", "newpass1"), /current password/i);
  auth.changePassword("pass123", "newpass1");
  assert.strictEqual(auth.login("owner", "newpass1").ok, true);
  assert.throws(() => auth.changePassword("newpass1", "abc"), /at least 4/i);
});

test("changeSuperPassword needs the current super-password", () => {
  setup();
  assert.throws(() => auth.changeSuperPassword("wrong", "newsuper"), /current/i);
  auth.changeSuperPassword("super999", "newsuper");
  assert.strictEqual(auth.grantSuperOnce("newsuper"), true);
});

test("hasOwner and installId", () => {
  freshDb();
  auth._reset();
  assert.strictEqual(auth.hasOwner(), false);
  const id = auth.getInstallId();
  assert.ok(id.length >= 12);
  assert.strictEqual(auth.getInstallId(), id);
  auth.setOwner({ username: "o", password: "pppp", superPassword: "ssss" });
  assert.strictEqual(auth.hasOwner(), true);
});

test("a fresh copy gets the default owner, and an existing owner is kept", () => {
  freshDb();
  const auth = require("../src/services/authService");
  assert.strictEqual(auth.seedDefaultOwner(), true);
  assert.deepStrictEqual(auth.login("admin", "admin123"), { ok: true });
  assert.strictEqual(auth._verifySuper("super123"), true);
  auth.changePassword("admin123", "mynewpass");
  assert.strictEqual(auth.seedDefaultOwner(), false);
  assert.strictEqual(auth.login("admin", "admin123").ok, false);
  assert.strictEqual(auth.login("admin", "mynewpass").ok, true);
});
