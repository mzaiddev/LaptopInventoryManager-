// Small CSV reader/writer shared by imports and exports. Usable from the renderer (<script>) and from node tests.
(function (root) {
  // Rows of cells. Handles quotes, commas and line breaks inside quotes, CRLF and a leading BOM; skips blank lines.
  function parse(text) {
    const src = String(text || "").replace(/^﻿/, "");
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    const endRow = () => {
      row.push(cell);
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    };
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") endRow();
      else if (ch === "\r") { if (src[i + 1] === "\n") i++; endRow(); }
      else cell += ch;
    }
    if (quoted) throw new Error("The CSV contains an unfinished quoted field.");
    if (cell !== "" || row.length) endRow();
    return rows;
  }

  // First row is the header: "Customer Name" becomes customer_name. Cells are trimmed.
  function toObjects(rows) {
    if (!rows.length) return [];
    const keys = rows[0].map((h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""));
    return rows.slice(1).map((r) => {
      const o = {};
      keys.forEach((k, i) => { if (k) o[k] = String(r[i] === undefined ? "" : r[i]).trim(); });
      return o;
    });
  }

  // Text that a spreadsheet would run as a formula gets a leading apostrophe. Real numbers are left alone.
  function cellText(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return String(v);
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function stringify(rows) {
    return rows.map((r) => r.map(cellText).join(",") + "\r\n").join("");
  }

  const api = { parse, toObjects, stringify };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Csv = api;
})(typeof window !== "undefined" ? window : globalThis);
