#!/usr/bin/env node
// Vendor-only tool. NOT shipped in the installer (excluded in package.json "build.files").
//   node tools/vendor-keygen.js --init <dir>               create a key pair; keep private.pem safe
//   node tools/vendor-keygen.js <installId> [private.pem]  print the activation key for one install
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");

function signInstallId(installId, privateKeyPem) {
  return crypto.sign(null, Buffer.from(String(installId)), privateKeyPem).toString("base64url");
}

function init(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  fs.writeFileSync(path.join(dir, "private.pem"), privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  const pub = publicKey.export({ type: "spki", format: "pem" });
  fs.writeFileSync(path.join(dir, "public.pem"), pub);
  console.log(`Created ${path.join(dir, "private.pem")} (keep secret, back it up) and public.pem`);
  console.log("Paste public.pem into src/config/vendorPublicKey.js before building the installer.");
}

if (require.main === module) {
  const [a, b] = process.argv.slice(2);
  if (a === "--init") {
    init(b || path.join(os.homedir(), "LaptopInventoryVendor"));
  } else if (a) {
    const keyFile = b || path.join(os.homedir(), "LaptopInventoryVendor", "private.pem");
    console.log(signInstallId(a, fs.readFileSync(keyFile, "utf8")));
  } else {
    console.log("Usage: vendor-keygen.js --init [dir] | <installId> [private.pem]");
  }
}

module.exports = { signInstallId };
