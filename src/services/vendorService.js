const crypto = require("crypto");
const authService = require("./authService");
const settingsService = require("./settingsService");

class VendorService {
  constructor() {
    this.publicKey = require("../config/vendorPublicKey");
  }

  _setPublicKey(pem) {
    this.publicKey = pem;
  }

  // The key is the vendor's signature over this install's id.
  verifyKey(key) {
    try {
      return crypto.verify(
        null,
        Buffer.from(authService.getInstallId()),
        this.publicKey,
        Buffer.from(String(key), "base64url"),
      );
    } catch {
      return false;
    }
  }

  provision({ key, shopName, username, password, superPassword }) {
    if (!this.verifyKey(key)) throw new Error("Invalid key");
    authService.setOwner({ username, password, superPassword });
    if (shopName && String(shopName).trim()) {
      settingsService.updateSettings({ shop_name: String(shopName).trim() });
    }
  }
}

module.exports = new VendorService();
