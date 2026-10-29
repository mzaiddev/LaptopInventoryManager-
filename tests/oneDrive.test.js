const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const Database = require("better-sqlite3");
const { OneDriveService } = require("../src/services/oneDriveService");
const { CloudBackupService } = require("../src/services/cloudBackupService");

const ID = "12345678-90ab-cdef-1234-567890abcdef";

const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(Buffer.from(s).toString("base64")),
  decryptString: (b) => Buffer.from(String(b), "base64").toString(),
};

// A real (tiny) database file that passes the backup check, optionally padded to a size.
function backupFile(name = "2026-10-29_10-00-00.db", padBytes = 0) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lim-od-bk-"));
  const file = path.join(dir, name);
  const db = new Database(file);
  db.exec("CREATE TABLE products(id); CREATE TABLE customers(id); CREATE TABLE sale_issues(id); CREATE TABLE settings(key, value); CREATE TABLE pad(b BLOB);");
  if (padBytes) db.prepare("INSERT INTO pad VALUES (?)").run(Buffer.alloc(padBytes, 1));
  db.close();
  return file;
}

const jsonResponse = (body, status = 200, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] || null }, json: async () => body, arrayBuffer: async () => Buffer.from(body && body.__raw ? body.__raw : "") });

function make(handler, extra = {}) {
  const store = { onedrive_client_id: "", drive_backup_retention: "30" };
  const calls = { opened: [], requests: [] };
  const service = new OneDriveService({
    safeStorage,
    userDataPath: fs.mkdtempSync(path.join(os.tmpdir(), "lim-od-")),
    backupDir: fs.mkdtempSync(path.join(os.tmpdir(), "lim-od-dir-")),
    settings: { getSetting: (k) => store[k] || "", updateSettings: (o) => Object.assign(store, o) },
    sleep: async () => {},
    shell: {
      openExternal: async (url) => {
        calls.opened.push(url);
        const u = new URL(url);
        setTimeout(() => http.get(`${u.searchParams.get("redirect_uri")}/?code=abc&state=${u.searchParams.get("state")}`).on("error", () => {}), 20);
      },
    },
    fetch: async (url, opts = {}) => { calls.requests.push({ url: String(url), opts }); return handler(String(url), opts, calls); },
    ...extra,
  });
  store.onedrive_client_id = ID;
  return { service, store, calls };
}

const idToken = "x." + Buffer.from(JSON.stringify({ email: "owner@outlook.com" })).toString("base64url") + ".y";
const tokenOk = (extra = {}) => jsonResponse({ access_token: "AT1", refresh_token: "RT1", expires_in: 3600, id_token: idToken, ...extra });

async function connected(handler, extra) {
  const t = make(async (url, opts, calls) => (url.endsWith("/oauth2/v2.0/token") && String(opts.body).includes("authorization_code")) ? tokenOk() : handler(url, opts, calls), extra);
  await t.service.connect();
  t.calls.requests.length = 0;
  return t;
}

test("connect: opens Microsoft with the client id and PKCE, sends no secret, and shows the account", async () => {
  const t = make(async () => tokenOk());
  const status = await t.service.connect();
  assert.strictEqual(status.connected, true);
  assert.strictEqual(status.account, "owner@outlook.com");
  const url = new URL(t.calls.opened[0]);
  assert.strictEqual(url.hostname, "login.microsoftonline.com");
  assert.strictEqual(url.searchParams.get("client_id"), ID);
  assert.strictEqual(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(url.searchParams.get("scope"), /Files\.ReadWrite\.AppFolder/);
  assert.match(url.searchParams.get("scope"), /offline_access/);
  assert.match(url.searchParams.get("redirect_uri"), /^http:\/\/localhost:\d+$/);
  const body = t.calls.requests[0].opts.body.toString();
  assert.match(body, /code_verifier=/);
  assert.doesNotMatch(body, /client_secret/);
});

test("connect asks for the client id first", async () => {
  const t = make(async () => tokenOk());
  t.store.onedrive_client_id = "";
  const cfg = require("../src/config/microsoftClient");
  const keep = cfg.clientId; cfg.clientId = "";
  try { await assert.rejects(() => t.service.connect(), /client\) ID/); } finally { cfg.clientId = keep; }
});

test("a Microsoft error becomes a plain sentence", async () => {
  const t = make(async () => jsonResponse({ error: "invalid_request", error_description: "AADSTS700016: Application not found in the directory" }, 400));
  await assert.rejects(() => t.service.connect(), /does not know this Client ID/);
});

test("the refresh token is replaced every time it is used", async () => {
  const t = await connected(async (url, opts) => {
    if (url.endsWith("/token") && String(opts.body).includes("refresh_token")) return jsonResponse({ access_token: "AT2", refresh_token: "RT2", expires_in: 3600 });
    return jsonResponse({ value: [] });
  });
  const auth = t.service._readAuth();
  auth.expires_at = Date.now() - 1000;
  t.service._saveAuth(auth);
  await t.service.listBackups();
  assert.strictEqual(t.service._readAuth().refresh_token, "RT2");
  assert.strictEqual(t.service._readAuth().account, "owner@outlook.com");
});

test("a revoked sign-in disconnects and tells the owner to reconnect", async () => {
  const t = await connected(async (url) => jsonResponse({ error: "invalid_grant", error_description: "AADSTS70008" }, 400));
  const auth = t.service._readAuth(); auth.expires_at = 0; t.service._saveAuth(auth);
  await assert.rejects(() => t.service.listBackups(), /Connect OneDrive again/);
  assert.strictEqual(t.service.status().connected, false);
});

test("a small backup is uploaded in one call to the app folder and replaces a same-name file", async () => {
  const file = backupFile();
  const t = await connected(async (url) => {
    if (url.includes("/content")) return jsonResponse({ id: "F1", name: "LIMBackup-2026-10-29_10-00-00.db", size: fs.statSync(file).size }, 201);
    return jsonResponse({ value: [] });
  });
  const r = await t.service.uploadBackup(file);
  const put = t.calls.requests.find((c) => c.opts.method === "PUT");
  assert.match(put.url, /\/me\/drive\/special\/approot:\/LIMBackup-2026-10-29_10-00-00\.db:\/content\?@microsoft\.graph\.conflictBehavior=replace$/);
  assert.strictEqual(put.opts.headers.Authorization, "Bearer AT1");
  assert.strictEqual(r.name, "LIMBackup-2026-10-29_10-00-00.db");
  assert.ok(t.store.drive_last_upload_at);
  assert.strictEqual(t.store.drive_last_error, "");
});

test("a big backup uses an upload session in chunks and sends no token to the session address", async () => {
  const file = backupFile("auto-2026-10-29.db", 11 * 1024 * 1024);
  const size = fs.statSync(file).size;
  const t = await connected(async (url, opts) => {
    if (url.endsWith(":/createUploadSession")) return jsonResponse({ uploadUrl: "https://upload.example/session/1" });
    if (url === "https://upload.example/session/1") {
      const range = opts.headers["Content-Range"];
      return /-(\d+)\/(\d+)$/.exec(range)[1] === String(size - 1) ? jsonResponse({ id: "F2", name: "LIMBackup-auto-2026-10-29.db", size }, 201) : jsonResponse({}, 202);
    }
    return jsonResponse({ value: [] });
  });
  const r = await t.service.uploadBackup(file);
  const chunks = t.calls.requests.filter((c) => c.url === "https://upload.example/session/1");
  assert.strictEqual(chunks.length, 2);
  assert.match(chunks[0].opts.headers["Content-Range"], /^bytes 0-10485759\//);
  assert.strictEqual(chunks[0].opts.headers.Authorization, undefined);
  assert.strictEqual(r.id, "F2");
});

test("an invalid file is never uploaded", async () => {
  const bad = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lim-od-bad-")), "x.db");
  fs.writeFileSync(bad, "not a database");
  const t = await connected(async () => jsonResponse({}));
  await assert.rejects(() => t.service.uploadBackup(bad), /Refusing to upload/);
  assert.strictEqual(t.calls.requests.length, 0);
});

test("only the newest N online copies are kept", async () => {
  const file = backupFile();
  const old = Array.from({ length: 3 }, (_, i) => ({ id: "O" + i, name: `LIMBackup-2026-0${i + 1}-01.db`, size: 1, createdDateTime: `2026-0${i + 1}-01T00:00:00Z`, file: {} }));
  const t = await connected(async (url, opts) => {
    if (opts.method === "DELETE") return jsonResponse({}, 204);
    if (url.includes("/content")) return jsonResponse({ id: "NEW", name: "x", size: 5 }, 201);
    return jsonResponse({ value: [...old, { id: "NEW", name: "LIMBackup-new.db", size: 5, createdDateTime: "2026-10-29T00:00:00Z", file: {} }] });
  });
  t.store.drive_backup_retention = "2";
  await t.service.uploadBackup(file);
  const deleted = t.calls.requests.filter((c) => c.opts.method === "DELETE").map((c) => decodeURIComponent(c.url.split("/").pop()));
  assert.deepStrictEqual(deleted.sort(), ["O0", "O1"]);
});

test("list shows only this app's backups, newest first", async () => {
  const t = await connected(async () => jsonResponse({ value: [
    { id: "a", name: "LIMBackup-1.db", size: 1, createdDateTime: "2026-01-01T00:00:00Z", file: {} },
    { id: "b", name: "holiday.jpg", size: 1, createdDateTime: "2026-05-01T00:00:00Z", file: {} },
    { id: "c", name: "LIMBackup-2.db", size: 2, createdDateTime: "2026-03-01T00:00:00Z", file: {} },
    { id: "d", name: "LIMBackup-folder.db", createdDateTime: "2026-04-01T00:00:00Z", folder: {} },
  ] }));
  assert.deepStrictEqual((await t.service.listBackups()).map((f) => f.id), ["c", "a"]);
});

test("a full OneDrive says so in plain words", async () => {
  const file = backupFile();
  const t = await connected(async (url) => url.includes("/content") ? jsonResponse({ error: { message: "Insufficient Storage Available" } }, 507) : jsonResponse({ value: [] }));
  await assert.rejects(() => t.service.uploadBackup(file), /OneDrive is full/);
});

test("download saves a checked copy and refuses a damaged one", async () => {
  const good = fs.readFileSync(backupFile());
  const t = await connected(async (url) => {
    if (url.includes("/children")) return jsonResponse({ value: [{ id: "G", name: "LIMBackup-ok.db", size: good.length, createdDateTime: "2026-01-01T00:00:00Z", file: {} }, { id: "B", name: "LIMBackup-bad.db", size: 3, createdDateTime: "2026-01-02T00:00:00Z", file: {} }] });
    return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => (url.includes("/G/") ? good : Buffer.from("junk")) };
  });
  const r = await t.service.downloadBackup("G");
  assert.ok(fs.existsSync(r.path));
  await assert.rejects(() => t.service.downloadBackup("B"), /failed verification/);
});

test("429 waits and retries", async () => {
  let n = 0;
  const t = await connected(async () => (++n === 1 ? jsonResponse({}, 429, { "retry-after": "1" }) : jsonResponse({ value: [] })));
  assert.deepStrictEqual(await t.service.listBackups(), []);
  assert.strictEqual(n, 2);
});

// ---------------- the chooser ----------------

function cloud(over = {}) {
  const store = { cloud_provider: "", cloud_auto_upload: "1", cloud_auto_hours: "6", drive_backup_retention: "30", ...over.store };
  const fake = (name, connected) => ({ label: name, clientId: "", status: () => ({ provider: name, label: name, configured: true, connected }), saveClientSecret() {} });
  const svc = new CloudBackupService({
    settings: { getSetting: (k) => store[k] || "", updateSettings: (o) => Object.assign(store, o) },
    services: { onedrive: () => fake("OneDrive", !!over.od), google: () => fake("Google Drive", !!over.google), b2: () => fake("Backblaze B2", !!over.b2) },
  });
  return { svc, store };
}

test("an already-connected Google Drive keeps working; an explicit choice wins", () => {
  assert.strictEqual(cloud({ google: true }).svc.provider(), "google");
  assert.strictEqual(cloud({ google: true, store: { cloud_provider: "onedrive" } }).svc.provider(), "onedrive");
  assert.strictEqual(cloud({ store: { cloud_provider: "none" } }).svc.ready(), false);
});

test("settings: automatic upload defaults on, and every choice is validated and saved", () => {
  const { svc, store } = cloud();
  assert.strictEqual(svc.autoUpload(), true);
  assert.strictEqual(svc.autoHours(), 6);
  svc.saveSettings({ autoUpload: false, autoHours: 99, retention: 0 });
  assert.strictEqual(store.cloud_auto_upload, "0");
  assert.strictEqual(store.cloud_auto_hours, "48");
  assert.strictEqual(store.drive_backup_retention, "30");
  assert.throws(() => svc.saveSettings({ provider: "onedrive", clientId: "not-a-guid" }), /8-4-4-4-12/);
  svc.saveSettings({ provider: "onedrive", clientId: ID });
  assert.strictEqual(store.onedrive_client_id, ID);
  assert.throws(() => svc.saveSettings({ provider: "google", clientId: "abc" }), /valid Google/);
});

test("the client id cannot be changed while connected", () => {
  const { svc } = cloud({ od: true });
  assert.throws(() => svc.saveSettings({ provider: "onedrive", clientId: ID }), /Disconnect/);
});
