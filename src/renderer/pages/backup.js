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

    await this.loadHistory();
  },

  async refresh() {
    await this.loadHistory();
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
        '<th>Actions</th>' +
        '</tr></thead><tbody>';

      result.data.forEach((backup, index) => {
        html += `<tr>
          <td>${index + 1}</td>
          <td><strong>${this.escapeHtml(backup.filename)}</strong></td>
          <td>${Formatters.formatFileSize(backup.file_size)}</td>
          <td>${Formatters.formatDateTime(backup.created_at)}</td>
          <td>
            <div class="action-buttons">
              <button class="btn btn-sm btn-primary" onclick="BackupPage.restoreSpecificBackup(${backup.id}, '${this.escapeHtml(backup.filename)}')" title="Restore this backup">
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
      const result = await window.api.restoreBackup();
      // If selectFile was cancelled, result.data will be null
      // Handled via backup:selectFile IPC
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