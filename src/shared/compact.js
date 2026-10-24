// Usable from the renderer (<script>) and from node tests.
(function (root) {
  function trim(n, decimals) {
    return String(Number(n.toFixed(decimals)));
  }

  function formatCompact(value) {
    if (value === null || value === undefined || value === "") return "-";
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    if (abs < 1000) return sign + trim(abs, 2);

    const units = [
      [1e3, "K"],
      [1e6, "M"],
      [1e9, "B"],
    ];
    // Round at 1 decimal; promote when rounding reaches the next unit (999,950 -> 1M).
    for (let i = 0; i < units.length; i++) {
      const [size, suffix] = units[i];
      const next = units[i + 1];
      if (next && abs >= next[0]) continue;
      const v = Math.round((abs / size) * 10 + 1e-9) / 10;
      if (next && v * size >= next[0]) continue;
      return sign + trim(v, 1) + suffix;
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { formatCompact };
  else root.formatCompact = formatCompact;
})(typeof window !== "undefined" ? window : globalThis);
