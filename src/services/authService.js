const crypto = require("crypto");
const { getDatabase } = require("../database/dbInit");

const MIN_LEN = 4;

function hash(plain) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(plain), salt, 64);
  return `${salt.toString("hex")}:${h.toString("hex")}`;
}

function verify(plain, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [saltHex, hashHex] = stored.split(":");
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(String(plain), Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function checkNew(pw) {
  if (typeof pw !== "string" || pw.length < MIN_LEN) {
    throw new Error(`Password must be at least ${MIN_LEN} characters`);
  }
}

// Session state lives in the main process only; the renderer never holds it.
class AuthService {
  constructor() {
    this._reset();
  }

  _reset() {
    this.loggedIn = false;
    this.superGranted = false;
    this.costVisible = false;
  }

  _getSetting(key) {
    const r = getDatabase().prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return r ? r.value : null;
  }

  _setSetting(key, value) {
    getDatabase()
      .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
      .run(key, value);
  }

  getInstallId() {
    let id = this._getSetting("install_id");
    if (!id) {
      id = crypto.randomBytes(8).toString("hex").toUpperCase().replace(/(.{4})/g, "$1-").slice(0, -1);
      this._setSetting("install_id", id);
    }
    return id;
  }

  hasOwner() {
    return !!getDatabase().prepare("SELECT 1 FROM users LIMIT 1").get();
  }

  // Replaces any existing owner: used by the vendor console and first-run setup.
  setOwner({ username, password, superPassword }) {
    if (!username || !String(username).trim()) throw new Error("Username is required");
    checkNew(password);
    checkNew(superPassword);
    const db = getDatabase();
    db.transaction(() => {
      db.prepare("DELETE FROM users").run();
      db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(
        String(username).trim(),
        hash(password),
      );
      this._setSetting("super_password_hash", hash(superPassword));
    })();
    this._reset();
  }

  login(username, password) {
    const u = getDatabase().prepare("SELECT password_hash FROM users WHERE username = ?").get(String(username || "").trim());
    if (!u || !verify(password, u.password_hash)) return { ok: false, error: "INVALID" };
    this.loggedIn = true;
    return { ok: true };
  }

  logout() {
    this._reset();
  }

  isLoggedIn() {
    return this.loggedIn;
  }

  _verifySuper(pw) {
    return verify(pw, this._getSetting("super_password_hash"));
  }

  grantSuperOnce(pw) {
    this.superGranted = this._verifySuper(pw);
    return this.superGranted;
  }

  consumeSuper() {
    const ok = this.superGranted;
    this.superGranted = false;
    return ok;
  }

  revealCost(pw) {
    this.costVisible = this._verifySuper(pw);
    return this.costVisible;
  }

  hideCost() {
    this.costVisible = false;
  }

  isCostVisible() {
    return this.costVisible;
  }

  changePassword(current, next) {
    const u = getDatabase().prepare("SELECT id, password_hash FROM users LIMIT 1").get();
    if (!u || !verify(current, u.password_hash)) throw new Error("Current password is incorrect");
    checkNew(next);
    getDatabase().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash(next), u.id);
  }

  changeSuperPassword(current, next) {
    if (!this._verifySuper(current)) throw new Error("Current super-password is incorrect");
    checkNew(next);
    this._setSetting("super_password_hash", hash(next));
  }
}

module.exports = new AuthService();
