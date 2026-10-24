// Half away from zero, 2 decimals. EPSILON fixes 1.005 -> 1.01.
function roundMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return (Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * 100)) / 100;
}

module.exports = { roundMoney };
