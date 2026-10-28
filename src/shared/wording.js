// Business-type wording: a general store says "Item" where a laptop dealer says "Product".
// Pure text rules; the screen layer (components/Wording.js) applies them to labels, never to saved data.
// Usable from the renderer (<script>) and from node tests.
(function (root) {
  const RULES = {
    general_store: [
      [/\bProducts\b/g, "Items"],
      [/\bProduct\b/g, "Item"],
      [/\bproducts\b/g, "items"],
      [/\bproduct\b/g, "item"],
    ],
  };

  function rewrite(text, businessType) {
    const rules = RULES[businessType];
    if (!rules || typeof text !== "string" || !text) return text;
    return rules.reduce((out, [re, to]) => out.replace(re, to), text);
  }

  const api = { rewrite, hasRules: (type) => !!RULES[type] };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WordingRules = api;
})(typeof window !== "undefined" ? window : globalThis);
