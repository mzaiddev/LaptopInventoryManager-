const test = require("node:test");
const assert = require("node:assert");
const { freshDb } = require("./helpers");
const auth = require("../src/services/authService");
const settings = require("../src/services/settingsService");

test("getAllSettings hides secrets from the renderer", () => {
  freshDb();
  auth.setOwner({ username: "o", password: "pppp", superPassword: "ssss" });
  assert.strictEqual(settings.getAllSettings().super_password_hash, undefined);
});

test("updateSettings cannot overwrite the super-password hash", () => {
  freshDb();
  auth.setOwner({ username: "o", password: "pppp", superPassword: "ssss" });
  settings.updateSettings({ super_password_hash: "x", shop_name: "Shop" });
  assert.strictEqual(auth.grantSuperOnce("ssss"), true);
  assert.strictEqual(settings.getAllSettings().shop_name, "Shop");
});
