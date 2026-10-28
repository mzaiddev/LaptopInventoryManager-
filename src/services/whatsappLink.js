// Links the owner's own WhatsApp (scan a QR code once, like WhatsApp Web) and sends PDFs automatically.
// Unofficial: it uses the WhatsApp Web protocol through the Baileys library, so sending is paced like a person
// would to keep the number safe. Main process only.
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { normalizePhone } = require("./whatsapp");

const GAP = [5000, 11000]; // pause between two messages (ms)
const BREAK_EVERY = 20; // after this many messages in one run ...
const BREAK = [45000, 75000]; // ... rest for a minute
const NEW_RUN_AFTER = 10 * 60 * 1000; // idle this long and the message count starts again
const TYPING = [1000, 2500];

function coded(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

class WhatsAppLink {
  // Everything that touches the outside world is injectable so the rules can be tested without WhatsApp.
  constructor(deps = {}) {
    this.sessionDir = deps.sessionDir;
    this.loadBaileys = deps.loadBaileys || (() => import(pathToFileURL(require.resolve("@whiskeysockets/baileys")).href));
    this.toQrImage = deps.toQrImage || ((text) => require("qrcode").toDataURL(text, { margin: 1, width: 280 }));
    this.sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = deps.random || Math.random;
    this.now = deps.now || Date.now;
    this.countryCode = deps.countryCode || (() => "92");

    this.sock = null;
    this.state = "unlinked"; // unlinked | connecting | qr | linked
    this.qr = null;
    this.phone = null;
    this.error = null;
    this.wantConnected = false;
    this.retries = 0;
    this.sentCount = 0;
    this.lastSentAt = 0;
    this.chain = Promise.resolve();
    this.listeners = new Set();
  }

  between([lo, hi]) {
    return Math.round(lo + this.random() * (hi - lo));
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getStatus() {
    return { state: this.state, qr: this.qr, phone: this.phone, error: this.error };
  }

  _set(patch) {
    Object.assign(this, patch);
    const s = this.getStatus();
    this.listeners.forEach((fn) => {
      try { fn(s); } catch { /* a broken listener must not stop the connection */ }
    });
  }

  _registered() {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.sessionDir, "creds.json"), "utf8")).registered === true;
    } catch {
      return false;
    }
  }

  _clearSession() {
    try { fs.rmSync(this.sessionDir, { recursive: true, force: true }); } catch { /* nothing to remove */ }
  }

  // Reconnect quietly at app start when this PC was linked before.
  autoStart() {
    if (this._registered()) this.connect().catch((err) => this._set({ state: "unlinked", error: err.message }));
  }

  async connect() {
    this.wantConnected = true;
    this.error = null;
    if (this.sock) return this.getStatus();
    await this._open();
    return this.getStatus();
  }

  async _open() {
    this._set({ state: "connecting", error: null });
    const B = await this.loadBaileys();
    const makeSocket = B.makeWASocket || (B.default && (B.default.default || B.default));
    fs.mkdirSync(this.sessionDir, { recursive: true });
    const { state, saveCreds } = await B.useMultiFileAuthState(this.sessionDir);
    let version;
    try { ({ version } = await B.fetchLatestBaileysVersion()); } catch { /* the built-in version is used */ }
    const quiet = { level: "silent", child() { return this; }, trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {} };
    const sock = makeSocket({
      auth: state,
      logger: quiet,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      browser: B.Browsers && B.Browsers.windows ? B.Browsers.windows("Laptop Inventory Manager") : ["Laptop Inventory Manager", "Desktop", "1.0"],
      ...(version ? { version } : {}),
    });
    this.sock = sock;
    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", (u) => this._onUpdate(sock, u, B).catch((err) => this._set({ error: err.message })));
  }

  async _onUpdate(sock, u, B) {
    if (sock !== this.sock) return; // an old connection
    if (u.qr) {
      this._set({ state: "qr", qr: await this.toQrImage(u.qr) });
    }
    if (u.connection === "open") {
      this.retries = 0;
      const id = (sock.user && sock.user.id) || "";
      this._set({ state: "linked", qr: null, error: null, phone: id.split(":")[0].split("@")[0] || null });
      return;
    }
    if (u.connection !== "close") return;

    const code = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output && u.lastDisconnect.error.output.statusCode;
    const R = (B.DisconnectReason) || {};
    this.sock = null;
    if (code === R.loggedOut || code === R.badSession) {
      this._clearSession();
      this.wantConnected = false;
      this._set({ state: "unlinked", qr: null, phone: null, error: "WhatsApp was unlinked on the phone. Link it again to keep sending." });
      return;
    }
    if (code === R.connectionReplaced) {
      this.wantConnected = false;
      this._set({ state: "unlinked", qr: null, error: "WhatsApp was opened somewhere else. Link it again." });
      return;
    }
    if (!this.wantConnected) {
      this._set({ state: "unlinked", qr: null });
      return;
    }
    if (code === R.restartRequired) { // normal right after the QR code is scanned
      await this._open();
      return;
    }
    if (!this._registered()) { // the QR code was never scanned: do not keep retrying
      this.wantConnected = false;
      this._set({ state: "unlinked", qr: null, error: "The QR code was not scanned in time. Press Link WhatsApp to try again." });
      return;
    }
    this.retries += 1;
    this._set({ state: "connecting" });
    await this.sleep(Math.min(30000, 2000 * 2 ** this.retries));
    if (this.wantConnected && !this.sock) await this._open();
  }

  async unlink() {
    this.wantConnected = false;
    const sock = this.sock;
    this.sock = null;
    if (sock) {
      try { await sock.logout(); } catch { /* the phone may already have removed the link */ }
      try { sock.end(); } catch { /* already closed */ }
    }
    this._clearSession();
    this._set({ state: "unlinked", qr: null, phone: null, error: null });
  }

  // Close the connection when the app quits, but keep the link.
  shutdown() {
    this.wantConnected = false;
    const sock = this.sock;
    this.sock = null;
    try { if (sock) sock.end(); } catch { /* closing */ }
  }

  // One message at a time, spaced out like a person sending them.
  sendPdf(opts) {
    const run = this.chain.then(() => this._sendPdf(opts));
    this.chain = run.catch(() => {});
    return run;
  }

  async _pace() {
    if (!this.lastSentAt) return;
    if (this.now() - this.lastSentAt > NEW_RUN_AFTER) this.sentCount = 0;
    const gap = this.sentCount > 0 && this.sentCount % BREAK_EVERY === 0 ? this.between(BREAK) : this.between(GAP);
    const wait = this.lastSentAt + gap - this.now();
    if (wait > 0) await this.sleep(wait);
  }

  async _sendPdf({ phone, filePath, fileName, caption }) {
    if (this.state !== "linked" || !this.sock) throw coded("NOT_LINKED", "WhatsApp is not linked. Link it first.");
    const digits = normalizePhone(phone, this.countryCode());
    if (!digits) throw coded("INVALID_NUMBER", "Invalid phone number");
    const jid = `${digits}@s.whatsapp.net`;

    const found = await this.sock.onWhatsApp(jid);
    const hit = Array.isArray(found) ? found[0] : null;
    if (!hit || !hit.exists) throw coded("NOT_ON_WHATSAPP", "This number is not on WhatsApp");

    await this._pace();
    if (this.state !== "linked" || !this.sock) throw coded("NOT_LINKED", "WhatsApp was disconnected.");
    try {
      if (this.sock.sendPresenceUpdate) await this.sock.sendPresenceUpdate("composing", hit.jid || jid);
    } catch { /* a typing indicator is optional */ }
    await this.sleep(this.between(TYPING));

    await this.sock.sendMessage(hit.jid || jid, {
      document: fs.readFileSync(filePath),
      mimetype: "application/pdf",
      fileName: fileName || "statement.pdf",
      caption: String(caption || "").slice(0, 1000),
    });
    this.sentCount += 1;
    this.lastSentAt = this.now();
    return { jid: hit.jid || jid };
  }
}

// The one shared connection for the running app.
let shared = null;
function getLink() {
  if (!shared) {
    const { getUserDataPath } = require("../config/appConfig");
    shared = new WhatsAppLink({
      sessionDir: path.join(getUserDataPath(), "whatsapp-session"),
      countryCode: () => require("./settingsService").getSetting("default_country_code") || "92",
    });
  }
  return shared;
}

module.exports = { WhatsAppLink, getLink, coded, GAP, BREAK, BREAK_EVERY };
