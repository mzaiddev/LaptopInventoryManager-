const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { tempDir } = require("./helpers");
const { WhatsAppLink, GAP, BREAK, BREAK_EVERY } = require("../src/services/whatsappLink");

// A fake WhatsApp connection that records what the app does with it.
function fakeBaileys() {
  const f = { socks: [], sent: [], known: new Set(["923001234567@s.whatsapp.net"]) };
  f.DisconnectReason = { loggedOut: 401, badSession: 500, connectionReplaced: 440, restartRequired: 515 };
  f.useMultiFileAuthState = async (dir) => ({ state: { dir }, saveCreds: () => {} });
  f.fetchLatestBaileysVersion = async () => ({ version: [2, 3000, 1] });
  f.makeWASocket = () => {
    const handlers = {};
    const sock = {
      user: { id: "923009999999:7@s.whatsapp.net" },
      ev: { on: (name, fn) => (handlers[name] = fn) },
      emit: (u) => handlers["connection.update"](u),
      onWhatsApp: async (jid) => [{ jid, exists: f.known.has(jid) }],
      sendPresenceUpdate: async () => {},
      sendMessage: async (jid, msg) => f.sent.push({ jid, msg }),
      logout: async () => { sock.loggedOut = true; },
      end: () => { sock.ended = true; },
    };
    f.socks.push(sock);
    return sock;
  };
  return f;
}

function make(opts = {}) {
  const dir = tempDir("wa-");
  const baileys = opts.baileys || fakeBaileys();
  const sleeps = [];
  let clock = 1_000_000;
  const link = new WhatsAppLink({
    sessionDir: path.join(dir, "session"),
    loadBaileys: async () => baileys,
    toQrImage: async (t) => `data:image/png;base64,${t}`,
    sleep: async (ms) => { sleeps.push(ms); clock += ms; },
    random: () => 0.5,
    now: () => clock,
    ...opts.deps,
  });
  const pdf = path.join(dir, "a.pdf");
  fs.writeFileSync(pdf, "%PDF-1.4 test");
  return { link, baileys, sleeps, pdf, dir, tick: (ms) => (clock += ms) };
}

async function linked(opts) {
  const t = make(opts);
  await t.link.connect();
  t.baileys.socks[0].emit({ connection: "open" });
  await new Promise((r) => setImmediate(r));
  return t;
}

const settle = () => new Promise((r) => setImmediate(r));

test("a QR code is shown as an image, then linking shows the phone number", async () => {
  const { link, baileys } = make();
  const seen = [];
  link.onChange((s) => seen.push(s.state));
  await link.connect();
  baileys.socks[0].emit({ qr: "QR-ONE" });
  await settle();
  assert.strictEqual(link.getStatus().state, "qr");
  assert.strictEqual(link.getStatus().qr, "data:image/png;base64,QR-ONE");
  baileys.socks[0].emit({ qr: "QR-TWO" }); // the code rotates every few seconds
  await settle();
  assert.strictEqual(link.getStatus().qr, "data:image/png;base64,QR-TWO");
  baileys.socks[0].emit({ connection: "open" });
  await settle();
  assert.deepStrictEqual(
    { state: link.state, qr: link.qr, phone: link.phone },
    { state: "linked", qr: null, phone: "923009999999" },
  );
  assert.deepStrictEqual(seen.slice(0, 2), ["connecting", "qr"]);
});

test("right after the scan WhatsApp asks for a restart and the app reconnects by itself", async () => {
  const t = make();
  await t.link.connect();
  fs.mkdirSync(t.link.sessionDir, { recursive: true });
  fs.writeFileSync(path.join(t.link.sessionDir, "creds.json"), JSON.stringify({ registered: true }));
  t.baileys.socks[0].emit({ connection: "close", lastDisconnect: { error: { output: { statusCode: 515 } } } });
  await settle();
  assert.strictEqual(t.baileys.socks.length, 2);
  t.baileys.socks[1].emit({ connection: "open" });
  await settle();
  assert.strictEqual(t.link.state, "linked");
});

test("when the phone removes the link the saved session is deleted and sending stops", async () => {
  const t = await linked();
  fs.mkdirSync(t.link.sessionDir, { recursive: true });
  fs.writeFileSync(path.join(t.link.sessionDir, "creds.json"), "{}");
  t.baileys.socks[0].emit({ connection: "close", lastDisconnect: { error: { output: { statusCode: 401 } } } });
  await settle();
  assert.strictEqual(t.link.state, "unlinked");
  assert.match(t.link.error, /unlinked on the phone/);
  assert.strictEqual(fs.existsSync(t.link.sessionDir), false);
  await assert.rejects(t.link.sendPdf({ phone: "0300-1234567", filePath: t.pdf }), { code: "NOT_LINKED" });
});

test("a QR code nobody scanned does not reconnect forever", async () => {
  const t = make();
  await t.link.connect();
  t.baileys.socks[0].emit({ qr: "X" });
  await settle();
  t.baileys.socks[0].emit({ connection: "close", lastDisconnect: { error: { output: { statusCode: 408 } } } });
  await settle();
  assert.strictEqual(t.link.state, "unlinked");
  assert.match(t.link.error, /not scanned/);
  assert.strictEqual(t.baileys.socks.length, 1);
});

test("a dropped connection on a linked PC reconnects with a growing wait", async () => {
  const t = await linked();
  fs.mkdirSync(t.link.sessionDir, { recursive: true });
  fs.writeFileSync(path.join(t.link.sessionDir, "creds.json"), JSON.stringify({ registered: true }));
  t.baileys.socks[0].emit({ connection: "close", lastDisconnect: { error: { output: { statusCode: 428 } } } });
  await settle();
  assert.deepStrictEqual(t.sleeps, [4000]);
  assert.strictEqual(t.baileys.socks.length, 2);
});

test("sends the PDF with the caption to a normalised number, as a document", async () => {
  const t = await linked();
  await t.link.sendPdf({ phone: "0300-1234567", filePath: t.pdf, fileName: "Ali.pdf", caption: "Dear Ali" });
  assert.strictEqual(t.baileys.sent.length, 1);
  const { jid, msg } = t.baileys.sent[0];
  assert.strictEqual(jid, "923001234567@s.whatsapp.net");
  assert.strictEqual(msg.mimetype, "application/pdf");
  assert.strictEqual(msg.fileName, "Ali.pdf");
  assert.strictEqual(msg.caption, "Dear Ali");
  assert.ok(Buffer.isBuffer(msg.document) && msg.document.length > 0);
});

test("a number that is wrong or not on WhatsApp is refused before anything is sent", async () => {
  const t = await linked();
  await assert.rejects(t.link.sendPdf({ phone: "abc", filePath: t.pdf }), { code: "INVALID_NUMBER" });
  await assert.rejects(t.link.sendPdf({ phone: "0311-9999999", filePath: t.pdf }), { code: "NOT_ON_WHATSAPP" });
  assert.strictEqual(t.baileys.sent.length, 0);
});

test("messages are spaced out, and a long rest comes every 20 messages", async () => {
  const t = await linked();
  for (let i = 0; i < BREAK_EVERY + 1; i++) {
    await t.link.sendPdf({ phone: "0300-1234567", filePath: t.pdf });
  }
  assert.strictEqual(t.baileys.sent.length, BREAK_EVERY + 1);
  const gapMid = Math.round((GAP[0] + GAP[1]) / 2);
  const breakMid = Math.round((BREAK[0] + BREAK[1]) / 2);
  // sleeps include a short "typing" pause before each message; keep only the real gaps
  const gaps = t.sleeps.filter((ms) => ms >= GAP[0] - 3000);
  assert.ok(gaps.some((ms) => Math.abs(ms - breakMid) < 4000), "one long rest after 20 messages");
  assert.ok(gaps.filter((ms) => Math.abs(ms - gapMid) < 4000).length >= 15, "normal gaps between the others");
});

test("after a long idle time the next message goes out at once", async () => {
  const t = await linked();
  await t.link.sendPdf({ phone: "0300-1234567", filePath: t.pdf });
  t.sleeps.length = 0;
  t.tick(11 * 60 * 1000);
  await t.link.sendPdf({ phone: "0300-1234567", filePath: t.pdf });
  assert.ok(t.sleeps.every((ms) => ms <= 2500), "only the typing pause, no gap");
});

test("two sends started together still go out one at a time, in order", async () => {
  const t = await linked();
  const order = [];
  const a = t.link.sendPdf({ phone: "0300-1234567", filePath: t.pdf, caption: "A" }).then(() => order.push("A"));
  const b = t.link.sendPdf({ phone: "0300-1234567", filePath: t.pdf, caption: "B" }).then(() => order.push("B"));
  await Promise.all([a, b]);
  assert.deepStrictEqual(order, ["A", "B"]);
  assert.deepStrictEqual(t.baileys.sent.map((s) => s.msg.caption), ["A", "B"]);
});

test("unlink logs out, deletes the session and clears the status", async () => {
  const t = await linked();
  fs.mkdirSync(t.link.sessionDir, { recursive: true });
  fs.writeFileSync(path.join(t.link.sessionDir, "creds.json"), "{}");
  await t.link.unlink();
  assert.strictEqual(t.baileys.socks[0].loggedOut, true);
  assert.strictEqual(fs.existsSync(t.link.sessionDir), false);
  assert.deepStrictEqual(t.link.getStatus(), { state: "unlinked", qr: null, phone: null, error: null, saved: false });
});

test("app start reconnects only when this PC was linked before", async () => {
  const none = make();
  none.link.autoStart();
  await settle();
  assert.strictEqual(none.baileys.socks.length, 0);

  const was = make();
  fs.mkdirSync(was.link.sessionDir, { recursive: true });
  fs.writeFileSync(path.join(was.link.sessionDir, "creds.json"), JSON.stringify({ registered: true }));
  was.link.autoStart();
  await settle();
  await settle();
  assert.strictEqual(was.baileys.socks.length, 1);
});

test("a saved link shows its number and 'saved' before the connection is back, and reconnect keeps it", async () => {
  const t = make();
  fs.mkdirSync(t.link.sessionDir, { recursive: true });
  fs.writeFileSync(path.join(t.link.sessionDir, "creds.json"), JSON.stringify({ registered: true, me: { id: "923001234567:5@s.whatsapp.net" } }));
  const s = t.link.getStatus();
  assert.strictEqual(s.saved, true);
  assert.strictEqual(s.phone, "923001234567");
  await t.link.reconnect();
  await settle();
  assert.strictEqual(t.baileys.socks.length, 1);
  assert.strictEqual(fs.existsSync(path.join(t.link.sessionDir, "creds.json")), true);
});
