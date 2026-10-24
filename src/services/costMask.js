// Purchase price is hidden from the screen unless the owner revealed it with the super-password.
function stripCost(data, visible) {
  if (visible || data === null || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map((d) => stripCost(d, false));
  const out = { ...data };
  if ("purchase_price" in out) out.purchase_price = null;
  for (const key of ["products", "damages"]) {
    if (Array.isArray(out[key])) out[key] = stripCost(out[key], false);
  }
  return out;
}

module.exports = { stripCost };
