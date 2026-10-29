// Owner's own Backblaze B2 bucket (10 GB free). No sign-in page: the owner pastes a Key ID and an Application Key
// limited to ONE private bucket. Both are kept encrypted with Electron safeStorage. Uses B2's native HTTPS API v4
// (no request signing). Main process only.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const settings = require('./settingsService');
const backupFiles = require('./backupFiles');
const { getUserDataPath, getBackupDir } = require('../config/appConfig');

const API = 'https://api.backblazeb2.com/b2api/v4';
const NEEDED = ['listFiles', 'readFiles', 'writeFiles', 'deleteFiles'];
const MAX_SIMPLE = 1024 * 1024 * 1024; // 1 GB: a shop database is far smaller; bigger files would need B2's large-file mode
const TOKEN_LIFE = 20 * 60 * 60 * 1000; // B2 tokens last up to 24 hours

class B2Service {
  constructor(deps = {}) {
    this.fs = deps.fs || fs;
    this.fetch = deps.fetch || global.fetch;
    this.safeStorage = deps.safeStorage || require('electron').safeStorage;
    this.settings = deps.settings || settings;
    this.userDataPath = deps.userDataPath || getUserDataPath();
    this.backupDir = deps.backupDir || getBackupDir();
    this.sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.session = null; // { token, apiUrl, downloadUrl, bucketId, bucketName, expiresAt }
  }

  get label() { return 'Backblaze B2'; }
  get authPath() { return path.join(this.userDataPath, 'b2-auth.bin'); }

  _read() {
    try { return JSON.parse(this.safeStorage.decryptString(this.fs.readFileSync(this.authPath))); } catch { return null; }
  }

  _write(data) {
    if (!this.safeStorage || !this.safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable; the Backblaze key was not saved.');
    this.fs.mkdirSync(path.dirname(this.authPath), { recursive: true });
    this.fs.writeFileSync(this.authPath, this.safeStorage.encryptString(JSON.stringify(data)));
  }

  get clientId() { const a = this._read(); return (a && a.keyId) || ''; }
  get bucket() { const a = this._read(); return (a && a.bucket) || ''; }

  // Keys typed on the Backup page. An empty Application Key box keeps the saved one.
  saveCredentials({ keyId, applicationKey, bucket }) {
    const old = this._read() || {};
    const id = String(keyId == null ? old.keyId || '' : keyId).trim();
    const key = String(applicationKey || '').trim() || old.appKey || '';
    const name = String(bucket == null ? old.bucket || '' : bucket).trim();
    if (/\s/.test(id) || (id && id.length < 10)) throw new Error('That Key ID does not look right. Copy it again from Backblaze (App Keys page).');
    if (key && (/\s/.test(key) || key.length < 10)) throw new Error('That Application Key does not look right. It is shown only once, so create a new key if you lost it.');
    const changed = id !== old.keyId || key !== old.appKey || name !== (old.bucket || '');
    this._write({ keyId: id, appKey: key, bucket: name, verified: changed ? false : !!old.verified, account: changed ? null : old.account || null });
    if (changed) this.session = null;
  }

  status() {
    const a = this._read() || {};
    return {
      provider: 'b2',
      label: this.label,
      configured: !!(a.keyId && a.appKey),
      secretSaved: !!a.appKey,
      connected: !!(a.keyId && a.appKey && a.verified),
      account: a.account || null,
      lastUploadedAt: this.settings.getSetting('drive_last_upload_at') || null,
      lastUploadedFile: this.settings.getSetting('drive_last_upload_file') || null,
      error: this.settings.getSetting('drive_last_error') || null,
    };
  }

  // ---- Check the keys and the bucket. Nothing is uploaded.
  async connect() {
    const a = this._read();
    if (!a || !a.keyId) throw new Error('Paste the Backblaze Key ID first.');
    if (!a.appKey) throw new Error('Paste the Backblaze Application Key too.');
    this.session = null;
    const session = await this._authorize(a);
    this._write({ ...a, verified: true, account: `${session.bucketName}` });
    this.settings.updateSettings({ drive_last_error: '' });
    return this.status();
  }

  async disconnect() {
    const a = this._read();
    if (a) this._write({ ...a, verified: false });
    this.session = null;
    return this.status();
  }

  async _authorize(a) {
    const response = await this.fetch(`${API}/b2_authorize_account`, { headers: { Authorization: `Basic ${Buffer.from(`${a.keyId}:${a.appKey}`).toString('base64')}` } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('Backblaze did not accept that Key ID and Application Key. Check both, and that the key has not been deleted.');
      throw new Error(body.message || `Backblaze sign-in failed (${response.status}).`);
    }
    const api = (body.apiInfo && body.apiInfo.storageApi) || {};
    const allowed = api.allowed || {};
    const missing = NEEDED.filter((c) => !(allowed.capabilities || []).includes(c));
    if (missing.length) throw new Error(`This key is missing permission to: ${missing.join(', ')}. Create the key again with "Read and Write" access.`);

    let bucketId; let bucketName;
    const restricted = allowed.buckets || null;
    if (restricted && restricted.length === 1) { bucketId = restricted[0].id; bucketName = restricted[0].name; }
    else {
      const wanted = (a.bucket || '').trim();
      if (!wanted) throw new Error('This key can see more than one bucket. Type the bucket name too.');
      if (restricted && restricted.length > 1) {
        const hit = restricted.find((b) => b.name === wanted);
        if (!hit) throw new Error(`Bucket "${wanted}" is not one of the buckets this key can use.`);
        bucketId = hit.id; bucketName = hit.name;
      } else {
        const r = await this.fetch(`${api.apiUrl}/b2api/v4/b2_list_buckets`, {
          method: 'POST', headers: { Authorization: body.authorizationToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: body.accountId, bucketName: wanted }),
        });
        const list = await r.json().catch(() => ({}));
        const hit = r.ok && (list.buckets || [])[0];
        if (!hit) throw new Error(`Backblaze could not find a bucket named "${wanted}".`);
        bucketId = hit.bucketId; bucketName = hit.bucketName;
        if (hit.bucketType && hit.bucketType !== 'allPrivate') throw new Error(`Bucket "${wanted}" is public. Make it private in Backblaze so nobody else can open your backups.`);
      }
    }
    this.session = { token: body.authorizationToken, apiUrl: api.apiUrl, downloadUrl: api.downloadUrl, bucketId, bucketName, expiresAt: Date.now() + TOKEN_LIFE };
    return this.session;
  }

  async _session(force = false) {
    if (!force && this.session && this.session.expiresAt > Date.now()) return this.session;
    const a = this._read();
    if (!a || !a.keyId || !a.appKey || !a.verified) throw new Error('Connect Backblaze first.');
    return this._authorize(a);
  }

  _message(response, body) {
    const code = body && body.code;
    if (code === 'storage_cap_exceeded' || code === 'cap_exceeded' || response.status === 403 && /cap/i.test(String(body && body.message))) return 'Backblaze storage limit reached. Delete old online backups or raise the cap in Backblaze (Caps & Alerts).';
    if (response.status === 401) return 'Backblaze rejected the key. Press Connect again, or create a new key.';
    return (body && body.message) || `Backblaze request failed (${response.status}).`;
  }

  // One API call with the account token; renews the token once if Backblaze says it ran out.
  async _api(name, payload, attempt = 0) {
    const s = await this._session(attempt === 'renewed');
    const response = await this.fetch(`${s.apiUrl}/b2api/v4/${name}`, { method: 'POST', headers: { Authorization: s.token, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 && attempt !== 'renewed' && /expired|bad_auth/i.test(String(body.code))) return this._api(name, payload, 'renewed');
    if ((response.status === 429 || response.status === 503) && typeof attempt === 'number' && attempt < 3) { await this.sleep(2000 * (attempt + 1)); return this._api(name, payload, attempt + 1); }
    if (!response.ok) { const err = new Error(this._message(response, body)); err.code = response.status; throw err; }
    return body;
  }

  _name(localPath) { return `LIMBackup-${path.basename(localPath)}`; }

  async listBackups() {
    const s = await this._session();
    const out = [];
    let start = null;
    for (let page = 0; page < 20; page += 1) {
      const body = await this._api('b2_list_file_names', { bucketId: s.bucketId, prefix: 'LIMBackup-', maxFileCount: 1000, ...(start ? { startFileName: start } : {}) });
      (body.files || []).forEach((f) => { if (f.fileId && f.fileName.endsWith('.db')) out.push({ id: f.fileId, name: f.fileName, size: f.contentLength, createdTime: new Date(f.uploadTimestamp).toISOString() }); });
      start = body.nextFileName;
      if (!start) break;
    }
    return out.sort((a, b) => String(b.createdTime).localeCompare(String(a.createdTime)));
  }

  async uploadBackup(localPath) {
    const verified = backupFiles.verify(localPath);
    if (!verified.ok) throw new Error(`Refusing to upload an invalid backup: ${verified.error}`);
    const size = this.fs.statSync(localPath).size;
    if (size > MAX_SIMPLE) throw new Error('This backup is larger than 1 GB, which the app does not upload to Backblaze yet.');
    const name = this._name(localPath);
    const data = this.fs.readFileSync(localPath);
    const sha1 = crypto.createHash('sha1').update(data).digest('hex');
    const s = await this._session();
    const before = (await this._api('b2_list_file_names', { bucketId: s.bucketId, prefix: name, maxFileCount: 5 })).files.filter((f) => f.fileName === name);

    let file;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const target = await this._api('b2_get_upload_url', { bucketId: s.bucketId });
      const response = await this.fetch(target.uploadUrl, {
        method: 'POST', body: data,
        headers: { Authorization: target.authorizationToken, 'X-Bz-File-Name': encodeURIComponent(name), 'Content-Type': 'application/octet-stream', 'Content-Length': String(size), 'X-Bz-Content-Sha1': sha1 },
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) { file = body; break; }
      // A busy or expired upload address: ask for a new one and try again.
      if ([401, 408, 500, 503].includes(response.status) && attempt < 2) { await this.sleep(1500 * (attempt + 1)); continue; }
      throw new Error(this._message(response, body));
    }
    // Replacing a same-name backup would otherwise keep the old copy as a hidden version that still uses space.
    for (const old of before) { try { await this._api('b2_delete_file_version', { fileName: old.fileName, fileId: old.fileId }); } catch { /* removed next time */ } }

    const uploadedAt = new Date().toISOString();
    this.settings.updateSettings({ drive_last_upload_at: uploadedAt, drive_last_upload_file: path.basename(localPath), drive_last_error: '' });
    try { await this._prune(); } catch { /* an old copy that cannot be removed now is tried next time */ }
    return { id: file.fileId, name: file.fileName, size: Number(file.contentLength || size), uploadedAt };
  }

  async _prune() {
    const keep = Math.max(1, Math.min(365, Number(this.settings.getSetting('drive_backup_retention') || 30)));
    const files = await this.listBackups();
    for (const f of files.slice(keep)) await this._api('b2_delete_file_version', { fileName: f.name, fileId: f.id });
  }

  async downloadBackup(fileId) {
    const files = await this.listBackups();
    const file = files.find((f) => f.id === String(fileId));
    if (!file) throw new Error('Backblaze backup not found.');
    const s = await this._session();
    const response = await this.fetch(`${s.downloadUrl}/file/${encodeURIComponent(s.bucketName)}/${encodeURIComponent(file.name)}`, { headers: { Authorization: s.token } });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(this._message(response, body)); }
    const dir = path.join(this.backupDir, 'drive');
    this.fs.mkdirSync(dir, { recursive: true });
    const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_');
    const destination = path.join(dir, safeName);
    this.fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
    const check = backupFiles.verify(destination);
    if (!check.ok) { this.fs.rmSync(destination, { force: true }); throw new Error(`Downloaded backup failed verification: ${check.error}`); }
    return { path: destination, filename: safeName, size: this.fs.statSync(destination).size };
  }
}

let shared = null;
function getB2Service() { if (!shared) shared = new B2Service(); return shared; }
module.exports = { B2Service, getB2Service };
