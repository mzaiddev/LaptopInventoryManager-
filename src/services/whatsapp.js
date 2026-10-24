// Pure helpers for the WhatsApp statement flow (the Electron parts live in statementShare.js).

// Digits only, with country code, or null when it cannot be a real number.
function normalizePhone(raw, countryCode = "92") {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  let digits = text.replace(/\D/g, "");
  if (!digits) return null;
  if (text.startsWith("+")) {
    // already international
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith(countryCode) && digits.length >= countryCode.length + 8) {
    // already has the country code
  } else if (digits.startsWith("0")) {
    digits = countryCode + digits.slice(1);
  } else {
    digits = countryCode + digits;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

// [desktop app link, web link]
function whatsappLinks(phone, text) {
  const q = encodeURIComponent(text);
  return [`whatsapp://send?phone=${phone}&text=${q}`, `https://wa.me/${phone}?text=${q}`];
}

function safeFileName(name) {
  const cleaned = String(name || "").replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 80);
  return cleaned || "statement";
}

module.exports = { normalizePhone, whatsappLinks, safeFileName };
