// One place for "the online copy of the backup": picks OneDrive or Google Drive (or neither) and keeps the
// automatic-upload choices. The rest of the app talks to this, never to a provider directly.
const settings = require('./settingsService');

const PROVIDERS = ['b2', 'google', 'onedrive', 'none'];
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GOOGLE_ID = /^[\w.-]+\.apps\.googleusercontent\.com$/;

class CloudBackupService {
  constructor(deps = {}) {
    this.settings = deps.settings || settings;
    this.services = deps.services || {
      onedrive: () => require('./oneDriveService').getOneDriveService(),
      google: () => require('./googleDriveService').getGoogleDriveService(),
      b2: () => require('./b2Service').getB2Service(),
    };
  }

  _get(key) { return this.settings.getSetting(key); }

  // The choice made on the Backup page. Before any choice, an online backup that is already connected keeps working;
  // otherwise Backblaze B2 (keys only, no sign-in page) is the suggestion.
  provider() {
    const chosen = this._get('cloud_provider');
    if (PROVIDERS.includes(chosen)) return chosen;
    for (const name of ['google', 'onedrive', 'b2']) {
      try { if (this.services[name]().status().connected) return name; } catch { /* not available */ }
    }
    return 'b2';
  }

  service(name = this.provider()) {
    return name === 'none' ? null : this.services[name]();
  }

  autoUpload() { return this._get('cloud_auto_upload') !== '0'; }

  // Hours between extra automatic backups while the app is open (0 = only at start and exit).
  autoHours() {
    const n = parseInt(this._get('cloud_auto_hours'), 10);
    return Number.isFinite(n) ? Math.max(0, Math.min(48, n)) : 6;
  }

  retention() { return Math.max(1, Math.min(365, parseInt(this._get('drive_backup_retention'), 10) || 30)); }

  status() {
    const provider = this.provider();
    const base = { provider, autoUpload: this.autoUpload(), autoHours: this.autoHours(), retention: this.retention() };
    const svc = this.service(provider);
    if (!svc) return { ...base, label: 'Off', configured: false, connected: false, account: null, lastUploadedAt: null, lastUploadedFile: null, error: null, clientId: '' };
    const s = svc.status();
    return { ...base, ...s, provider, clientId: svc.clientId, bucket: svc.bucket || '' };
  }

  // Everything the Backup page can change, in one call. Empty secret = keep the saved one.
  saveSettings(data = {}) {
    const provider = PROVIDERS.includes(data.provider) ? data.provider : this.provider();
    const current = this.status();
    const updates = { cloud_provider: provider };
    if (data.autoUpload !== undefined) updates.cloud_auto_upload = data.autoUpload ? '1' : '0';
    if (data.autoHours !== undefined) updates.cloud_auto_hours = String(Math.max(0, Math.min(48, parseInt(data.autoHours, 10) || 0)));
    if (data.retention !== undefined) updates.drive_backup_retention = String(Math.max(1, Math.min(365, parseInt(data.retention, 10) || 30)));

    if (provider === 'b2' && (data.clientId !== undefined || data.clientSecret || data.bucket !== undefined)) {
      const svc = this.service('b2');
      const typed = String(data.clientId == null ? svc.clientId : data.clientId).trim();
      if (current.provider === 'b2' && current.connected && (typed !== svc.clientId || String(data.clientSecret || '').trim() || String(data.bucket == null ? svc.bucket : data.bucket).trim() !== svc.bucket)) {
        throw new Error('Disconnect Backblaze B2 before changing its keys.');
      }
      svc.saveCredentials({ keyId: data.clientId, applicationKey: data.clientSecret, bucket: data.bucket });
    } else if (data.clientId !== undefined && provider !== 'none' && provider !== 'b2') {
      const id = String(data.clientId || '').trim().slice(0, 300);
      const svc = this.service(provider);
      if (provider === 'onedrive' && id && !GUID.test(id)) throw new Error('The Application (client) ID looks like 8-4-4-4-12 letters and numbers, for example 12345678-90ab-cdef-1234-567890abcdef. Copy it again from Azure.');
      if (provider === 'google' && id && !GOOGLE_ID.test(id)) throw new Error('Enter a valid Google OAuth desktop client ID.');
      if (current.provider === provider && current.connected && id !== svc.clientId) throw new Error(`Disconnect ${svc.label || 'the online backup'} before changing the Client ID.`);
      if (provider === 'google' && svc.saveClientSecret) svc.saveClientSecret(data.clientSecret);
      updates[provider === 'onedrive' ? 'onedrive_client_id' : 'google_drive_client_id'] = id;
    }
    this.settings.updateSettings(updates);
    return this.status();
  }

  async connect() {
    const svc = this.service();
    if (!svc) throw new Error('Choose OneDrive or Google Drive first.');
    await svc.connect();
    return this.status();
  }

  async disconnect() {
    const svc = this.service();
    if (svc) await svc.disconnect();
    return this.status();
  }

  async list() {
    const svc = this.service();
    if (!svc || !svc.status().connected) return [];
    return svc.listBackups();
  }

  async download(fileId) {
    const svc = this.service();
    if (!svc) throw new Error('No online backup is set up.');
    return svc.downloadBackup(String(fileId || ''));
  }

  async upload(filePath) {
    const svc = this.service();
    if (!svc) throw new Error('No online backup is set up.');
    return svc.uploadBackup(filePath);
  }

  // Ready to receive uploads right now?
  ready() {
    try { const svc = this.service(); return !!svc && svc.status().connected; } catch { return false; }
  }
}

module.exports = new CloudBackupService();
module.exports.CloudBackupService = CloudBackupService;
