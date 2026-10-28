// Backup & Restore Page
const BackupPage = {
  async load() {
    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Backup & Restore</h1>
          <p>Manage database backups</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-success" onclick="BackupPage.createBackup()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            Create Backup
          </button>
          <button class="btn btn-primary" onclick="BackupPage.restoreBackup()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
            Restore Backup
          </button>
        </div>
      </div>

      <div class="card" style="margin-bottom:24px;">
        <div class="card-header">
          <h3>Create New Backup</h3>
        </div>
        <div class="card-body">
          <p style="color:var(--text-secondary);margin-bottom:16px;">
            Create a manual backup of your database. Backups are stored in your application data folder and never overwrite previous backups.
          </p>
          <button class="btn btn-success" onclick="BackupPage.createBackup()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            Create Backup Now
          </button>
        </div>
      </div>

      <div class="card" style="margin-bottom:24px;">
        <div class="card-header"><h3>Daily automatic backups (local)</h3></div>
        <div class="card-body" id="automatic-backup-container"><div class="loading"><div class="spinner"></div></div></div>
      </div>

      <div class="card" style="margin-bottom:24px;">
        <div class="card-header"><h3>Owner's Google Drive</h3></div>
        <div class="card-body" id="drive-backup-panel"><div class="loading"><div class="spinner"></div></div></div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Backup History</h3>
        </div>
        <div class="card-body">
          <div id="backup-history-container">
            <div class="loading"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    `;

    await Promise.all([this.loadHistory(), this.loadAutomatic(), this.loadDrive()]);
  },

  async refresh() {
    await Promise.all([this.loadHistory(), this.loadAutomatic(), this.loadDrive()]);
  },

  async loadAutomatic() {
    const container = document.getElementById('automatic-backup-container');
    if (!container) return;
    const result = await window.api.getAutomaticBackups();
    if (!result.success) { container.innerHTML = `<p>${this.escapeHtml(result.error)}</p>`; return; }
    if (!result.data.length) { container.innerHTML = '<p class="text-muted">No daily backup has been created yet. A verified local copy is refreshed automatically when the app starts.</p>'; return; }
    container.innerHTML = `<div class="table-wrapper"><table><thead><tr><th>Backup file</th><th>Size</th><th>Last refreshed</th><th>Verification</th><th>Action</th></tr></thead><tbody>${result.data.map((b) => `<tr><td><strong>${this.escapeHtml(b.filename)}</strong></td><td>${Formatters.formatFileSize(b.file_size)}</td><td>${Formatters.formatDateTime(b.modified_at)}</td><td>${b.verified ? '<span class="badge badge-in-stock">Verified</span>' : `<span class="badge badge-lost">Invalid: ${this.escapeHtml(b.error)}</span>`}</td><td><button class="btn btn-sm btn-primary" onclick="BackupPage.restoreAutomatic('${this.escapeHtml(b.filename)}')" ${b.verified ? '' : 'disabled'}>Restore</button></td></tr>`).join('')}</tbody></table></div>`;
  },

  restoreAutomatic(filename) {
    Modal.showConfirm('Restore automatic backup', `Restore "${filename}"? The current database will first be preserved as a safety copy and the app will restart.`, async () => {
      const result = await window.api.restoreAutomaticBackup(filename);
      if (!result.success) Toast.error(result.error || 'Restore failed.');
    });
  },

  async loadDrive() {
    const panel = document.getElementById('drive-backup-panel');
    if (!panel) return;
    try {
      const [statusResult, settingsResult] = await Promise.all([window.api.driveStatus(), window.api.getSettings()]);
      if (!statusResult.success) throw new Error(statusResult.error || 'Could not read Drive status.');
      const status = statusResult.data;
      const settings = settingsResult.success ? settingsResult.data : {};
      let files = [];
      if (status.connected) {
        const result = await window.api.listDriveBackups();
        if (result.success) files = result.data || [];
      }
      panel.innerHTML = `
        <p style="color:var(--text-secondary);margin:0 0 16px;">Automatic database copies go to the Google account connected by the owner. Uploads run in the background after a local backup is verified.</p>
        <div class="form-row" style="align-items:flex-end;">
          <div class="form-group" style="flex:2;min-width:280px;">
            <label>Google OAuth desktop client ID</label>
            <input id="drive-client-id" class="form-control" type="text" value="${this.escapeHtml(settings.google_drive_client_id || '')}" placeholder="Configured by your app provider or Google Cloud project" ${status.connected ? 'disabled' : ''}>
            <small>From Google Cloud: APIs &amp; Services > Credentials > your Desktop app client.</small>
          </div>
          <div class="form-group" style="flex:2;min-width:280px;">
            <label>Google client secret</label>
            <input id="drive-client-secret" class="form-control" type="password" autocomplete="off" placeholder="${status.secretSaved ? 'Saved. Leave empty to keep it' : 'GOCSPX-...'}" ${status.connected ? 'disabled' : ''}>
            <small>Saved encrypted on this PC. The owner then signs in to their own Google account.</small>
          </div>
          <div class="form-group" style="max-width:180px;">
            <label>Keep Drive backups</label>
            <input id="drive-retention" class="form-control" type="number" min="1" max="365" value="${this.escapeHtml(settings.drive_backup_retention || '30')}">
          </div>
          <div class="form-group" style="display:flex;gap:8px;">
            <button class="btn btn-secondary" onclick="BackupPage.saveDriveSettings()">Save Drive settings</button>
            ${status.connected ? '<button class="btn btn-danger" onclick="BackupPage.disconnectDrive()">Disconnect</button>' : '<button id="drive-connect-btn" class="btn btn-primary" onclick="BackupPage.connectDrive()" ' + '>Connect owner Drive</button>'}
          </div>
        </div>
        <div class="form-row" style="gap:16px;margin-top:8px;">
          <span><strong>Connection:</strong> ${status.connected ? 'Connected' : (status.configured && status.secretSaved) ? 'Not connected' : 'Enter the Client ID and secret, then click Connect'}</span>
          <span><strong>Last upload:</strong> ${this.escapeHtml(status.lastUploadedAt ? Formatters.formatDateTime(status.lastUploadedAt) : 'None yet')}</span>
          <span><strong>Last file:</strong> ${this.escapeHtml(status.lastUploadedFile || '—')}</span>
          ${status.error ? '<span style="color:var(--danger);"><strong>Latest issue:</strong> ' + this.escapeHtml(status.error) + '</span>' : ''}
        </div>
        ${status.connected ? `<div style="display:flex;gap:8px;margin:12px 0;"><button class="btn btn-secondary" onclick="BackupPage.uploadLatestBackup()">Back up and upload now</button><button class="btn btn-secondary" onclick="BackupPage.retryDriveUploads()">Retry failed uploads</button></div><div class="table-wrapper"><table><thead><tr><th>Drive backup</th><th>Size</th><th>Created</th><th>Action</th></tr></thead><tbody>${files.length ? files.map((f) => `<tr><td>${this.escapeHtml(f.name)}</td><td>${Formatters.formatFileSize(Number(f.size || 0))}</td><td>${this.escapeHtml(f.createdTime ? Formatters.formatDateTime(f.createdTime) : '—')}</td><td><button class="btn btn-sm btn-primary" onclick="BackupPage.restoreDriveBackup('${this.escapeHtml(f.id)}','${this.escapeHtml(f.name)}')">Download &amp; restore</button></td></tr>`).join('') : '<tr><td colspan="4">No Drive backups found yet.</td></tr>'}</tbody></table></div>` : '<p style="margin-top:12px;color:var(--text-muted);">Local automatic backups continue while Drive is disconnected. Connect once to enable off-device copies.</p>'}
      `;
    } catch (err) {
      panel.innerHTML = `<div class="empty-state"><h3>Google Drive status unavailable</h3><p>${this.escapeHtml(err.message)}</p></div>`;
    }
  },

  driveFormValues() {
    return {
      clientId: document.getElementById('drive-client-id')?.value,
      clientSecret: document.getElementById('drive-client-secret')?.value,
      retention: document.getElementById('drive-retention')?.value,
    };
  },

  async saveDriveSettings() {
    const r = await window.api.saveDriveSettings(this.driveFormValues());
    if (!r.success) { Toast.error(r.error || 'Could not save Drive settings.'); return; }
    Toast.success('Drive settings saved.');
    await this.loadDrive();
  },

  async connectDrive() {
    const button = document.getElementById('drive-connect-btn');
    const saved = await window.api.saveDriveSettings(this.driveFormValues());
    if (!saved.success) { Toast.error(saved.error); return; }
    if (!saved.data.configured) { Toast.error('Enter the Google Client ID first.'); return; }
    if (!saved.data.secretSaved) { Toast.error('Enter the Google Client secret too.'); return; }
    if (button) { button.disabled = true; button.textContent = 'Waiting for Google sign-in…'; }
    Toast.info('Opening Google sign-in in your browser…');
    const r = await window.api.connectDrive();
    if (!r.success) Toast.error(r.error || 'Google Drive connection failed.');
    else Toast.success('Owner Google Drive connected. A verified backup upload has been queued.');
    await this.loadDrive();
  },

  async disconnectDrive() {
    Modal.showConfirm('Disconnect Google Drive', 'Automatic cloud uploads will stop. Existing Drive backups remain in the owner account.', async () => {
      const r = await window.api.disconnectDrive();
      if (!r.success) Toast.error(r.error || 'Could not disconnect Drive.');
      else Toast.success('Google Drive disconnected.');
      await this.loadDrive();
    });
  },

  async uploadLatestBackup() {
    const r = await window.api.createBackup();
    if (!r.success) Toast.error(r.error || 'Could not create backup.');
    else Toast.success(r.data.cloud ? 'Verified backup created. Upload is running in Task Center.' : 'Verified local backup created.');
    await Promise.all([this.loadHistory(), this.loadDrive()]);
  },

  async retryDriveUploads() {
    const r = await window.api.retryDriveBackups();
    if (!r.success) Toast.error(r.error || 'Could not retry uploads.');
    else Toast.success(`Retried ${r.data.retried} upload task(s).`);
  },

  async restoreDriveBackup(fileId, name) {
    Modal.showConfirm('Restore Drive backup', `Download and restore "${name}"? The current database will be preserved as a safety copy, then the app will restart.`, async () => {
      const downloaded = await window.api.downloadDriveBackup(fileId);
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

  async createBackup() {
    try {
      Toast.success('Creating backup...');
      const result = await window.api.createBackup();
      if (result.success) {
        Toast.success('Backup created successfully!');
        this.loadHistory();
      } else {
        Toast.error(result.error || 'Failed to create backup.');
      }
    } catch (err) {
      Toast.error('Failed to create backup: ' + err.message);
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
