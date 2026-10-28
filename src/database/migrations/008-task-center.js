module.exports = {
  version: 8,
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        lane TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued'
          CHECK(status IN ('queued','running','paused','done','partial','failed','cancelled','interrupted')),
        total INTEGER NOT NULL DEFAULT 0,
        done INTEGER NOT NULL DEFAULT 0,
        skipped INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        error TEXT NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL DEFAULT (datetime('now','localtime')),
        started_at DATETIME,
        finished_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS job_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        item_key TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued'
          CHECK(status IN ('queued','running','done','skipped','failed','interrupted')),
        error TEXT NOT NULL DEFAULT '',
        result_json TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL DEFAULT (datetime('now','localtime')),
        FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        UNIQUE(job_id, item_key)
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_lane_status_created ON jobs(lane, status, created_at);
      CREATE INDEX IF NOT EXISTS idx_job_items_job_status ON job_items(job_id, status, id);
    `);
  },
};
