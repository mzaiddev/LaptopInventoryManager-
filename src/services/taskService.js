// Persistent, single-process background task queue. Each lane runs one job at a
// time; separate lanes may work concurrently. Task payloads stay in the local DB.
class TaskService {
  constructor({ getDb, executors = {}, now = () => new Date().toISOString() }) {
    this.getDb = getDb;
    this.executors = executors;
    this.now = now;
    this.runningLanes = new Set();
    this.stopRequested = new Set();
    this.listeners = new Set();
    this.initialized = false;
    this.lastCloudRetryAt = 0;
  }

  db() { return this.getDb(); }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(jobId) {
    const snapshot = jobId ? this.getJob(jobId) : this.list();
    for (const fn of this.listeners) {
      try { fn(snapshot, jobId || null); } catch { /* listeners cannot stop queue work */ }
    }
  }

  initialize() {
    if (this.initialized) return;
    this.initialized = true;
    const db = this.db();
    // Drive uploads replace a same-named file, so retrying after a crash is
    // idempotent. Other running items may have completed externally and need review.
    db.prepare(`UPDATE job_items SET status='queued', error='', updated_at=CURRENT_TIMESTAMP WHERE status='running' AND job_id IN (SELECT id FROM jobs WHERE kind='drive.upload')`).run();
    db.prepare(`UPDATE jobs SET status='queued', error='', finished_at=NULL WHERE status='running' AND kind='drive.upload'`).run();
    // A process crash may happen after WhatsApp accepted a message but before
    // SQLite recorded the result. Never silently resend that uncertain item.
    db.prepare(`UPDATE job_items SET status='interrupted', error=?, updated_at=CURRENT_TIMESTAMP WHERE status='running'`)
      .run('Interrupted while running. Check whether it completed before retrying.');
    db.prepare(`UPDATE jobs SET status='interrupted', error=?, finished_at=CURRENT_TIMESTAMP WHERE status='running'`)
      .run('The app closed while this task was running.');
    for (const { lane } of db.prepare("SELECT DISTINCT lane FROM jobs WHERE status='queued'").all()) this._pump(lane);
  }

  enqueue({ kind, lane, title, items }) {
    if (!this.executors[kind]) throw new Error(`Unsupported task type: ${kind}`);
    if (!Array.isArray(items) || items.length === 0) throw new Error('Add at least one task item.');
    if (items.length > 10000) throw new Error('A task can contain at most 10,000 items.');
    const safeLane = String(lane || (kind.startsWith('whatsapp.') ? 'whatsapp' : 'data')).slice(0, 40);
    const safeTitle = String(title || kind).trim().slice(0, 160) || kind;
    const db = this.db();
    const create = db.transaction(() => {
      const info = db.prepare(`INSERT INTO jobs(kind,lane,title,total,status) VALUES(?,?,?,?,'queued')`)
        .run(kind, safeLane, safeTitle, items.length);
      const insert = db.prepare(`INSERT INTO job_items(job_id,item_key,label,payload_json) VALUES(?,?,?,?)`);
      items.forEach((item, i) => {
        const payload = item && Object.prototype.hasOwnProperty.call(item, 'payload') ? item.payload : item;
        insert.run(info.lastInsertRowid, String(item && item.key !== undefined ? item.key : i).slice(0, 200),
          String(item && item.label || `Item ${i + 1}`).slice(0, 300), JSON.stringify(payload));
      });
      db.prepare(`DELETE FROM jobs WHERE id IN (
        SELECT id FROM jobs WHERE status IN ('done','partial','failed','cancelled','interrupted')
        ORDER BY id DESC LIMIT -1 OFFSET 100
      )`).run();
      return Number(info.lastInsertRowid);
    });
    const id = create();
    this._emit(id);
    this._pump(safeLane);
    return this.getJob(id);
  }

  list(limit = 100) {
    const n = Math.min(200, Math.max(1, Number(limit) || 100));
    return this.db().prepare(`SELECT id,kind,lane,title,status,total,done,skipped,failed,error,created_at,started_at,finished_at FROM jobs ORDER BY id DESC LIMIT ?`).all(n);
  }

  getJob(id) {
    const job = this.db().prepare(`SELECT id,kind,lane,title,status,total,done,skipped,failed,error,created_at,started_at,finished_at FROM jobs WHERE id=?`).get(Number(id));
    if (!job) return null;
    job.items = this.db().prepare(`SELECT id,item_key,label,status,error,result_json,attempts,updated_at FROM job_items WHERE job_id=? ORDER BY id`).all(job.id)
      .map((item) => ({ ...item, result: item.result_json ? this._parse(item.result_json) : null }));
    return job;
  }

  _parse(value) { try { return JSON.parse(value); } catch { return null; } }

  async _pump(lane) {
    if (!lane || this.runningLanes.has(lane)) return;
    this.runningLanes.add(lane);
    try {
      while (true) {
        const job = this.db().prepare(`SELECT id,kind FROM jobs WHERE lane=? AND status='queued' ORDER BY id LIMIT 1`).get(lane);
        if (!job) break;
        await this._run(job);
      }
    } finally {
      this.runningLanes.delete(lane);
      // A task can be added as this pump is finishing.
      const pending = this.db().prepare(`SELECT 1 AS ok FROM jobs WHERE lane=? AND status='queued' LIMIT 1`).get(lane);
      if (pending) this._pump(lane);
    }
  }

  async _run(job) {
    const db = this.db();
    db.prepare(`UPDATE jobs SET status='running', started_at=COALESCE(started_at,CURRENT_TIMESTAMP), finished_at=NULL, error='' WHERE id=?`).run(job.id);
    this._emit(job.id);
    const executor = this.executors[job.kind];
    let consecutiveFailures = 0;
    while (!this.stopRequested.has(job.id)) {
      const item = db.prepare(`SELECT * FROM job_items WHERE job_id=? AND status='queued' ORDER BY id LIMIT 1`).get(job.id);
      if (!item) break;
      db.prepare(`UPDATE job_items SET status='running', attempts=attempts+1, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(item.id);
      this._emit(job.id);
      let status = 'done';
      let error = '';
      let disconnected = false;
      let result = null;
      try {
        result = await executor(this._parse(item.payload_json), { jobId: job.id, itemId: item.id, index: item.id });
      } catch (err) {
        error = String(err && err.message || err).slice(0, 1000);
        disconnected = !!(err && err.code === 'NOT_LINKED');
        status = disconnected ? 'queued' : ['NOT_ON_WHATSAPP','INVALID_NUMBER'].includes(err && err.code) ? 'skipped' : 'failed';
      }
      db.prepare(`UPDATE job_items SET status=?,error=?,result_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(status, error, result == null ? null : JSON.stringify(result), item.id);
      if (status === 'done') consecutiveFailures = 0;
      else if (status === 'failed') consecutiveFailures += 1;
      this._updateCounts(job.id);
      this._emit(job.id);
      if (disconnected) {
        this.stopRequested.delete(job.id);
        db.prepare(`UPDATE jobs SET status='paused',error=?,finished_at=CURRENT_TIMESTAMP WHERE id=?`)
          .run('WhatsApp disconnected. Reconnect it, then resume this task.', job.id);
        this._emit(job.id);
        return;
      }
      if (job.kind.startsWith('whatsapp.') && consecutiveFailures >= 3) {
        db.prepare(`UPDATE jobs SET status='paused',error=?,finished_at=CURRENT_TIMESTAMP WHERE id=?`)
          .run('Paused after three consecutive delivery failures. Review the errors before resuming.', job.id);
        this._emit(job.id);
        return;
      }
    }

    const stopped = this.stopRequested.delete(job.id);
    const counts = this._updateCounts(job.id);
    let status = 'done';
    let error = '';
    if (counts.queued > 0) { status = stopped ? 'cancelled' : 'interrupted'; error = stopped ? 'Stopped by owner.' : 'Items remain queued.'; }
    else if (counts.interrupted > 0) { status = 'interrupted'; error = 'Some items may have completed before the app closed. Review them before retrying.'; }
    else if (counts.failed > 0 || counts.skipped > 0) status = 'partial';
    db.prepare(`UPDATE jobs SET status=?,error=?,finished_at=CURRENT_TIMESTAMP WHERE id=?`).run(status, error, job.id);
    this._emit(job.id);
  }

  _updateCounts(jobId) {
    const c = this.db().prepare(`SELECT
      SUM(status='done') AS done, SUM(status='skipped') AS skipped,
      SUM(status='failed') AS failed, SUM(status='queued') AS queued,
      SUM(status='interrupted') AS interrupted
      FROM job_items WHERE job_id=?`).get(jobId);
    const counts = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v || 0)]));
    this.db().prepare(`UPDATE jobs SET done=?,skipped=?,failed=? WHERE id=?`).run(counts.done, counts.skipped, counts.failed, jobId);
    return counts;
  }

  stop(id) {
    const job = this.db().prepare(`SELECT id,lane,status FROM jobs WHERE id=?`).get(Number(id));
    if (!job) throw new Error('Task not found.');
    if (job.status === 'queued') {
      this.db().prepare(`UPDATE jobs SET status='cancelled',error='Stopped by owner.',finished_at=CURRENT_TIMESTAMP WHERE id=?`).run(job.id);
    } else if (job.status === 'running') this.stopRequested.add(job.id);
    this._emit(job.id);
    return this.getJob(job.id);
  }

  resume(id) {
    const job = this.db().prepare(`SELECT id,lane,status FROM jobs WHERE id=?`).get(Number(id));
    if (!job) throw new Error('Task not found.');
    if (!['paused','cancelled','interrupted'].includes(job.status)) throw new Error('This task cannot be resumed.');
    const pending = this.db().prepare(`SELECT COUNT(*) AS n FROM job_items WHERE job_id=? AND status='queued'`).get(job.id).n;
    if (!pending) throw new Error('There are no pending items to resume. Review failed or interrupted items.');
    this.db().prepare(`UPDATE jobs SET status='queued',error='',finished_at=NULL WHERE id=?`).run(job.id);
    this._emit(job.id);
    this._pump(job.lane);
    return this.getJob(job.id);
  }

  retryFailed(id) {
    const job = this.db().prepare(`SELECT id,lane,status FROM jobs WHERE id=?`).get(Number(id));
    if (!job) throw new Error('Task not found.');
    const retry = this.db().prepare(`UPDATE job_items SET status='queued',error='',updated_at=CURRENT_TIMESTAMP WHERE job_id=? AND status='failed'`).run(job.id);
    if (!retry.changes) throw new Error('This task has no failed items to retry.');
    this.db().prepare(`UPDATE jobs SET status='queued',error='',finished_at=NULL WHERE id=?`).run(job.id);
    this._emit(job.id);
    this._pump(job.lane);
    return this.getJob(job.id);
  }

  resumeAfterWhatsAppReconnect() {
    const jobs = this.db().prepare(`SELECT id FROM jobs WHERE lane='whatsapp' AND status='paused' AND error LIKE 'WhatsApp disconnected%' ORDER BY id`).all();
    jobs.forEach(({ id }) => {
      try { this.resume(id); } catch { /* the task may have been stopped or completed meanwhile */ }
    });
    return jobs.length;
  }

  retryFailedCloudUploads({ force = false } = {}) {
    if (!force && Date.now() - this.lastCloudRetryAt < 120000) return 0;
    this.lastCloudRetryAt = Date.now();
    const jobs = this.list(200).filter((job) => job.kind === 'drive.upload' && job.failed > 0);
    let retried = 0;
    for (const job of jobs) {
      try { this.retryFailed(job.id); retried += 1; } catch { /* no failed items remain */ }
    }
    return retried;
  }
}

let shared = null;
function getTaskService() {
  if (!shared) {
    const { getDatabase } = require('../database/dbInit');
    shared = new TaskService({
      getDb: getDatabase,
      executors: {
        'whatsapp.statement': (payload) => require('./statementShare').autoSend(payload),
        'product.import': (payload) => require('./inventoryService').importProduct(payload),
        'drive.upload': async (payload) => {
          try { return await require('./googleDriveService').getGoogleDriveService().uploadBackup(payload.filePath); }
          catch (err) {
            try { require('./settingsService').updateSettings({ drive_last_error: String(err.message || err).slice(0, 500) }); } catch {}
            throw err;
          }
        },
      },
    });
  }
  return shared;
}

module.exports = { TaskService, getTaskService };
