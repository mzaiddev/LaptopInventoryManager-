const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { freshDb, tempDir } = require("./helpers");
const auth = require("../src/services/authService");

const DAY = 24 * 60 * 60 * 1000;

// Stand-in for Windows secure storage; the clock is ours so 30 days can pass instantly.
function setup() {
  freshDb();
  auth.setOwner({ username: "owner", password: "pass1234", superPassword: "super1234" });
  const clock = { t: 1_000_000_000_000 };
  auth.useSessionStore({
    file: path.join(tempDir("session-"), "session.bin"),
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(Buffer.from(s).toString("base64")),
      decryptString: (b) => Buffer.from(String(b), "base64").toString(),
    },
    now: () => clock.t,
  });
  return clock;
}

// What happens when the app is closed and opened again: the in-memory sign-in is lost.
const restart = () => { auth._reset(); return auth.restoreSession(); };

test("after signing in, the app signs back in on the next start", () => {
  setup();
  assert.strictEqual(auth.login("owner", "pass1234").ok, true);
  assert.strictEqual(restart(), true);
  assert.strictEqual(auth.isLoggedIn(), true);
});

test("a wrong password remembers nothing", () => {
  setup();
  assert.strictEqual(auth.login("owner", "nope").ok, false);
  assert.strictEqual(restart(), false);
  assert.strictEqual(auth.isLoggedIn(), false);
});

test("signing out forgets it", () => {
  setup();
  auth.login("owner", "pass1234");
  auth.logout();
  assert.strictEqual(restart(), false);
});

test("it is remembered for 30 days and then asks again", () => {
  const clock = setup();
  auth.login("owner", "pass1234");
  clock.t += 29 * DAY;
  assert.strictEqual(restart(), true);
  clock.t += 2 * DAY;
  assert.strictEqual(restart(), false);
});

test("the super-password and shown prices are never remembered", () => {
  setup();
  auth.login("owner", "pass1234");
  auth.revealCost("super1234");
  auth.grantSuperOnce("super1234");
  restart();
  assert.strictEqual(auth.isCostVisible(), false);
  assert.strictEqual(auth.isSuperPending(), false);
});

test("changing the password here keeps this PC signed in, a new owner does not", () => {
  setup();
  auth.login("owner", "pass1234");
  auth.changePassword("pass1234", "newpass99");
  assert.strictEqual(restart(), true);
  auth.setOwner({ username: "owner", password: "another1", superPassword: "super1234" });
  assert.strictEqual(restart(), false);
});

test("a password changed some other way ends the remembered sign-in", () => {
  setup();
  auth.login("owner", "pass1234");
  require("../src/database/dbInit").getDatabase().prepare("UPDATE users SET password_hash = 'x:y'").run();
  assert.strictEqual(restart(), false);
});

test("a damaged marker just means signing in again", () => {
  setup();
  auth.login("owner", "pass1234");
  require("fs").writeFileSync(auth._store.file, "garbage");
  assert.strictEqual(restart(), false);
});

test("with no secure storage nothing is saved and sign-in still works", () => {
  freshDb();
  auth.setOwner({ username: "owner", password: "pass1234", superPassword: "super1234" });
  auth.useSessionStore({ file: path.join(tempDir("session-"), "session.bin"), safeStorage: { isEncryptionAvailable: () => false } });
  assert.strictEqual(auth.login("owner", "pass1234").ok, true);
  assert.strictEqual(restart(), false);
});
