// Owner-authorized backup copy in the owner's Drive. No service account or shared
// vendor Drive is used. OAuth refresh credentials are encrypted with Electron safeStorage.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const settings = require('./settingsService');
const backupFiles = require('./backupFiles');
const { getUserDataPath, getBackupDir } = require('../config/appConfig');

class GoogleDriveService {
  constructor(deps = {}) {
    this.fs = deps.fs || fs;
    this.http = deps.http || http;
    this.fetch = deps.fetch || global.fetch;
    this.safeStorage = deps.safeStorage || require('electron').safeStorage;
    this.shell = deps.shell || require('electron').shell;
    this.settings = deps.settings || settings;
    this.userDataPath = deps.userDataPath || getUserDataPath();
    this.backupDir = deps.backupDir || getBackupDir();
    this.connecting = null;
    this._fetchImpl = deps.fetch || global.fetch;
  }

  get label() { return 'Google Drive'; }
  get clientId() { return String(this.settings.getSetting('google_drive_client_id') || process.env.LIM_GOOGLE_CLIENT_ID || require('../config/googleClient').clientId || '').trim(); }
  // Google's desktop-app clients come with a secret that is not confidential; it is never saved in the database.
  // The secret typed on the Backup page is kept encrypted with Windows secure storage (never in the database).
  get secretPath() { return path.join(this.userDataPath, 'drive-client-secret.bin'); }
  _readSavedSecret() {
    try { return this.safeStorage.decryptString(this.fs.readFileSync(this.secretPath)).trim(); } catch { return ''; }
  }
  saveClientSecret(secret) {
    const value = String(secret || '').trim();
    if (!value) return;
    if (/\s/.test(value) || value.length < 10) throw new Error('That Client secret does not look right. Copy it again from Google Cloud.');
    if (!this.safeStorage || !this.safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable; the Client secret was not saved.');
    this.fs.mkdirSync(path.dirname(this.secretPath), { recursive:true });
    this.fs.writeFileSync(this.secretPath, this.safeStorage.encryptString(value));
  }
  get clientSecret() { return String(this._readSavedSecret() || process.env.LIM_GOOGLE_CLIENT_SECRET || require('../config/googleClient').clientSecret || '').trim(); }
  _withSecret(params) { const secret = this.clientSecret; if (secret) params.client_secret = secret; return params; }
  get authPath() { return path.join(this.userDataPath, 'drive-auth.bin'); }

  _readAuth() {
    try {
      const raw = this.fs.readFileSync(this.authPath);
      const json = this.safeStorage.decryptString(raw);
      return JSON.parse(json);
    } catch { return null; }
  }

  _saveAuth(data) {
    if (!this.safeStorage || !this.safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable; Google Drive sign-in was not saved.');
    this.fs.mkdirSync(path.dirname(this.authPath), { recursive:true });
    this.fs.writeFileSync(this.authPath, this.safeStorage.encryptString(JSON.stringify(data)));
  }

  status() {
    const auth = this._readAuth();
    return {
      provider: 'google',
      label: this.label,
      account: null,
      configured: !!this.clientId,
      secretSaved: !!this.clientSecret,
      connected: !!(auth && auth.refresh_token),
      lastUploadedAt: this.settings.getSetting('drive_last_upload_at') || null,
      lastUploadedFile: this.settings.getSetting('drive_last_upload_file') || null,
      error: this.settings.getSetting('drive_last_error') || null,
    };
  }

  async connect() {
    if (!this.clientId) throw new Error('Enter the Google Client ID on the Backup page first.');
    if (!this.clientSecret) throw new Error('Enter the Google Client secret on the Backup page too.');
    if (this.connecting) return this.connecting;
    this.connecting = this._connect().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  async _connect() {
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(24).toString('hex');
    const server = this.http.createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    Object.entries({
      client_id:this.clientId, redirect_uri:redirectUri, response_type:'code', scope:'https://www.googleapis.com/auth/drive.file',
      access_type:'offline', prompt:'consent', code_challenge:challenge, code_challenge_method:'S256', state,
    }).forEach(([key,value]) => authUrl.searchParams.set(key,value));

    try {
      await this.shell.openExternal(authUrl.toString());
      const code = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Google sign-in timed out. Try connecting Drive again.')), 180000);
        server.on('request', (req, res) => {
          const url = new URL(req.url, redirectUri);
          if (url.pathname !== '/oauth2callback') { res.writeHead(404).end(); return; }
          if (url.searchParams.get('state') !== state) { res.writeHead(400).end('Invalid sign-in response.'); clearTimeout(timeout); reject(new Error('Google sign-in state did not match.')); return; }
          const error = url.searchParams.get('error');
          if (error) { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}).end('<p>Google Drive was not connected. You may close this tab.</p>'); clearTimeout(timeout); reject(new Error(`Google sign-in was not completed (${error}).`)); return; }
          const authorizationCode = url.searchParams.get('code');
          res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}).end('<!doctype html><meta charset="utf-8"><title>Drive connected</title><p>Google Drive connected. You may close this tab and return to Shop Manager.</p>');
          clearTimeout(timeout);
          if (!authorizationCode) reject(new Error('Google did not return an authorization code.'));
          else resolve(authorizationCode);
        });
      });
      const response = await this._fetchImpl('https://oauth2.googleapis.com/token', {
        method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams(this._withSecret({ client_id:this.clientId, code, code_verifier:verifier, redirect_uri:redirectUri, grant_type:'authorization_code' })),
      });
      const tokens = await response.json();
      if (!response.ok || !tokens.refresh_token) throw new Error(tokens.error_description || tokens.error || 'Google did not grant offline backup access.');
      this._saveAuth({ refresh_token:tokens.refresh_token, access_token:tokens.access_token, expires_at:Date.now() + Number(tokens.expires_in || 3600) * 1000 });
      this.settings.updateSettings({ drive_last_error:'' });
      return this.status();
    } finally {
      try { server.close(); } catch { /* already closed */ }
    }
  }

  async disconnect() {
    const auth = this._readAuth();
    if (auth && auth.refresh_token) {
      try { await this._fetchImpl(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(auth.refresh_token)}`, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'} }); } catch { /* local unlink must still succeed */ }
    }
    try { this.fs.rmSync(this.authPath, { force:true }); } catch { /* already removed */ }
    return this.status();
  }

  async _accessToken() {
    let auth = this._readAuth();
    if (!auth || !auth.refresh_token) throw new Error('Connect the owner’s Google Drive account first.');
    if (auth.access_token && auth.expires_at > Date.now() + 60000) return auth.access_token;
    const response = await this._fetchImpl('https://oauth2.googleapis.com/token', {
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams(this._withSecret({ client_id:this.clientId, refresh_token:auth.refresh_token, grant_type:'refresh_token' })),
    });
    const tokens = await response.json();
    if (!response.ok || !tokens.access_token) {
      if (tokens.error === 'invalid_grant') await this.disconnect();
      throw new Error(tokens.error_description || tokens.error || 'Could not refresh Google Drive sign-in. Reconnect Drive.');
    }
    auth = { ...auth, access_token:tokens.access_token, expires_at:Date.now() + Number(tokens.expires_in || 3600) * 1000 };
    this._saveAuth(auth);
    return auth.access_token;
  }

  async _api(url, options = {}) {
    const token = await this._accessToken();
    const headers = { ...(options.headers || {}), Authorization:`Bearer ${token}` };
    const response = await this._fetchImpl(url, { ...options, headers });
    if (response.status === 401) { const err = new Error('Google Drive sign-in expired. Reconnect the owner account.'); err.code = 401; throw err; }
    if (!response.ok) {
      let message = `Google Drive request failed (${response.status}).`;
      try { const body = await response.json(); message = body.error?.message || message; } catch {}
      const err = new Error(message); err.code = response.status; throw err;
    }
    return response;
  }

  async _folderId() {
    let id = this.settings.getSetting('drive_folder_id');
    if (id) {
      try {
        const response = await this._api(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,mimeType,trashed`);
        const folder = await response.json();
        if (folder.mimeType === 'application/vnd.google-apps.folder' && !folder.trashed) return id;
        this.settings.updateSettings({ drive_folder_id:'' });
      } catch (err) {
        if (err.code !== 404) throw err;
        this.settings.updateSettings({ drive_folder_id:'' });
      }
    }
    const response = await this._api('https://www.googleapis.com/drive/v3/files?fields=files(id,name,mimeType)&pageSize=100', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ name:'Shop Manager Backups', mimeType:'application/vnd.google-apps.folder', appProperties:{ shopManagerBackupFolder:'true' } }),
    });
    const folder = await response.json();
    this.settings.updateSettings({ drive_folder_id:folder.id });
    return folder.id;
  }

  async listBackups() {
    const folderId = await this._folderId();
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${folderId}' in parents and trashed = false`);
    url.searchParams.set('orderBy','createdTime desc');
    url.searchParams.set('pageSize','1000');
    url.searchParams.set('fields','files(id,name,size,createdTime,mimeType)');
    const response = await this._api(url.toString());
    const data = await response.json();
    return (data.files || []).filter((f) => f.name && f.name.startsWith('LIMBackup-') && f.name.endsWith('.db'));
  }

  async _uploadChunked(localPath, existingId, folderId, filename) {
    const stat = this.fs.statSync(localPath);
    const endpoint = existingId
      ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingId)}?uploadType=resumable&fields=id,name,size,createdTime`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,createdTime';
    const metadata = { name:filename, mimeType:'application/x-sqlite3', appProperties:{ shopManagerBackup:'true' } };
    if (!existingId) metadata.parents = [folderId];
    const start = await this._api(endpoint, {
      method:existingId ? 'PATCH' : 'POST',
      headers:{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':'application/x-sqlite3','X-Upload-Content-Length':String(stat.size)},
      body:JSON.stringify(metadata),
    });
    const session = start.headers.get('location');
    if (!session) throw new Error('Google Drive did not start the backup upload.');
    const fd = this.fs.openSync(localPath, 'r');
    let offset = 0;
    let noProgressResponses = 0;
    const chunkSize = 8 * 1024 * 1024;
    try {
      while (offset < stat.size) {
        const size = Math.min(chunkSize, stat.size - offset);
        const chunk = Buffer.allocUnsafe(size);
        this.fs.readSync(fd, chunk, 0, size, offset);
        const end = offset + size - 1;
        const token = await this._accessToken();
        const response = await this._fetchImpl(session, { method:'PUT', headers:{
          Authorization:`Bearer ${token}`, 'Content-Type':'application/x-sqlite3', 'Content-Length':String(size), 'Content-Range':`bytes ${offset}-${end}/${stat.size}`,
        }, body:chunk });
        if (response.status === 308) {
          const range = response.headers.get('range');
          const nextOffset = range ? Number(range.split('-').pop()) + 1 : 0;
          noProgressResponses = nextOffset > offset ? 0 : noProgressResponses + 1;
          if (noProgressResponses > 5) throw new Error('Google Drive upload did not make progress. Retry the backup upload.');
          offset = nextOffset;
          continue;
        }
        if (!response.ok) {
          let message = `Google Drive upload failed (${response.status}).`;
          try { const body = await response.json(); message = body.error?.message || message; } catch {}
          throw new Error(message);
        }
        offset = stat.size;
        return response.json();
      }
    } finally { this.fs.closeSync(fd); }
    throw new Error('Google Drive upload finished without a file response.');
  }

  async uploadBackup(localPath) {
    const verified = backupFiles.verify(localPath);
    if (!verified.ok) throw new Error(`Refusing to upload an invalid backup: ${verified.error}`);
    const folderId = await this._folderId();
    const filename = `LIMBackup-${path.basename(localPath)}`;
    const existing = (await this.listBackups()).find((f) => f.name === filename);
    const file = await this._uploadChunked(localPath, existing && existing.id, folderId, filename);
    const uploadedAt = new Date().toISOString();
    this.settings.updateSettings({ drive_last_upload_at:uploadedAt, drive_last_upload_file:path.basename(localPath), drive_last_error:'' });
    await this._pruneRemote();
    return { id:file.id, name:file.name, size:Number(file.size || 0), uploadedAt };
  }

  async _pruneRemote() {
    const keep = Math.max(1, Math.min(365, Number(this.settings.getSetting('drive_backup_retention') || 30)));
    const files = await this.listBackups();
    for (const file of files.slice(keep)) await this._api(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`, { method:'DELETE' });
  }

  async downloadBackup(fileId) {
    const files = await this.listBackups();
    const file = files.find((f) => f.id === String(fileId));
    if (!file) throw new Error('Google Drive backup not found.');
    const response = await this._api(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`);
    const dir = path.join(this.backupDir, 'drive');
    this.fs.mkdirSync(dir, { recursive:true });
    const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g,'_');
    const destination = path.join(dir, safeName);
    this.fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
    const verified = backupFiles.verify(destination);
    if (!verified.ok) { this.fs.rmSync(destination,{force:true}); throw new Error(`Downloaded backup failed verification: ${verified.error}`); }
    return { path:destination, filename:safeName, size:this.fs.statSync(destination).size };
  }
}

let shared = null;
function getGoogleDriveService() { if (!shared) shared = new GoogleDriveService(); return shared; }
module.exports = { GoogleDriveService, getGoogleDriveService };
