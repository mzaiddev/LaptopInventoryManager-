const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const { B2Service } = require("../src/services/b2Service");
const { CloudBackupService } = require("../src/services/cloudBackupService");

const KEY_ID = "0051234567890ab0000000001";
const APP_KEY = "K005abcdefghijklmnopqrstuvwxyz1";

const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(Buffer.from(s).toString("base64")),
  decryptString: (b) => Buffer.from(String(b), "base64").toString(),
};

function backupFile(name = "2026-10-29_10-00-00.db") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lim-b2-bk-"));
  const file = path.join(dir, name);
  const db = new Database(file);
  db.exec("CREATE TABLE products(id); CREATE TABLE customers(id); CREATE TABLE sale_issues(id); CREATE TABLE settings(key, value);");
  db.close();
  return file;
}

const res = (body, status = 200, extra = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body, arrayBuffer: async () => Buffer.from(extra.raw || ""), headers: { get: () => null } });

const authBody = (over = {}) => ({
  accountId: "acc1", authorizationToken: "TOK1",
  apiInfo: { storageApi: { apiUrl: "https://api001.backblazeb2.com", downloadUrl: "https://f001.backblazeb2.com", allowed: { buckets: [{ id: "BID", name: "shop-backups" }], capabilities: ["listFiles", "readFiles", "writeFiles", "deleteFiles", "listBuckets"] }, ...over } },
});

function make(handler) {
  const store = { drive_backup_retention: "30" };
  const calls = [];
  const service = new B2Service({
    safeStorage,
    userDataPath: fs.mkdtempSync(path.join(os.tmpdir(), "lim-b2-")),
    backupDir: fs.mkdtempSync(path.join(os.tmpdir(), "lim-b2-dir-")),
    settings: { getSetting: (k) => store[k] || "", updateSettings: (o) => Object.assign(store, o) },
    sleep: async () => {},
    fetch: async (url, opts = {}) => { calls.push({ url: String(url), opts }); return handler(String(url), opts, calls); },
  });
  return { service, store, calls };
}

async function connected(handler) {
  const t = make(async (url, opts, calls) => (url.endsWith("/b2_authorize_account") ? res(authBody()) : handler(url, opts, calls)));
  t.service.saveCredentials({ keyId: KEY_ID, applicationKey: APP_KEY });
  await t.service.connect();
  t.calls.length = 0;
  return t;
}

test("keys are stored encrypted, the application key is never shown back", () => {
  const t = make(async () => res({}));
  t.service.saveCredentials({ keyId: KEY_ID, applicationKey: APP_KEY, bucket: "" });
  assert.ok(!fs.readFileSync(t.service.authPath, "utf8").includes(APP_KEY));
  const s = t.service.status();
  assert.strictEqual(s.configured, true);
  assert.strictEqual(s.secretSaved, true);
  assert.strictEqual(s.connected, false);
  assert.ok(!JSON.stringify(s).includes(APP_KEY));
  t.service.saveCredentials({ keyId: KEY_ID, applicationKey: "" });
  assert.strictEqual(t.service._read().appKey, APP_KEY);
});

test("keys with spaces or too short are refused", () => {
  const t = make(async () => res({}));
  assert.throws(() => t.service.saveCredentials({ keyId: "abc", applicationKey: APP_KEY }), /Key ID does not look right/);
  assert.throws(() => t.service.saveCredentials({ keyId: KEY_ID, applicationKey: "has a space inside" }), /Application Key does not look right/);
});

test("connect checks the keys with Backblaze and finds the one bucket", async () => {
  const t = make(async () => res(authBody()));
  t.service.saveCredentials({ keyId: KEY_ID, applicationKey: APP_KEY });
  const s = await t.service.connect();
  assert.strictEqual(s.connected, true);
  assert.strictEqual(s.account, "shop-backups");
  assert.strictEqual(t.calls.length, 1); // only the sign-in check, nothing uploaded
  assert.strictEqual(t.service.session.bucketId, "BID");
});

test("the authorize call uses Basic auth with the key id and application key", async () => {
  const t = make(async () => res(authBody()));
  t.service.saveCredentials({ keyId: KEY_ID, applicationKey: APP_KEY });
  await t.service.connect();
  const first = t.calls[0];
  assert.match(first.url, /\/b2api\/v4\/b2_authorize_account$/);
  assert.strictEqual(first.opts.headers.Authorization, "Basic " + Buffer.from(`${KEY_ID}:${APP_KEY}`).toString("base64"));
});

test("wrong keys, a key without write access, and a missing bucket each say what to fix", async () => {
  const bad = make(async () => res({ code: "unauthorized" }, 401));
  bad.service.saveCredentials({ keyId: KEY_ID, applicationKey: APP_KEY });
  await assert.rejects(() => bad.service.connect(), /did not accept that Key ID/);

  const readOnly = make(async () => res(authBody({ allowed: { buckets: [{ id: "B", name: "b" }], capabilities: ["listFiles", "readFiles"] } })));
  readOnly.service.saveCredentials({ keyId: KEY_ID, applicationKey: APP_KEY });
  await assert.rejects(() => readOnly.service.connect(), /missing permission to: writeFiles, deleteFiles/);

  const all = make(async () => res(authBody({ allowed: { buckets: null, capabilities: ["listFiles", "readFiles", "writeFiles", "deleteFiles", "listBuckets"] } })));
  all.service.saveCredentials({ keyId: KEY_ID, applicationKey: APP_KEY });
  await assert.rejects(() => all.service.connect(), /Type the bucket name/);
});

test("a key that covers all buckets works with the bucket name, and a public bucket is refused", async () => {
  const mk = (bucketType) => make(async (url) => (url.endsWith("/b2_authorize_account")
    ? res(authBody({ allowed: { buckets: null, capabilities: ["listFiles", "readFiles", "writeFiles", "deleteFiles", "listBuckets"] } }))
    : res({ buckets: [{ bucketId: "B9", bucketName: "mine", bucketType }] })));
  const ok = mk("allPrivate");
  ok.service.saveCredentials({ keyId: KEY_ID, applicationKey: APP_KEY, bucket: "mine" });
  await ok.service.connect();
  assert.strictEqual(ok.service.session.bucketId, "B9");
  const pub = mk("allPublic");
  pub.service.saveCredentials({ keyId: KEY_ID, applicationKey: APP_KEY, bucket: "mine" });
  await assert.rejects(() => pub.service.connect(), /is public/);
});

test("upload sends the file with its SHA1, then removes the old copy of the same name", async () => {
  const file = backupFile();
  const sha1 = crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
  const t = await connected(async (url, opts) => {
    if (url.endsWith("/b2_list_file_names")) {
      const body = JSON.parse(opts.body);
      return res(body.prefix === "LIMBackup-2026-10-29_10-00-00.db"
        ? { files: [{ fileId: "OLD", fileName: "LIMBackup-2026-10-29_10-00-00.db", contentLength: 1, uploadTimestamp: 1 }] }
        : { files: [{ fileId: "NEW", fileName: "LIMBackup-2026-10-29_10-00-00.db", contentLength: 9, uploadTimestamp: 2 }], nextFileName: null });
    }
    if (url.endsWith("/b2_get_upload_url")) return res({ uploadUrl: "https://pod.example/upload/1", authorizationToken: "UPTOK" });
    if (url === "https://pod.example/upload/1") return res({ fileId: "NEW", fileName: "LIMBackup-2026-10-29_10-00-00.db", contentLength: fs.statSync(file).size });
    if (url.endsWith("/b2_delete_file_version")) return res({});
    throw new Error("unexpected " + url);
  });
  const r = await t.service.uploadBackup(file);
  const up = t.calls.find((c) => c.url === "https://pod.example/upload/1");
  assert.strictEqual(up.opts.headers.Authorization, "UPTOK");
  assert.strictEqual(up.opts.headers["X-Bz-Content-Sha1"], sha1);
  assert.strictEqual(up.opts.headers["X-Bz-File-Name"], "LIMBackup-2026-10-29_10-00-00.db");
  assert.strictEqual(up.opts.headers["Content-Length"], String(fs.statSync(file).size));
  const deletes = t.calls.filter((c) => c.url.endsWith("/b2_delete_file_version")).map((c) => JSON.parse(c.opts.body).fileId);
  assert.deepStrictEqual(deletes, ["OLD"]);
  assert.strictEqual(r.id, "NEW");
  assert.ok(t.store.drive_last_upload_at);
});

test("a busy upload address is retried with a fresh one", async () => {
  const file = backupFile();
  let tries = 0;
  const t = await connected(async (url, opts) => {
    if (url.endsWith("/b2_list_file_names")) return res({ files: [] });
    if (url.endsWith("/b2_get_upload_url")) return res({ uploadUrl: "https://pod.example/u" + (++tries), authorizationToken: "T" + tries });
    if (url === "https://pod.example/u1") return res({ code: "service_unavailable" }, 503);
    if (url === "https://pod.example/u2") return res({ fileId: "F", fileName: "LIMBackup-x.db", contentLength: 1 });
    return res({});
  });
  const r = await t.service.uploadBackup(file);
  assert.strictEqual(r.id, "F");
  assert.strictEqual(tries, 2);
});

test("an expired token is renewed once and the call repeated", async () => {
  let listed = 0;
  const t = make(async (url) => {
    if (url.endsWith("/b2_authorize_account")) return res(authBody());
    if (url.endsWith("/b2_list_file_names")) return ++listed === 1 ? res({ code: "expired_auth_token" }, 401) : res({ files: [] });
    return res({});
  });
  t.service.saveCredentials({ keyId: KEY_ID, applicationKey: APP_KEY });
  await t.service.connect();
  assert.deepStrictEqual(await t.service.listBackups(), []);
  assert.strictEqual(listed, 2);
});

test("an invalid file is never uploaded", async () => {
  const bad = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lim-b2-bad-")), "x.db");
  fs.writeFileSync(bad, "not a database");
  const t = await connected(async () => res({}));
  await assert.rejects(() => t.service.uploadBackup(bad), /Refusing to upload/);
  assert.strictEqual(t.calls.length, 0);
});

test("only the newest N online copies are kept", async () => {
  const file = backupFile();
  const files = [1, 2, 3, 4].map((n) => ({ fileId: "F" + n, fileName: `LIMBackup-${n}.db`, contentLength: 1, uploadTimestamp: n * 1000 }));
  const t = await connected(async (url, opts) => {
    if (url.endsWith("/b2_list_file_names")) return res(JSON.parse(opts.body).prefix === "LIMBackup-" ? { files, nextFileName: null } : { files: [] });
    if (url.endsWith("/b2_get_upload_url")) return res({ uploadUrl: "https://pod.example/u", authorizationToken: "T" });
    if (url === "https://pod.example/u") return res({ fileId: "F5", fileName: "LIMBackup-5.db", contentLength: 1 });
    return res({});
  });
  t.store.drive_backup_retention = "2";
  await t.service.uploadBackup(file);
  const deleted = t.calls.filter((c) => c.url.endsWith("/b2_delete_file_version")).map((c) => JSON.parse(c.opts.body).fileId);
  assert.deepStrictEqual(deleted.sort(), ["F1", "F2"]);
});

test("list pages through results, newest first, only this app's files", async () => {
  const t = await connected(async (url, opts) => {
    const body = JSON.parse(opts.body);
    return body.startFileName
      ? res({ files: [{ fileId: "c", fileName: "LIMBackup-3.db", contentLength: 3, uploadTimestamp: 3000 }], nextFileName: null })
      : res({ files: [{ fileId: "a", fileName: "LIMBackup-1.db", contentLength: 1, uploadTimestamp: 1000 }, { fileId: "z", fileName: "LIMBackup-notes.txt", contentLength: 1, uploadTimestamp: 9000 }], nextFileName: "LIMBackup-2.db" });
  });
  assert.deepStrictEqual((await t.service.listBackups()).map((f) => f.id), ["c", "a"]);
});

test("a full free plan is explained", async () => {
  const file = backupFile();
  const t = await connected(async (url) => {
    if (url.endsWith("/b2_list_file_names")) return res({ files: [] });
    if (url.endsWith("/b2_get_upload_url")) return res({ uploadUrl: "https://pod.example/u", authorizationToken: "T" });
    return res({ code: "storage_cap_exceeded", message: "cap" }, 403);
  });
  await assert.rejects(() => t.service.uploadBackup(file), /storage limit reached/);
});

test("download fetches the file by bucket and name with the token, and checks it", async () => {
  const good = fs.readFileSync(backupFile());
  const t = await connected(async (url, opts) => {
    if (url.endsWith("/b2_list_file_names")) return res({ files: [{ fileId: "G", fileName: "LIMBackup-ok.db", contentLength: good.length, uploadTimestamp: 1 }, { fileId: "B", fileName: "LIMBackup-bad.db", contentLength: 3, uploadTimestamp: 2 }], nextFileName: null });
    return res({}, 200, { raw: url.includes("ok.db") ? good : "junk" });
  });
  const r = await t.service.downloadBackup("G");
  assert.ok(fs.existsSync(r.path));
  const get = t.calls.find((c) => c.url.includes("/file/"));
  assert.strictEqual(get.url, "https://f001.backblazeb2.com/file/shop-backups/LIMBackup-ok.db");
  assert.strictEqual(get.opts.headers.Authorization, "TOK1");
  await assert.rejects(() => t.service.downloadBackup("B"), /failed verification/);
});

test("disconnect keeps the keys filled in but stops uploads", async () => {
  const t = await connected(async () => res({}));
  const s = await t.service.disconnect();
  assert.strictEqual(s.connected, false);
  assert.strictEqual(s.configured, true);
});

// ---------------------------------------------------------------- the chooser

function cloud(over = {}) {
  const store = { cloud_provider: "", cloud_auto_upload: "1", cloud_auto_hours: "6", drive_backup_retention: "30", ...over.store };
  const saved = {};
  const fake = (name, connected) => ({ label: name, clientId: "kid", bucket: "", status: () => ({ provider: name, label: name, configured: true, connected }), saveCredentials: (c) => { saved.b2 = c; }, saveClientSecret() {} });
  const svc = new CloudBackupService({
    settings: { getSetting: (k) => store[k] || "", updateSettings: (o) => Object.assign(store, o) },
    services: { b2: () => fake("Backblaze B2", !!over.b2), google: () => fake("Google Drive", !!over.google), onedrive: () => fake("OneDrive", !!over.od) },
  });
  return { svc, store, saved };
}

test("Backblaze is suggested first; whatever is already connected keeps working", () => {
  assert.strictEqual(cloud().svc.provider(), "b2");
  assert.strictEqual(cloud({ google: true }).svc.provider(), "google");
  assert.strictEqual(cloud({ od: true }).svc.provider(), "onedrive");
  assert.strictEqual(cloud({ google: true, store: { cloud_provider: "b2" } }).svc.provider(), "b2");
});

test("Backblaze keys typed on the page are passed to the service, not stored in settings", () => {
  const { svc, store, saved } = cloud();
  svc.saveSettings({ provider: "b2", clientId: KEY_ID, clientSecret: APP_KEY, bucket: "mine" });
  assert.deepStrictEqual(saved.b2, { keyId: KEY_ID, applicationKey: APP_KEY, bucket: "mine" });
  assert.ok(!JSON.stringify(store).includes(APP_KEY));
  assert.strictEqual(store.cloud_provider, "b2");
});

test("Backblaze keys cannot be changed while connected", () => {
  const { svc } = cloud({ b2: true });
  assert.throws(() => svc.saveSettings({ provider: "b2", clientId: "other-key-id-123", clientSecret: "" }), /Disconnect Backblaze/);
  assert.doesNotThrow(() => svc.saveSettings({ provider: "b2", autoUpload: false }));
});
