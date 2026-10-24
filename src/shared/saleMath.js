// Usable from the renderer (<script>) and from node (services, tests).
(function (root) {
  function roundMoney(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return (Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * 100)) / 100;
  }

  // Pure sale arithmetic. Item discounts come off each line, then the sale-level
  // discount (flat amount or percent) comes off the subtotal.
  function computeSaleTotals(items, discountType = "none", discountValue = 0) {
    if (!Array.isArray(items) || items.length === 0) throw new Error("A sale needs at least one item");
    if (!["none", "amount", "percent"].includes(discountType)) throw new Error("Invalid discount type");

    const lines = items.map((it) => {
      if (!(it.quantity > 0)) throw new Error("Quantity must be greater than 0");
      if (!(it.unit_price >= 0)) throw new Error("Unit price cannot be negative");
      const discount = roundMoney(it.discount_amount || 0);
      if (discount < 0) throw new Error("Item discount cannot be negative");
      const gross = roundMoney(it.quantity * it.unit_price);
      if (discount > gross) throw new Error("Item discount cannot be more than the item total");
      return { gross, discount, net: roundMoney(gross - discount) };
    });

    const gross = roundMoney(lines.reduce((s, l) => s + l.gross, 0));
    const itemDiscount = roundMoney(lines.reduce((s, l) => s + l.discount, 0));
    const subtotal = roundMoney(gross - itemDiscount);

    let saleDiscount = 0;
    if (discountType === "percent") {
      if (!(discountValue >= 0 && discountValue <= 100)) throw new Error("Discount percent must be between 0 and 100");
      saleDiscount = roundMoney((subtotal * discountValue) / 100);
    } else if (discountType === "amount") {
      if (discountValue < 0) throw new Error("Discount cannot be negative");
      saleDiscount = roundMoney(discountValue);
      if (saleDiscount > subtotal) throw new Error("Sale discount cannot be more than the sale total");
    }

    return { gross, itemDiscount, subtotal, saleDiscount, total: roundMoney(subtotal - saleDiscount), lines };
  }


  if (typeof module !== "undefined" && module.exports) module.exports = { computeSaleTotals };
  else root.computeSaleTotals = computeSaleTotals;
})(typeof window !== "undefined" ? window : globalThis);
