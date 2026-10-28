const crypto = require("crypto");
const fs = require("fs");
const { getDatabase } = require("../database/dbInit");

const MIN_LEN = 4;
const REMEMBER_DAYS = 30; // how long a sign-in is remembered on this PC unless the owner signs out

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

  // Friend edition: a fresh copy starts with a known owner so no activation key is needed.
  // The owner changes both passwords in Settings. An existing owner is never touched.
  seedDefaultOwner() {
    if (this.hasOwner()) return false;
    this.setOwner({ username: "admin", password: "admin123", superPassword: "super123" });
    return true;
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
    this._forget();
  }

  login(username, password) {
    const u = getDatabase().prepare("SELECT password_hash FROM users WHERE username = ?").get(String(username || "").trim());
    if (!u || !verify(password, u.password_hash)) return { ok: false, error: "INVALID" };
    this.loggedIn = true;
    this._remember();
    return { ok: true };
  }

  logout() {
    this._reset();
    this._forget();
  }

  // ---- Remembered sign-in
  // After a sign-in the owner stays signed in for 30 days, across restarts, until they press Sign out.
  // The marker is encrypted with Windows secure storage and tied to the current password, so changing the
  // password or setting up a new owner ends it. Only the sign-in is remembered, never the super-password.
  // Tests pass their own `store` ({ file, safeStorage, now }).
  useSessionStore(store) {
    this._store = store;
  }

  _sessionStore() {
    if (this._store) return this._store;
    try {
      const electron = require("electron");
      if (!electron || !electron.safeStorage) return null;
      const path = require("path");
      return { file: path.join(require("../config/appConfig").getUserDataPath(), "session.bin"), safeStorage: electron.safeStorage, now: Date.now };
    } catch {
      return null;
    }
  }

  _fingerprint() {
    const u = getDatabase().prepare("SELECT username, password_hash FROM users LIMIT 1").get();
    return u ? crypto.createHash("sha256").update(`${u.username}:${u.password_hash}`).digest("hex") : null;
  }

  _remember() {
    try {
      const st = this._sessionStore();
      if (!st || !st.safeStorage.isEncryptionAvailable()) return;
      const now = (st.now || Date.now)();
      const marker = JSON.stringify({ fp: this._fingerprint(), expiresAt: now + REMEMBER_DAYS * 24 * 60 * 60 * 1000 });
      fs.mkdirSync(require("path").dirname(st.file), { recursive: true });
      fs.writeFileSync(st.file, st.safeStorage.encryptString(marker));
    } catch { /* not remembered: the owner just signs in again next time */ }
  }

  _forget() {
    try {
      const st = this._sessionStore();
      if (st) fs.rmSync(st.file, { force: true });
    } catch { /* already gone */ }
  }

  // Called once when the app starts: signs the owner straight back in when a valid marker exists.
  restoreSession() {
    try {
      const st = this._sessionStore();
      if (!st || !fs.existsSync(st.file)) return false;
      const marker = JSON.parse(st.safeStorage.decryptString(fs.readFileSync(st.file)));
      const now = (st.now || Date.now)();
      if (!marker || !marker.fp || marker.fp !== this._fingerprint() || !(marker.expiresAt > now)) {
        this._forget();
        return false;
      }
      this.loggedIn = true;
      return true;
    } catch {
      this._forget();
      return false;
    }
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

  restoreSuper() {
    this.superGranted = true;
  }

  revokeSuper() {
    this.superGranted = false;
  }

  // Product details for editing need the cost once the super-password was given.
  isSuperPending() {
    return this.superGranted;
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
    if (this.loggedIn) this._remember();
  }

  changeSuperPassword(current, next) {
    if (!this._verifySuper(current)) throw new Error("Current super-password is incorrect");
    checkNew(next);
    this._setSetting("super_password_hash", hash(next));
  }
}

module.exports = new AuthService();
