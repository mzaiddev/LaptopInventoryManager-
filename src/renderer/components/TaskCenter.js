const TaskCenter = {
  tasks: [],
  openState: false,
  initialized: false,
  refreshTimer: null,
  _esc(v) { return ShopInfo.esc(v == null ? '' : String(v)); },

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    window.api.onTaskChanged((change) => {
      if (change && change.task) {
        const i = this.tasks.findIndex((x) => x.id === change.task.id);
        if (i >= 0) this.tasks[i] = change.task;
        else this.tasks.unshift(change.task);
        this._updateCount();
      }
      // An upload that just finished changes the online list on the Backup page, so redraw it.
      const t = change && change.task;
      if (t && t.kind === 'drive.upload' && ['done', 'partial', 'failed'].includes(t.status) && typeof App !== 'undefined' && App.currentPage === 'backup' && typeof BackupPage !== 'undefined') BackupPage.loadCloud();
      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => this.refresh(), 120);
    });
    document.addEventListener('pointerdown', (e) => {
      const root = document.getElementById('task-center-root');
      if (this.openState && root && !root.contains(e.target)) this.close();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.openState) this.close(); });
    await this.refresh();
  },

  async refresh() {
    const result = await window.api.listTasks();
    if (!result || !result.success) return;
    const recent = result.data || [];
    const detailed = await Promise.all(recent.slice(0, 12).map(async (j) => {
      const r = await window.api.getTask(j.id);
      return r && r.success && r.data ? r.data : j;
    }));
    this.tasks = [...detailed, ...recent.slice(12)];
    this._updateCount();
    if (this.openState) this.render();
  },

  _updateCount() {
    const count = document.getElementById('task-center-count');
    if (!count) return;
    const n = this.tasks.filter((j) => ['queued','running','paused','interrupted'].includes(j.status)).length;
    count.textContent = String(n);
    count.style.display = n ? 'inline-flex' : 'none';
    // The loader shows while something is really working, so the owner can keep using the app and see it going.
    const working = this.tasks.some((j) => ['queued','running'].includes(j.status));
    const spin = document.getElementById('task-center-spin');
    if (spin) spin.style.display = working ? 'inline-block' : 'none';
    const btn = document.getElementById('task-center-toggle');
    if (btn) {
      btn.classList.toggle('working', working);
      btn.title = working ? 'Working in the background. You can keep using the app.' : n ? `${n} tasks need attention` : 'Background task history';
    }
  },

  toggle() { this.openState ? this.close() : this.open(); },
  // `highlightId` opens the list with that one task marked (used by the bell alerts).
  async open(highlightId) {
    this.highlightId = highlightId || null;
    this.openState = true;
    const panel = document.getElementById('task-center-panel');
    const btn = document.getElementById('task-center-toggle');
    if (panel) panel.style.display = '';
    if (btn) btn.setAttribute('aria-expanded', 'true');
    await this.refresh();
    this.render();
    const marked = panel && panel.querySelector('.task-card.highlight');
    if (marked && marked.scrollIntoView) marked.scrollIntoView({ block: 'nearest' });
  },
  close() {
    this.openState = false;
    this.highlightId = null;
    const panel = document.getElementById('task-center-panel');
    const btn = document.getElementById('task-center-toggle');
    if (panel) panel.style.display = 'none';
    if (btn) btn.setAttribute('aria-expanded', 'false');
  },

  _status(status) {
    const map = { queued:'Queued', running:'Running', paused:'Paused', done:'Complete', partial:'Completed with issues', failed:'Failed', cancelled:'Stopped', interrupted:'Interrupted' };
    return I18n.t(map[status] || status);
  },

  render() {
    const panel = document.getElementById('task-center-panel');
    if (!panel) return;
    const active = this.tasks.filter((j) => ['running','queued','paused','interrupted'].includes(j.status));
    let sorted = [...active, ...this.tasks.filter((j) => !active.includes(j))].slice(0, 12);
    const marked = this.highlightId && this.tasks.find((j) => j.id === this.highlightId);
    if (marked && !sorted.includes(marked)) sorted = [marked, ...sorted.slice(0, 11)];
    panel.innerHTML = `
      <div class="task-center-head"><h3>${this._esc(I18n.t('Background tasks'))}</h3><button class="btn btn-secondary btn-sm" onclick="TaskCenter.refresh()">${this._esc(I18n.t('Refresh'))}</button></div>
      <div class="task-center-list">${sorted.length ? sorted.map((j) => this._taskHtml(j)).join('') : `<div class="empty-state" style="padding:26px 10px;"><p>${this._esc(I18n.t('No background tasks yet.'))}</p></div>`}</div>`;
  },

  _taskHtml(j) {
    const t = (s) => this._esc(I18n.t(s));
    const total = Number(j.total || 0);
    const finished = Number(j.done || 0) + Number(j.skipped || 0) + Number(j.failed || 0);
    const pct = total ? Math.min(100, Math.round(100 * finished / total)) : 0;
    const current = (j.items || []).find((x) => x.status === 'running');
    const issues = (j.items || []).filter((x) => ['failed','skipped','interrupted'].includes(x.status)).slice(0, 4);
    const actions = [];
    if (j.status === 'running' || j.status === 'queued') actions.push(`<button class="btn btn-secondary btn-sm" onclick="TaskCenter.action('stop',${Number(j.id)})">${t('Stop')}</button>`);
    if (['paused','cancelled','interrupted'].includes(j.status) && (j.items || []).some((x) => x.status === 'queued')) actions.push(`<button class="btn btn-primary btn-sm" onclick="TaskCenter.action('resume',${Number(j.id)})">${t('Resume')}</button>`);
    if (Number(j.failed || 0) > 0) actions.push(`<button class="btn btn-secondary btn-sm" onclick="TaskCenter.action('retryFailed',${Number(j.id)})">${t('Retry failed')}</button>`);
    const summary = `${j.done || 0} ${t('done')} · ${j.skipped || 0} ${t('skipped')} · ${j.failed || 0} ${t('failed')}`;
    return `<article class="task-card${this.highlightId === j.id ? ' highlight' : ''}">
      <div class="task-card-top"><div class="task-card-title">${this._esc(j.title)}</div><div class="task-card-state">${['running','queued'].includes(j.status) ? '<span class="task-spin" aria-hidden="true"></span>' : ''}${this._esc(this._status(j.status))}</div></div>
      ${['running','queued'].includes(j.status) ? `<div class="task-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>` : ''}
      <div class="task-card-meta">${this._esc(summary)}${total ? ` · ${finished}/${total}` : ''}</div>
      ${current ? `<div class="task-card-meta">${t('Current')}: ${this._esc(current.label)}</div>` : ''}
      ${j.error ? `<div class="task-card-error">${this._esc(j.error)}</div>` : ''}
      ${issues.map((x) => `<div class="task-card-error">${this._esc(x.label)}: ${this._esc(x.error || this._status(x.status))}</div>`).join('')}
      ${actions.length ? `<div class="task-card-actions">${actions.join('')}</div>` : ''}
    </article>`;
  },

  async action(action, id) {
    const methods = { stop:'stopTask', resume:'resumeTask', retryFailed:'retryFailedTaskItems' };
    const method = methods[action];
    if (!method) return;
    const result = await window.api[method](id);
    if (!result.success) Toast.error(result.error || I18n.t('Could not update task.'));
    await this.refresh();
  },
};

window.TaskCenter = TaskCenter;
