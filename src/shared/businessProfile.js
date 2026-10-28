// Which product fields a shop uses. A laptop dealer needs serial numbers and warranty; a general store does not.
// Hidden fields are only hidden: their stored data is kept. Usable from the renderer (<script>) and from node tests.
(function (root) {
  const FIELDS = ["model", "serial", "warranty", "location", "condition"];

  const PRESETS = [
    { id: "laptop_dealer", label: "Laptop & computer dealer", fields: { model: true, serial: true, warranty: true, location: true, condition: true } },
    { id: "general_store", label: "General store", fields: { model: false, serial: false, warranty: false, location: true, condition: false } },
    { id: "custom", label: "Custom", fields: null },
  ];

  // Anything but a literal "0" means shown, so a missing setting keeps the field.
  function fieldsFromSettings(settings) {
    const s = settings || {};
    const out = {};
    for (const f of FIELDS) out[f] = s["show_" + f] !== "0";
    return out;
  }

  function settingsForPreset(id) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p || !p.fields) throw new Error("Unknown business type");
    const out = { business_type: id };
    for (const f of FIELDS) out["show_" + f] = p.fields[f] ? "1" : "0";
    return out;
  }

  const api = { FIELDS, PRESETS, fieldsFromSettings, settingsForPreset };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BusinessProfile = api;
})(typeof window !== "undefined" ? window : globalThis);
