const test = require("node:test");
const assert = require("node:assert");
const profile = require("../src/shared/businessProfile");

test("every product field is shown by default, so existing shops see no change", () => {
  const f = profile.fieldsFromSettings({});
  assert.deepStrictEqual(f, { model: true, serial: true, warranty: true, location: true, condition: true });
});

test("settings switch single fields off, and only a literal 0 turns a field off", () => {
  const f = profile.fieldsFromSettings({ show_serial: "0", show_warranty: "0", show_model: "1", show_location: "", show_condition: undefined });
  assert.strictEqual(f.serial, false);
  assert.strictEqual(f.warranty, false);
  assert.strictEqual(f.model, true);
  assert.strictEqual(f.location, true);
  assert.strictEqual(f.condition, true);
});

test("a preset turns into the settings that store it", () => {
  assert.deepStrictEqual(profile.settingsForPreset("general_store"), {
    business_type: "general_store", show_model: "0", show_serial: "0", show_warranty: "0", show_location: "1", show_condition: "0",
  });
  assert.strictEqual(profile.settingsForPreset("laptop_dealer").show_serial, "1");
});

test("an unknown preset is refused", () => {
  assert.throws(() => profile.settingsForPreset("spaceship"), /business type/i);
});

test("the preset list tells the screen what to offer", () => {
  const ids = profile.PRESETS.map((p) => p.id);
  assert.ok(ids.includes("laptop_dealer"));
  assert.ok(ids.includes("general_store"));
  assert.ok(ids.includes("custom"));
});
