const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const { freshDb } = require("./helpers");
const auth = require("../src/services/authService");
const vendor = require("../src/services/vendorService");
const { signInstallId } = require("../tools/vendor-keygen");

const pair = () => crypto.generateKeyPairSync("ed25519");
const pem = (k, type) => k.export({ type, format: "pem" });

function setup() {
  freshDb();
  auth._reset();
  const kp = pair();
  vendor._setPublicKey(pem(kp.publicKey, "spki"));
  return kp;
}

test("a key signed for this install verifies; another install's key does not", () => {
  const kp = setup();
  const id = auth.getInstallId();
  assert.strictEqual(vendor.verifyKey(signInstallId(id, pem(kp.privateKey, "pkcs8"))), true);
  assert.strictEqual(vendor.verifyKey(signInstallId("OTHER-ID", pem(kp.privateKey, "pkcs8"))), false);
  assert.strictEqual(vendor.verifyKey("garbage"), false);
});

test("a key from a different vendor key pair is rejected", () => {
  setup();
  const other = pair();
  const key = signInstallId(auth.getInstallId(), pem(other.privateKey, "pkcs8"));
  assert.strictEqual(vendor.verifyKey(key), false);
});

test("provision with a wrong key throws and leaves the owner unchanged", () => {
  setup();
  auth.setOwner({ username: "old", password: "oldpw1", superPassword: "oldsp1" });
  assert.throws(
    () => vendor.provision({ key: "bad", shopName: "S", username: "new", password: "newpw1", superPassword: "newsp1" }),
    /invalid key/i,
  );
  assert.strictEqual(auth.login("old", "oldpw1").ok, true);
});

test("provision with a valid key sets owner, passwords and shop name", () => {
  const kp = setup();
  const key = signInstallId(auth.getInstallId(), pem(kp.privateKey, "pkcs8"));
  vendor.provision({ key, shopName: "Zia Traders", username: "zia", password: "ziapw1", superPassword: "ziasp1" });
  assert.strictEqual(auth.login("zia", "ziapw1").ok, true);
  assert.strictEqual(auth.grantSuperOnce("ziasp1"), true);
  assert.strictEqual(require("../src/services/settingsService").getSetting("shop_name"), "Zia Traders");
});
