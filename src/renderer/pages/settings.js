// Settings Page
const SettingsPage = {
  async load() {
    const content = document.getElementById("page-content");
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Settings</h1>
          <p>Configure your application</p>
        </div>
        <button class="btn btn-primary" onclick="SettingsPage.saveSettings()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
          </svg>
          Save Settings
        </button>
      </div>
      <div class="card" style="margin-bottom:24px;">
        <div class="card-header"><h3>Shop Information</h3></div>
        <div class="card-body">
          <div id="settings-form">
            <div class="loading"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    `;

    await this.loadSettings();
  },

  async refresh() {
    await this.loadSettings();
  },

  async loadSettings() {
    const container = document.getElementById("settings-form");
    if (!container) return;

    try {
      const result = await window.api.getSettings();
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${result.error}</p></div>`;
        return;
      }

      const settings = result.data;
      container.innerHTML = `
        <form id="settings-form-fields" onsubmit="return false;">
          <div class="form-row">
            <div class="form-group">
              <label>Shop Name</label>
              <input type="text" class="form-control" id="set-shop-name" value="${this.escapeHtml(settings.shop_name || "")}">
              <div class="form-error" id="set-shop-name-error"></div>
            </div>
            <div class="form-group">
              <label>Shop Address</label>
              <input type="text" class="form-control" id="set-shop-address" value="${this.escapeHtml(settings.shop_address || "")}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Phone Number</label>
              <input type="text" class="form-control" id="set-phone" value="${this.escapeHtml(settings.phone_number || "")}">
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" class="form-control" id="set-email" value="${this.escapeHtml(settings.email || "")}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Currency</label>
              <select class="form-control" id="set-currency">
                <option value="USD" ${settings.currency === "USD" ? "selected" : ""}>USD ($)</option>
                <option value="EUR" ${settings.currency === "EUR" ? "selected" : ""}>EUR (€)</option>
                <option value="GBP" ${settings.currency === "GBP" ? "selected" : ""}>GBP (£)</option>
                <option value="PKR" ${settings.currency === "PKR" ? "selected" : ""}>PKR (Rs)</option>
                <option value="INR" ${settings.currency === "INR" ? "selected" : ""}>INR (₹)</option>
                <option value="AED" ${settings.currency === "AED" ? "selected" : ""}>AED (د.إ)</option>
                <option value="SAR" ${settings.currency === "SAR" ? "selected" : ""}>SAR (﷼)</option>
                <option value="CAD" ${settings.currency === "CAD" ? "selected" : ""}>CAD (C$)</option>
                <option value="AUD" ${settings.currency === "AUD" ? "selected" : ""}>AUD (A$)</option>
                <option value="JPY" ${settings.currency === "JPY" ? "selected" : ""}>JPY (¥)</option>
                <option value="CNY" ${settings.currency === "CNY" ? "selected" : ""}>CNY (¥)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Theme</label>
              <select class="form-control" id="set-theme" onchange="SettingsPage.onThemeChange()">
                <option value="light" ${settings.theme === "light" ? "selected" : ""}>Light</option>
                <option value="dark" ${settings.theme === "dark" ? "selected" : ""}>Dark</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Backup Folder</label>
            <div style="display:flex;gap:8px;">
              <input type="text" class="form-control" id="set-backup-folder" value="${this.escapeHtml(settings.backup_folder || "")}" placeholder="Default: AppData/Roaming/LaptopInventoryManager/backups/" readonly>
              <button type="button" class="btn btn-secondary" onclick="SettingsPage.selectBackupFolder()">Browse</button>
            </div>
          </div>
        </form>
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  },

  async saveSettings() {
    const settings = {
      shop_name: document.getElementById("set-shop-name")?.value?.trim() || "",
      shop_address:
        document.getElementById("set-shop-address")?.value?.trim() || "",
      phone_number: document.getElementById("set-phone")?.value?.trim() || "",
      email: document.getElementById("set-email")?.value?.trim() || "",
      currency: document.getElementById("set-currency")?.value || "USD",
      theme: document.getElementById("set-theme")?.value || "light",
      backup_folder:
        document.getElementById("set-backup-folder")?.value?.trim() || "",
    };

    // Validate
    const errors = Validators.validateSettings(settings);
    const errorEl = document.getElementById("set-shop-name-error");
    if (errorEl) errorEl.textContent = "";

    if (errors.length > 0) {
      errors.forEach((err) => {
        const el = document.getElementById(`set-${err.field}-error`);
        if (el) el.textContent = err.message;
      });
      return;
    }

    try {
      const result = await window.api.updateSettings(settings);
      if (result.success) {
        Toast.success("Settings saved successfully.");

        // Update shop name in topbar
        const shopNameEl = document.getElementById("shop-name");
        if (shopNameEl)
          shopNameEl.textContent =
            settings.shop_name || "Laptop Inventory Manager";

        // Apply theme
        if (settings.theme === "dark") {
          document.body.classList.add("dark-mode");
        } else {
          document.body.classList.remove("dark-mode");
        }

        // Update currency
        App.currency = settings.currency;
      } else {
        Toast.error(result.error || "Failed to save settings.");
      }
    } catch (err) {
      Toast.error("Failed to save settings: " + err.message);
    }
  },

  onThemeChange() {
    const theme = document.getElementById("set-theme")?.value;
    if (theme === "dark") {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
  },

  async selectBackupFolder() {
    try {
      const result = await window.api.selectFolder();
      if (result.success && result.data) {
        const input = document.getElementById("set-backup-folder");
        if (input) input.value = result.data;
      }
    } catch (err) {
      // User cancelled or error
    }
  },

  escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },
};
