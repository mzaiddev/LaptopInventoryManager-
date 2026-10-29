// Backup & Restore Page
// Top: one big "Back up now" and the online copy (OneDrive or Google Drive), set up in three plain steps.
// Below: what is kept on this PC.
const BackupPage = {
  providers: [
    { id: 'b2', name: 'Backblaze B2', note: 'Free 10 GB. Two keys, no sign-in page.' },
    { id: 'google', name: 'Google Drive', note: 'Free 15 GB.' },
    { id: 'onedrive', name: 'OneDrive', note: 'Free 5 GB.' },
    { id: 'none', name: 'Off', note: 'Only on this PC.' },
  ],

  async load() {
    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Backup & Restore</h1>
          <p>Keep a safe copy of your shop data</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-success" id="backup-now-btn" onclick="BackupPage.backupNow()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            Back up now
          </button>
          <button class="btn btn-secondary" onclick="BackupPage.restoreBackup()">Restore from a file</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:24px;">
        <div class="card-header"><h3>Online backup (a copy outside this PC)</h3></div>
        <div class="card-body" id="cloud-panel"><div class="loading"><div class="spinner"></div></div></div>
      </div>

      <div class="card" style="margin-bottom:24px;">
        <div class="card-header"><h3>Daily copies on this PC</h3></div>
        <div class="card-body" id="automatic-backup-container"><div class="loading"><div class="spinner"></div></div></div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Backup history on this PC</h3></div>
        <div class="card-body">
          <div id="backup-history-container"><div class="loading"><div class="spinner"></div></div></div>
        </div>
      </div>
    `;

    await Promise.all([this.loadHistory(), this.loadAutomatic(), this.loadCloud()]);
  },

  async refresh() {
    await Promise.all([this.loadHistory(), this.loadAutomatic(), this.loadCloud()]);
  },

  async loadAutomatic() {
    const container = document.getElementById('automatic-backup-container');
    if (!container) return;
    const result = await window.api.getAutomaticBackups();
    if (!result.success) { container.innerHTML = `<p>${this.escapeHtml(result.error)}</p>`; return; }
    if (!result.data.length) { container.innerHTML = '<p class="text-muted">No daily backup has been created yet. A verified copy is made automatically when the app starts.</p>'; return; }
    container.innerHTML = `<div class="table-wrapper"><table><thead><tr><th>Backup file</th><th>Size</th><th>Last refreshed</th><th>Verification</th><th>Action</th></tr></thead><tbody>${result.data.map((b) => `<tr><td><strong>${this.escapeHtml(b.filename)}</strong></td><td>${Formatters.formatFileSize(b.file_size)}</td><td>${Formatters.formatDateTime(b.modified_at)}</td><td>${b.verified ? '<span class="badge badge-in-stock">Verified</span>' : `<span class="badge badge-lost">Invalid: ${this.escapeHtml(b.error)}</span>`}</td><td><button class="btn btn-sm btn-primary" onclick="BackupPage.restoreAutomatic('${this.escapeHtml(b.filename)}')" ${b.verified ? '' : 'disabled'}>Restore</button></td></tr>`).join('')}</tbody></table></div>`;
  },

  restoreAutomatic(filename) {
    Modal.showConfirm('Restore automatic backup', `Restore "${filename}"? The current database will first be preserved as a safety copy and the app will restart.`, async () => {
      const result = await window.api.restoreAutomaticBackup(filename);
      if (!result.success) Toast.error(result.error || 'Restore failed.');
    });
  },

  // ---- Online backup
  setupSteps(provider) {
    if (provider === 'b2') {
      return `<ol class="backup-steps">
        <li>Open <strong>backblaze.com</strong>, click <strong>Sign Up</strong>, choose <strong>B2 Cloud Storage</strong> and create a free account (10 GB free).</li>
        <li>Open <strong>B2 Cloud Storage &rarr; Buckets &rarr; Create a Bucket</strong>. Name it, for example, <strong>shop-backups-yourname</strong> (the name must be unique). Keep <strong>Files in Bucket are: Private</strong>. Click <strong>Create a Bucket</strong>.</li>
        <li>Open <strong>Application Keys &rarr; Add a New Application Key</strong>. Name: <strong>Shop Manager</strong>. Allow access to bucket: <strong>choose your bucket</strong>. Type of access: <strong>Read and Write</strong>. Click <strong>Create New Key</strong>.</li>
        <li>Copy the <strong>keyID</strong> and the <strong>applicationKey</strong> now. Backblaze shows the applicationKey only once. If you lose it, create a new key.</li>
        <li>Paste both here and click <strong>Connect Backblaze B2</strong>.</li>
      </ol>`;
    }
    if (provider === 'onedrive') {
      return `<ol class="backup-steps">
        <li>Open <strong>entra.microsoft.com</strong> and sign in with your Microsoft account (Outlook, Hotmail or any).</li>
        <li>Go to <strong>Entra ID &rarr; App registrations &rarr; New registration</strong>.</li>
        <li>Name: <strong>Shop Manager Backup</strong>. Supported account types: <strong>Any Entra ID tenant + Personal Microsoft accounts</strong>.</li>
        <li>Redirect URI: choose <strong>Public client/native (mobile &amp; desktop)</strong> and type <strong>http://localhost</strong>. Click <strong>Register</strong>.</li>
        <li>On the page that opens, copy <strong>Application (client) ID</strong> and paste it here. There is no secret to copy.</li>
      </ol>`;
    }
    return `<ol class="backup-steps">
      <li>Open <strong>console.cloud.google.com</strong>, create a project, and enable <strong>Google Drive API</strong>.</li>
      <li>Set up the <strong>OAuth consent screen</strong> (External) with the scope <strong>drive.file</strong>, then click <strong>Publish app</strong>.</li>
      <li><strong>Credentials &rarr; Create credentials &rarr; OAuth client ID &rarr; Desktop app</strong>.</li>
      <li>Copy the <strong>Client ID</strong> and the <strong>Client secret</strong> and paste both here.</li>
    </ol>`;
  },

  async loadCloud() {
    const panel = document.getElementById('cloud-panel');
    if (!panel) return;
    try {
      const statusResult = await window.api.cloudStatus();
      if (!statusResult.success) throw new Error(statusResult.error || 'Could not read the online backup status.');
      const s = statusResult.data;
      this.cloud = s;
      const choice = this.providers.map((p) => `
        <button class="backup-choice${s.provider === p.id ? ' active' : ''}" onclick="BackupPage.chooseProvider('${p.id}')">
          <strong>${p.name}</strong><small>${p.note}</small>
        </button>`).join('');

      let body = '';
      if (s.provider === 'none') {
        body = '<p class="text-muted" style="margin-top:14px;">Online backup is off. Your backups stay only on this PC. If the PC breaks, they are lost. Choose OneDrive or Google Drive above to keep a copy online.</p>';
      } else if (!s.connected) {
        const google = s.provider === 'google';
        const b2 = s.provider === 'b2';
        const what = b2 ? 'Backblaze keys' : google ? 'Google Client ID and secret' : 'OneDrive Application (client) ID';
        const idLabel = b2 ? 'Key ID (keyID)' : google ? 'Client ID' : 'Application (client) ID';
        const idHint = b2 ? '0051234567890ab0000000001' : google ? '1234-abc.apps.googleusercontent.com' : '12345678-90ab-cdef-1234-567890abcdef';
        const hasSecret = b2 || google;
        const secretLabel = b2 ? 'Application Key (applicationKey)' : 'Client secret';
        const secretHint = s.secretSaved ? 'Saved. Leave empty to keep it' : (b2 ? 'K005...' : 'GOCSPX-...');
        body = `
          <div class="backup-setup">
            <div class="backup-step-title"><span>1</span> Paste your ${what}</div>
            <div class="form-row" style="align-items:flex-end;">
              <div class="form-group" style="flex:2;min-width:260px;">
                <label>${idLabel}</label>
                <input id="cloud-client-id" class="form-control" type="text" autocomplete="off" value="${this.escapeHtml(s.clientId || '')}" placeholder="${idHint}">
              </div>
              ${hasSecret ? `<div class="form-group" style="flex:2;min-width:260px;">
                <label>${secretLabel}</label>
                <input id="cloud-client-secret" class="form-control" type="password" autocomplete="off" placeholder="${secretHint}">
              </div>` : ''}
              ${b2 ? `<div class="form-group" style="flex:1;min-width:220px;">
                <label>Bucket name (only if the key covers all buckets)</label>
                <input id="cloud-bucket" class="form-control" type="text" autocomplete="off" value="${this.escapeHtml(s.bucket || '')}" placeholder="optional">
              </div>` : ''}
            </div>
            <div class="backup-step-title"><span>2</span> ${b2 ? 'Check the keys' : 'Sign in with your ' + (google ? 'Google' : 'Microsoft') + ' account'}</div>
            <button id="cloud-connect-btn" class="btn btn-primary" onclick="BackupPage.connectCloud()">Connect ${s.label}</button>
            <small style="margin-left:10px;color:var(--text-muted);">${b2 ? 'The app tests the keys and your bucket. Nothing is uploaded yet.' : 'Your browser opens. Allow access, then come back here.'}</small>
            <details class="backup-help"><summary>Where do I get ${b2 ? 'the keys' : google ? 'the Client ID and secret' : 'the Application (client) ID'}?</summary>${this.setupSteps(s.provider)}</details>
          </div>`;
      } else {
        let files = [];
        let listError = '';
        const list = await window.api.listCloudBackups();
        if (list.success) files = list.data || [];
        else listError = list.error || 'Could not read the list.';
        const hours = [0, 1, 3, 6, 12, 24].map((h) => `<option value="${h}" ${Number(s.autoHours) === h ? 'selected' : ''}>${h === 0 ? 'Only when the app opens' : `Every ${h} hour${h === 1 ? '' : 's'}`}</option>`).join('');
        body = `
          <div class="backup-connected">
            <span class="badge badge-in-stock">Connected</span>
            <strong>${this.escapeHtml(s.label)}</strong>${s.account ? ` &middot; ${this.escapeHtml(s.account)}` : ''}
            <button class="btn btn-sm btn-secondary" style="margin-left:auto;" onclick="BackupPage.disconnectCloud()">Disconnect</button>
          </div>
          <div class="backup-auto">
            <label class="backup-switch"><input type="checkbox" id="cloud-auto" ${s.autoUpload ? 'checked' : ''} onchange="BackupPage.saveAuto()"> <span><strong>Upload automatically</strong><small>Every daily backup is copied online by itself.</small></span></label>
            <div class="form-row" style="margin-top:10px;">
              <div class="form-group" style="max-width:300px;">
                <label>Repeat while the app is open</label>
                <select class="form-control" id="cloud-hours" onchange="BackupPage.saveAuto()">${hours}</select>
              </div>
              <div class="form-group" style="max-width:200px;">
                <label>Keep the last</label>
                <input id="cloud-retention" class="form-control" type="number" min="1" max="365" value="${this.escapeHtml(String(s.retention))}" onchange="BackupPage.saveAuto()">
              </div>
            </div>
          </div>
          <p style="margin:10px 0;color:var(--text-secondary);"><strong>Last upload:</strong> ${this.escapeHtml(s.lastUploadedAt ? Formatters.formatDateTime(s.lastUploadedAt) : 'None yet')} ${s.lastUploadedFile ? '(' + this.escapeHtml(s.lastUploadedFile) + ')' : ''}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
            <button class="btn btn-secondary" onclick="BackupPage.backupNow()">Back up and upload now</button>
            <button class="btn btn-secondary" onclick="BackupPage.retryUploads()">Retry failed uploads</button>
          </div>
          <div class="table-wrapper"><table><thead><tr><th>Online backup</th><th>Size</th><th>Created</th><th>Action</th></tr></thead><tbody>${files.length ? files.map((f) => `<tr><td>${this.escapeHtml(f.name)}</td><td>${Formatters.formatFileSize(Number(f.size || 0))}</td><td>${this.escapeHtml(f.createdTime ? Formatters.formatDateTime(f.createdTime) : '—')}</td><td><button class="btn btn-sm btn-primary" onclick="BackupPage.restoreCloudBackup('${this.escapeHtml(f.id)}','${this.escapeHtml(f.name)}')">Download &amp; restore</button></td></tr>`).join('') : `<tr><td colspan="4">${listError ? 'Could not read the online list: ' + this.escapeHtml(listError) : 'Nothing uploaded yet. Press Back up and upload now.'}</td></tr>`}</tbody></table></div>`;
      }

      panel.innerHTML = `
        <div class="backup-choices">${choice}</div>
        ${s.error && s.provider !== 'none' ? `<div class="backup-issue"><strong>Last problem:</strong> ${this.escapeHtml(s.error)}</div>` : ''}
        ${body}`;
    } catch (err) {
      panel.innerHTML = `<div class="empty-state"><h3>Online backup status unavailable</h3><p>${this.escapeHtml(err.message)}</p></div>`;
    }
  },

  async chooseProvider(id) {
    const r = await window.api.saveCloudSettings({ provider: id });
    if (!r.success) { Toast.error(r.error || 'Could not change the online backup.'); return; }
    await this.loadCloud();
  },

  async saveAuto() {
    const r = await window.api.saveCloudSettings({
      autoUpload: !!document.getElementById('cloud-auto')?.checked,
      autoHours: document.getElementById('cloud-hours')?.value,
      retention: document.getElementById('cloud-retention')?.value,
    });
    if (!r.success) { Toast.error(r.error || 'Could not save.'); return; }
    Toast.success('Saved.');
  },

  async connectCloud() {
    const provider = this.cloud && this.cloud.provider;
    const button = document.getElementById('cloud-connect-btn');
    const saved = await window.api.saveCloudSettings({
      provider,
      clientId: document.getElementById('cloud-client-id')?.value,
      clientSecret: document.getElementById('cloud-client-secret')?.value,
      bucket: document.getElementById('cloud-bucket')?.value,
    });
    if (!saved.success) { Toast.error(saved.error); return; }
    if (!saved.data.configured) { Toast.error(provider === 'b2' ? 'Paste the Key ID first (step 1).' : 'Paste the Client ID first (step 1).'); return; }
    if ((provider === 'google' || provider === 'b2') && !saved.data.secretSaved) { Toast.error(provider === 'b2' ? 'Paste the Application Key too.' : 'Paste the Google Client secret too.'); return; }
    if (button) { button.disabled = true; button.textContent = provider === 'b2' ? 'Checking the keys…' : 'Waiting for sign-in…'; }
    if (provider !== 'b2') Toast.info('Opening the sign-in page in your browser…');
    const r = await window.api.connectCloud();
    if (!r.success) Toast.error(r.error || 'Could not connect.');
    else Toast.success(`${saved.data.label} connected. The first backup is uploading.`);
    await this.refresh();
  },

  disconnectCloud() {
    const label = (this.cloud && this.cloud.label) || 'the online backup';
    Modal.showConfirm(`Disconnect ${label}`, 'Automatic uploads will stop. Copies already online stay in your account.', async () => {
      const r = await window.api.disconnectCloud();
      if (!r.success) Toast.error(r.error || 'Could not disconnect.');
      else Toast.success('Disconnected.');
      await this.loadCloud();
    });
  },

  // One button: make a verified copy on this PC and, when the online backup is connected, upload it too.
  async backupNow() {
    const button = document.getElementById('backup-now-btn');
    if (button) button.disabled = true;
    try {
      const r = await window.api.createBackup();
      if (!r.success) Toast.error(r.error || 'Could not create the backup.');
      else Toast.success(r.data.cloud ? `Backup created. Uploading to ${(this.cloud && this.cloud.label) || 'the cloud'}: watch Tasks (top right).` : 'Backup created on this PC.');
    } catch (err) {
      Toast.error('Could not create the backup: ' + err.message);
    }
    if (button) button.disabled = false;
    await Promise.all([this.loadHistory(), this.loadCloud()]);
    if (window.TaskCenter) TaskCenter.refresh();
  },

  async retryUploads() {
    const r = await window.api.retryCloudUploads();
    if (!r.success) Toast.error(r.error || 'Could not retry uploads.');
    else Toast.success(r.data.retried ? `Retrying ${r.data.retried} upload(s).` : 'Nothing to retry.');
  },

  async restoreCloudBackup(fileId, name) {
    Modal.showConfirm('Restore online backup', `Download and restore "${name}"? The current database will be preserved as a safety copy, then the app will restart.`, async () => {
      const downloaded = await window.api.downloadCloudBackup(fileId);
      if (!downloaded.success) { Toast.error(downloaded.error || 'Backup download failed.'); return; }
      const restored = await window.api.restoreBackup(downloaded.data.path);
      if (!restored.success) Toast.error(restored.error || 'Restore failed.');
    });
  },

  async loadHistory() {
    const container = document.getElementById('backup-history-container');
    if (!container) return;

    try {
      const result = await window.api.getBackupHistory();
      if (!result.success) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${result.error}</p></div>`;
        return;
      }

      if (!result.data || result.data.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            <h3>No backups yet</h3>
            <p>Create your first backup to start protecting your data.</p>
          </div>
        `;
        return;
      }

      let html = '<div class="table-wrapper"><table><thead><tr>' +
        '<th>#</th>' +
        '<th>Filename</th>' +
        '<th>Size</th>' +
        '<th>Created</th>' +
        '<th>Verification</th>' +
        '<th>Actions</th>' +
        '</tr></thead><tbody>';

      result.data.forEach((backup, index) => {
        html += `<tr>
          <td>${index + 1}</td>
          <td><strong>${this.escapeHtml(backup.filename)}</strong></td>
          <td>${Formatters.formatFileSize(backup.file_size)}</td>
          <td>${Formatters.formatDateTime(backup.created_at)}</td>
          <td>${backup.verified ? '<span class="badge badge-in-stock">Verified</span>' : `<span class="badge badge-lost">Invalid</span>`}</td>
          <td>
            <div class="action-buttons">
              <button class="btn btn-sm btn-primary" onclick="BackupPage.restoreSpecificBackup(${backup.id}, '${this.escapeHtml(backup.filename)}')" title="Restore this backup" ${backup.verified ? '' : 'disabled'}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                </svg>
                Restore
              </button>
              <button class="btn btn-sm btn-danger" onclick="BackupPage.deleteBackup(${backup.id})" title="Delete backup">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Delete
              </button>
            </div>
          </td>
        </tr>`;
      });

      html += '</tbody></table></div>';
      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  },

  restoreSpecificBackup(backupId, filename) {
    Modal.showConfirm(
      'Restore Backup',
      `Are you sure you want to restore "${filename}"? This will replace your current database and restart the application.`,
      async () => {
        try {
          // Get backup details
          const result = await window.api.getBackupHistory();
          if (!result.success) {
            Toast.error('Failed to get backup details.');
            return;
          }

          const backup = result.data.find(b => b.id === backupId);
          if (!backup) {
            Toast.error('Backup not found.');
            return;
          }

          Toast.warning('Restoring backup. Application will restart...');
          const restoreResult = await window.api.restoreBackup(backup.filepath);
          if (restoreResult.success) {
            // App will restart automatically
          } else {
            Toast.error(restoreResult.error || 'Restore failed.');
          }
        } catch (err) {
          Toast.error('Restore failed: ' + err.message);
        }
      }
    );
  },

  async restoreBackup() {
    try {
      const fileResult = await window.api.selectBackupFile();
      if (!fileResult.success || !fileResult.data) {
        return; // User cancelled
      }

      Modal.showConfirm(
        'Restore Backup',
        `Are you sure you want to restore from "${fileResult.data.split('\\').pop()}"? This will replace your current database and restart the application. Make sure you have a current backup before proceeding.`,
        async () => {
          try {
            Toast.warning('Restoring backup. Application will restart...');
            const restoreResult = await window.api.restoreBackup(fileResult.data);
            if (restoreResult.success) {
              // App will restart automatically
            } else {
              Toast.error(restoreResult.error || 'Restore failed.');
            }
          } catch (err) {
            Toast.error('Restore failed: ' + err.message);
          }
        }
      );
    } catch (err) {
      Toast.error('Failed to select backup file: ' + err.message);
    }
  },

  async deleteBackup(backupId) {
    Modal.showConfirm(
      'Delete Backup',
      'Are you sure you want to delete this backup? This action cannot be undone.',
      async () => {
        try {
          const result = await window.api.deleteBackup(backupId);
          if (result.success) {
            Toast.success('Backup deleted.');
            this.loadHistory();
          } else {
            Toast.error(result.error || 'Failed to delete backup.');
          }
        } catch (err) {
          Toast.error('Failed to delete backup: ' + err.message);
        }
      }
    );
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
