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
      <div class="card" style="margin-bottom:24px;" id="wa-link-card"></div>
      <div class="card" style="margin-bottom:24px;">
        <div class="card-header"><h3>Security</h3></div>
        <div class="card-body">
          <div class="form-row">
            <div class="form-group">
              <label>Current Password</label>
              <input type="password" class="form-control" id="sec-pw-current" autocomplete="off">
            </div>
            <div class="form-group">
              <label>New Password</label>
              <input type="password" class="form-control" id="sec-pw-new" autocomplete="off">
            </div>
            <div class="form-group" style="align-self:flex-end;">
              <button class="btn btn-primary" onclick="SettingsPage.changePassword()">Change Password</button>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Current Super-Password</label>
              <input type="password" class="form-control" id="sec-sp-current" autocomplete="off">
            </div>
            <div class="form-group">
              <label>New Super-Password</label>
              <input type="password" class="form-control" id="sec-sp-new" autocomplete="off">
            </div>
            <div class="form-group" style="align-self:flex-end;">
              <button class="btn btn-primary" onclick="SettingsPage.changeSuperPassword()">Change Super-Password</button>
            </div>
          </div>
          <small>The super-password protects editing and deleting products and viewing purchase prices.</small>
        </div>
      </div>
      <div class="card" style="margin-bottom:24px;">
        <div class="card-header"><h3>Data Check</h3></div>
        <div class="card-body">
          <button class="btn btn-secondary" onclick="SettingsPage.runIntegrityCheck()">Check my data</button>
          <div id="integrity-result" style="margin-top:12px;"></div>
        </div>
      </div>
      <div class="card" style="margin-bottom:24px;">
        <div class="card-header"><h3>Activity Log</h3></div>
        <div class="card-body" id="audit-log"><div class="loading"><div class="spinner"></div></div></div>
      </div>
    `;

    WhatsAppLink.mountCard();
    await this.loadSettings();
    await this.loadAudit();
  },

  async runIntegrityCheck() {
    const el = document.getElementById("integrity-result");
    const r = await window.api.checkIntegrity();
    if (!r.success) {
      el.textContent = r.error;
    } else if (r.data.ok) {
      el.innerHTML = '<span style="color:var(--success);">All sales, payments, ledgers and stock add up.</span>';
    } else {
      el.innerHTML = '<span style="color:var(--danger);">Found ' + r.data.problems.length + ' problem(s):</span><ul>' +
        r.data.problems.map((p) => "<li>" + this.escapeHtml(p.detail) + "</li>").join("") + "</ul>";
    }
  },

  async loadAudit() {
    const el = document.getElementById("audit-log");
    if (!el) return;
    const r = await window.api.listAudit({ page: 1, pageSize: 30 });
    if (!r.success || r.data.length === 0) {
      el.innerHTML = '<p style="color:var(--text-muted);">No activity recorded yet.</p>';
      return;
    }
    const label = (a) => a.replace(/[._]/g, " ");
    el.innerHTML = `<div class="table-wrapper"><table><thead><tr><th>When</th><th>What</th><th>Record</th></tr></thead><tbody>${r.data
      .map((x) => `<tr><td>${this.escapeHtml(x.at)}</td><td>${this.escapeHtml(label(x.action))}</td><td>${x.entity_id === null ? "-" : "#" + x.entity_id}</td></tr>`)
      .join("")}</tbody></table></div>`;
  },

  async _change(apiFn, currentId, newId, okMsg) {
    const current = document.getElementById(currentId).value;
    const next = document.getElementById(newId).value;
    const r = await apiFn(current, next);
    if (r.success) {
      Toast.success(okMsg);
      document.getElementById(currentId).value = "";
      document.getElementById(newId).value = "";
    } else {
      Toast.error(r.error);
    }
  },

  changePassword() {
    return this._change(window.api.changePassword, "sec-pw-current", "sec-pw-new", "Password changed.");
  },

  changeSuperPassword() {
    return this._change(window.api.changeSuperPassword, "sec-sp-current", "sec-sp-new", "Super-password changed.");
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
              <label>Second Phone Number</label>
              <input type="text" class="form-control" id="set-phone-2" value="${this.escapeHtml(settings.phone_number_2 || "")}">
            </div>
            <div class="form-group">
              <label>Google Map Link</label>
              <input type="text" class="form-control" id="set-map-link" placeholder="https://maps.google.com/..." value="${this.escapeHtml(settings.google_map_link || "")}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>EasyPaisa Number</label>
              <input type="text" class="form-control" id="set-easypaisa" value="${this.escapeHtml(settings.easypaisa_number || "")}">
            </div>
            <div class="form-group">
              <label>Bank Name</label>
              <input type="text" class="form-control" id="set-bank-name" value="${this.escapeHtml(settings.bank_name || "")}">
            </div>
            <div class="form-group">
              <label>Bank Account Number</label>
              <input type="text" class="form-control" id="set-bank-account" value="${this.escapeHtml(settings.bank_account_number || "")}">
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
          <div class="form-row">
            <div class="form-group">
              <label>Short Numbers (12.5K, 3.2M)</label>
              <select class="form-control" id="set-compact">
                <option value="1" ${settings.compact_numbers !== "0" ? "selected" : ""}>On</option>
                <option value="0" ${settings.compact_numbers === "0" ? "selected" : ""}>Off</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Language</label>
              <select class="form-control" id="set-language" data-no-i18n onchange="I18n.setLanguage(this.value)">
                <option value="en" ${I18n.lang === "en" ? "selected" : ""}>English</option>
                <option value="ur" ${I18n.lang === "ur" ? "selected" : ""}>اردو</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Opening Cash in Hand</label>
              <input type="number" step="0.01" class="form-control" id="set-opening-cash" value="${this.escapeHtml(settings.opening_cash || "0")}">
            </div>
            <div class="form-group">
              <label>Opening Bank Balance</label>
              <input type="number" step="0.01" class="form-control" id="set-opening-bank" value="${this.escapeHtml(settings.opening_bank || "0")}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Phone Country Code (for WhatsApp)</label>
              <input type="text" class="form-control" id="set-country-code" value="${this.escapeHtml(settings.default_country_code || "92")}" placeholder="92">
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
      phone_number_2: document.getElementById("set-phone-2")?.value?.trim() || "",
      google_map_link: document.getElementById("set-map-link")?.value?.trim() || "",
      easypaisa_number: document.getElementById("set-easypaisa")?.value?.trim() || "",
      bank_name: document.getElementById("set-bank-name")?.value?.trim() || "",
      bank_account_number: document.getElementById("set-bank-account")?.value?.trim() || "",
      currency: document.getElementById("set-currency")?.value || "USD",
      theme: document.getElementById("set-theme")?.value || "light",
      compact_numbers: document.getElementById("set-compact")?.value || "1",
      opening_cash: String(parseFloat(document.getElementById("set-opening-cash")?.value) || 0),
      opening_bank: String(parseFloat(document.getElementById("set-opening-bank")?.value) || 0),
      default_country_code: (document.getElementById("set-country-code")?.value || "").replace(/\D/g, "") || "92",
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
        Formatters.compact = settings.compact_numbers !== "0";
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
