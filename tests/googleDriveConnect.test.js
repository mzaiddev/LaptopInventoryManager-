const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { GoogleDriveService } = require("../src/services/googleDriveService");

// Stand-ins for Windows secure storage and the settings table, so no real Google account is needed.
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(Buffer.from(s).toString("base64")),
  decryptString: (b) => Buffer.from(String(b), "base64").toString(),
};

function makeService(extra = {}) {
  const store = { google_drive_client_id: "" };
  const calls = { opened: [], tokenBodies: [] };
  const service = new GoogleDriveService({
    safeStorage,
    userDataPath: fs.mkdtempSync(path.join(os.tmpdir(), "lim-drive-")),
    backupDir: os.tmpdir(),
    settings: {
      getSetting: (k) => store[k] || "",
      updateSettings: (o) => Object.assign(store, o),
    },
    shell: {
      openExternal: async (url) => {
        calls.opened.push(url);
        // Play the part of the browser: Google redirects back to the local port with a code.
        const u = new URL(url);
        setTimeout(() => {
          http.get(`${u.searchParams.get("redirect_uri")}?code=abc&state=${u.searchParams.get("state")}`).on("error", () => {});
        }, 20);
      },
    },
    fetch: async (url, opts) => {
      calls.tokenBodies.push(String(opts.body));
      return { ok: true, json: async () => ({ refresh_token: "r1", access_token: "a1", expires_in: 3600 }) };
    },
    ...extra,
  });
  return { service, store, calls };
}

test("the client secret is saved encrypted and never shown back", () => {
  const { service } = makeService();
  assert.strictEqual(service.status().secretSaved, false);
  service.saveClientSecret("GOCSPX-abcdefghijk");
  assert.strictEqual(service.status().secretSaved, true);
  assert.ok(!fs.readFileSync(service.secretPath, "utf8").includes("GOCSPX-abcdefghijk"));
  assert.strictEqual(service.clientSecret, "GOCSPX-abcdefghijk");
  assert.strictEqual(JSON.stringify(service.status()).includes("GOCSPX"), false);
});

test("an empty secret box keeps the saved secret", () => {
  const { service } = makeService();
  service.saveClientSecret("GOCSPX-abcdefghijk");
  service.saveClientSecret("");
  assert.strictEqual(service.clientSecret, "GOCSPX-abcdefghijk");
});

test("a secret with spaces or too short is refused", () => {
  const { service } = makeService();
  assert.throws(() => service.saveClientSecret("not right"), /does not look right/);
  assert.throws(() => service.saveClientSecret("abc"), /does not look right/);
});

test("connect says what is missing", async () => {
  const { service, store } = makeService();
  const saved = require("../src/config/googleClient");
  const keep = { ...saved };
  saved.clientId = ""; saved.clientSecret = "";
  try {
    await assert.rejects(() => service.connect(), /Client ID/);
    store.google_drive_client_id = "1-x.apps.googleusercontent.com";
    await assert.rejects(() => service.connect(), /Client secret/);
  } finally { Object.assign(saved, keep); }
});

test("connect opens Google with the typed client id and trades the code with the secret", async () => {
  const { service, store, calls } = makeService();
  store.google_drive_client_id = "123-abc.apps.googleusercontent.com";
  service.saveClientSecret("GOCSPX-abcdefghijk");
  const status = await service.connect();
  assert.strictEqual(status.connected, true);
  assert.match(calls.opened[0], /accounts\.google\.com/);
  assert.match(calls.opened[0], /client_id=123-abc\.apps\.googleusercontent\.com/);
  assert.match(calls.opened[0], /drive\.file/);
  assert.match(calls.tokenBodies[0], /client_secret=GOCSPX-abcdefghijk/);
  assert.match(calls.tokenBodies[0], /code=abc/);
});
