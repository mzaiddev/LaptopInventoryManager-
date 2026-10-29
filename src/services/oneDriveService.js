// Owner-authorized backup copy in the owner's OneDrive (free 5 GB on a personal Microsoft account).
// The app only asks for Files.ReadWrite.AppFolder, so it can see one folder (Apps/<app name>) and nothing else.
// It is a "public client": no client secret exists, only the Application (client) ID. Sign-in is a browser page
// plus a one-time code (PKCE). Tokens are encrypted with Electron safeStorage. Main process only.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const settings = require('./settingsService');
const backupFiles = require('./backupFiles');
const { getUserDataPath, getBackupDir } = require('../config/appConfig');

const AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPE = 'openid profile email offline_access Files.ReadWrite.AppFolder';
const SIMPLE_LIMIT = 4 * 1024 * 1024; // above this an upload session is used (it can resume after a drop)
const CHUNK = 32 * 320 * 1024; // 10 MiB: Graph needs a multiple of 320 KiB

class OneDriveService {
  constructor(deps = {}) {
    this.fs = deps.fs || fs;
    this.http = deps.http || http;
    this.fetch = deps.fetch || global.fetch;
    this.safeStorage = deps.safeStorage || require('electron').safeStorage;
    this.shell = deps.shell || require('electron').shell;
    this.settings = deps.settings || settings;
    this.userDataPath = deps.userDataPath || getUserDataPath();
    this.backupDir = deps.backupDir || getBackupDir();
    this.sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.connecting = null;
    this.refreshing = null;
  }

  get label() { return 'OneDrive'; }
  get clientId() { return String(this.settings.getSetting('onedrive_client_id') || process.env.LIM_ONEDRIVE_CLIENT_ID || require('../config/microsoftClient').clientId || '').trim(); }
  get authPath() { return path.join(this.userDataPath, 'onedrive-auth.bin'); }

  _readAuth() {
    try { return JSON.parse(this.safeStorage.decryptString(this.fs.readFileSync(this.authPath))); } catch { return null; }
  }

  _saveAuth(data) {
    if (!this.safeStorage || !this.safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable; the OneDrive sign-in was not saved.');
    this.fs.mkdirSync(path.dirname(this.authPath), { recursive: true });
    this.fs.writeFileSync(this.authPath, this.safeStorage.encryptString(JSON.stringify(data)));
  }

  status() {
    const auth = this._readAuth();
    return {
      provider: 'onedrive',
      label: this.label,
      configured: !!this.clientId,
      connected: !!(auth && auth.refresh_token),
      account: (auth && auth.account) || null,
      lastUploadedAt: this.settings.getSetting('drive_last_upload_at') || null,
      lastUploadedFile: this.settings.getSetting('drive_last_upload_file') || null,
      error: this.settings.getSetting('drive_last_error') || null,
    };
  }

  // ---- Sign-in
  async connect() {
    if (!this.clientId) throw new Error('Enter the OneDrive Application (client) ID first.');
    if (this.connecting) return this.connecting;
    this.connecting = this._connect().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  async _connect() {
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(24).toString('hex');
    const server = this.http.createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    // "localhost" may resolve to IPv4 or IPv6 in the browser, so listen on both loopback addresses.
    let server6 = null;
    try {
      server6 = this.http.createServer();
      await new Promise((resolve, reject) => { server6.once('error', reject); server6.listen(port, '::1', resolve); });
    } catch { server6 = null; }
    const redirectUri = `http://localhost:${port}`;
    const authUrl = new URL(`${AUTH}/authorize`);
    Object.entries({
      client_id: this.clientId, response_type: 'code', redirect_uri: redirectUri, response_mode: 'query', scope: SCOPE,
      code_challenge: challenge, code_challenge_method: 'S256', state, prompt: 'select_account',
    }).forEach(([k, v]) => authUrl.searchParams.set(k, v));

    try {
      await this.shell.openExternal(authUrl.toString());
      const code = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Microsoft sign-in timed out. Try connecting OneDrive again.')), 180000);
        const onRequest = (req, res) => {
          const url = new URL(req.url, redirectUri);
          if (url.pathname !== '/') { res.writeHead(404).end(); return; }
          const page = (text) => res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta charset="utf-8"><title>OneDrive</title><p>${text}</p>`);
          if (url.searchParams.get('state') !== state) { res.writeHead(400).end('Invalid sign-in response.'); clearTimeout(timeout); reject(new Error('Microsoft sign-in state did not match.')); return; }
          const error = url.searchParams.get('error');
          if (error) {
            page('OneDrive was not connected. You may close this tab.');
            clearTimeout(timeout);
            reject(new Error(`Microsoft sign-in was not completed (${url.searchParams.get('error_description') || error}).`));
            return;
          }
          const authorizationCode = url.searchParams.get('code');
          page('OneDrive connected. You may close this tab and return to Shop Manager.');
          clearTimeout(timeout);
          if (!authorizationCode) reject(new Error('Microsoft did not return an authorization code.'));
          else resolve(authorizationCode);
        };
        server.on('request', onRequest);
        if (server6) server6.on('request', onRequest);
      });
      const response = await this.fetch(`${AUTH}/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: this.clientId, scope: SCOPE, code, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }),
      });
      const tokens = await response.json();
      if (!response.ok || !tokens.refresh_token) throw new Error(this._tokenError(tokens, 'Microsoft did not grant offline backup access.'));
      this._saveAuth({
        refresh_token: tokens.refresh_token, access_token: tokens.access_token,
        expires_at: Date.now() + Number(tokens.expires_in || 3600) * 1000, account: this._accountFrom(tokens.id_token),
      });
      this.settings.updateSettings({ drive_last_error: '' });
      return this.status();
    } finally {
      try { server.close(); } catch { /* already closed */ }
      try { if (server6) server6.close(); } catch { /* already closed */ }
    }
  }

  _accountFrom(idToken) {
    try {
      const claims = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString());
      return claims.email || claims.preferred_username || claims.name || null;
    } catch { return null; }
  }

  _tokenError(tokens, fallback) {
    const text = tokens && (tokens.error_description || tokens.error);
    if (!text) return fallback;
    if (/AADSTS700016|unauthorized_client|invalid_client/i.test(text)) return 'Microsoft does not know this Client ID. Check it, and that the app allows personal Microsoft accounts.';
    if (/AADSTS50011|redirect_uri/i.test(text)) return 'The app registration needs the redirect address http://localhost (Mobile and desktop applications). Add it in Azure, then connect again.';
    return String(text).split('\r\n')[0].slice(0, 300);
  }

  async disconnect() {
    try { this.fs.rmSync(this.authPath, { force: true }); } catch { /* already removed */ }
    return this.status();
  }

  // Refresh tokens rotate: every refresh returns a new one that must replace the saved one.
  async _accessToken(force = false) {
    const auth = this._readAuth();
    if (!auth || !auth.refresh_token) throw new Error('Connect OneDrive first.');
    if (!force && auth.access_token && auth.expires_at > Date.now() + 60000) return auth.access_token;
    if (!this.refreshing) this.refreshing = this._refresh(auth).finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async _refresh(auth) {
    const response = await this.fetch(`${AUTH}/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, scope: SCOPE, refresh_token: auth.refresh_token, grant_type: 'refresh_token' }),
    });
    const tokens = await response.json();
    if (!response.ok || !tokens.access_token) {
      if (tokens.error === 'invalid_grant') {
        await this.disconnect();
        throw new Error('OneDrive sign-in ended (the Microsoft password changed or access was removed). Press Connect OneDrive again.');
      }
      throw new Error(this._tokenError(tokens, 'Could not refresh the OneDrive sign-in. Reconnect OneDrive.'));
    }
    const next = { ...auth, access_token: tokens.access_token, expires_at: Date.now() + Number(tokens.expires_in || 3600) * 1000 };
    if (tokens.refresh_token) next.refresh_token = tokens.refresh_token;
    this._saveAuth(next);
    return next.access_token;
  }

  // ---- Graph calls
  async _graph(url, options = {}, attempt = 0) {
    const full = url.startsWith('http') ? url : `${GRAPH}${url}`;
    const token = await this._accessToken(attempt === 'refreshed');
    const response = await this.fetch(full, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });
    if (response.status === 401 && attempt !== 'refreshed') return this._graph(url, options, 'refreshed');
    if ((response.status === 429 || response.status === 503 || response.status === 504) && typeof attempt === 'number' && attempt < 3) {
      const wait = Math.min(30, Number(response.headers && response.headers.get && response.headers.get('retry-after')) || 2 ** (attempt + 1));
      await this.sleep(wait * 1000);
      return this._graph(url, options, attempt + 1);
    }
    if (!response.ok) {
      let message = `OneDrive request failed (${response.status}).`;
      try { const body = await response.json(); message = (body.error && body.error.message) || message; } catch { /* no body */ }
      if (response.status === 507 || /quota/i.test(message)) message = 'OneDrive is full. Free some space or buy more storage.';
      const err = new Error(message); err.code = response.status; throw err;
    }
    return response;
  }

  _name(localPath) { return `LIMBackup-${path.basename(localPath)}`; }

  async listBackups() {
    const out = [];
    let next = '/me/drive/special/approot/children?$select=id,name,size,createdDateTime,file&$top=200';
    for (let page = 0; next && page < 20; page += 1) {
      const response = await this._graph(next);
      const body = await response.json();
      (body.value || []).forEach((f) => { if (f.file && f.name && f.name.startsWith('LIMBackup-') && f.name.endsWith('.db')) out.push({ id: f.id, name: f.name, size: f.size, createdTime: f.createdDateTime }); });
      next = body['@odata.nextLink'] || null;
    }
    return out.sort((a, b) => String(b.createdTime).localeCompare(String(a.createdTime)));
  }

  async uploadBackup(localPath) {
    const verified = backupFiles.verify(localPath);
    if (!verified.ok) throw new Error(`Refusing to upload an invalid backup: ${verified.error}`);
    const name = this._name(localPath);
    const size = this.fs.statSync(localPath).size;
    const item = size <= SIMPLE_LIMIT ? await this._simpleUpload(localPath, name) : await this._sessionUpload(localPath, name, size);
    const uploadedAt = new Date().toISOString();
    this.settings.updateSettings({ drive_last_upload_at: uploadedAt, drive_last_upload_file: path.basename(localPath), drive_last_error: '' });
    try { await this._prune(); } catch { /* an old copy that cannot be removed now is tried next time */ }
    return { id: item.id, name: item.name, size: Number(item.size || size), uploadedAt };
  }

  async _simpleUpload(localPath, name) {
    const response = await this._graph(`/me/drive/special/approot:/${encodeURIComponent(name)}:/content?@microsoft.graph.conflictBehavior=replace`, {
      method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: this.fs.readFileSync(localPath),
    });
    return response.json();
  }

  async _sessionUpload(localPath, name, size) {
    const start = await this._graph(`/me/drive/special/approot:/${encodeURIComponent(name)}:/createUploadSession`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace', name } }),
    });
    const { uploadUrl } = await start.json();
    if (!uploadUrl) throw new Error('OneDrive did not start the backup upload.');
    const fd = this.fs.openSync(localPath, 'r');
    try {
      let offset = 0;
      while (offset < size) {
        const length = Math.min(CHUNK, size - offset);
        const chunk = Buffer.allocUnsafe(length);
        this.fs.readSync(fd, chunk, 0, length, offset);
        // The upload address is already authorised; sending the token there is refused.
        const response = await this.fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Length': String(length), 'Content-Range': `bytes ${offset}-${offset + length - 1}/${size}` }, body: chunk });
        if (response.status === 202) { offset += length; continue; }
        if (!response.ok) {
          let message = `OneDrive upload failed (${response.status}).`;
          try { const body = await response.json(); message = (body.error && body.error.message) || message; } catch { /* no body */ }
          throw new Error(message);
        }
        return response.json();
      }
    } finally { this.fs.closeSync(fd); }
    throw new Error('OneDrive upload finished without a file response.');
  }

  async _prune() {
    const keep = Math.max(1, Math.min(365, Number(this.settings.getSetting('drive_backup_retention') || 30)));
    const files = await this.listBackups();
    for (const file of files.slice(keep)) await this._graph(`/me/drive/items/${encodeURIComponent(file.id)}`, { method: 'DELETE' });
  }

  async downloadBackup(fileId) {
    const files = await this.listBackups();
    const file = files.find((f) => f.id === String(fileId));
    if (!file) throw new Error('OneDrive backup not found.');
    const response = await this._graph(`/me/drive/items/${encodeURIComponent(file.id)}/content`);
    const dir = path.join(this.backupDir, 'drive');
    this.fs.mkdirSync(dir, { recursive: true });
    const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_');
    const destination = path.join(dir, safeName);
    this.fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
    const verified = backupFiles.verify(destination);
    if (!verified.ok) { this.fs.rmSync(destination, { force: true }); throw new Error(`Downloaded backup failed verification: ${verified.error}`); }
    return { path: destination, filename: safeName, size: this.fs.statSync(destination).size };
  }
}

let shared = null;
function getOneDriveService() { if (!shared) shared = new OneDriveService(); return shared; }
module.exports = { OneDriveService, getOneDriveService };
