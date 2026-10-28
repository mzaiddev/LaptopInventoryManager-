const test = require('node:test');
const assert = require('node:assert');
const { freshDb, closeDatabase } = require('./helpers');
const { getDatabase } = require('../src/database/dbInit');
const { TaskService } = require('../src/services/taskService');

const waitFor = async (fn, ms = 2000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for task state.');
};

test('tasks in one lane run in order and retry only failed items', async () => {
  freshDb();
  let firstAttempts = 0;
  const ran = [];
  const queue = new TaskService({ getDb: getDatabase, executors: {
    demo: async (payload) => {
      ran.push(payload.key);
      if (payload.key === 'a' && firstAttempts++ === 0) throw new Error('temporary error');
      return { ok: true };
    },
  } });
  const job = queue.enqueue({ kind:'demo', lane:'data', title:'Demo', items:[
    { key:'a', label:'A', payload:{key:'a'} }, { key:'b', label:'B', payload:{key:'b'} },
  ] });
  await waitFor(() => queue.getJob(job.id)?.status === 'partial');
  assert.deepStrictEqual(ran, ['a','b']);
  assert.strictEqual(queue.getJob(job.id).failed, 1);
  queue.retryFailed(job.id);
  await waitFor(() => queue.getJob(job.id)?.status === 'done');
  assert.deepStrictEqual(ran, ['a','b','a']);
  assert.strictEqual(queue.getJob(job.id).done, 2);
  closeDatabase();
});

test('stop waits for current item and resume continues queued work', async () => {
  freshDb();
  let release;
  const ran = [];
  const queue = new TaskService({ getDb: getDatabase, executors: {
    demo: async (payload) => {
      ran.push(payload.key);
      if (payload.key === 'a') await new Promise((resolve) => { release = resolve; });
    },
  } });
  const job = queue.enqueue({ kind:'demo', lane:'data', title:'Demo', items:[
    { key:'a', payload:{key:'a'} }, { key:'b', payload:{key:'b'} },
  ] });
  await waitFor(() => typeof release === 'function');
  queue.stop(job.id);
  release();
  await waitFor(() => queue.getJob(job.id)?.status === 'cancelled');
  assert.deepStrictEqual(ran, ['a']);
  queue.resume(job.id);
  await waitFor(() => queue.getJob(job.id)?.status === 'done');
  assert.deepStrictEqual(ran, ['a','b']);
  closeDatabase();
});

test('a running item at startup is marked interrupted and is never auto resent', () => {
  freshDb();
  const db = getDatabase();
  db.prepare(`INSERT INTO jobs(id,kind,lane,title,status,total) VALUES(1,'demo','data','Demo','running',1)`).run();
  db.prepare(`INSERT INTO job_items(job_id,item_key,label,payload_json,status) VALUES(1,'a','A','{}','running')`).run();
  const queue = new TaskService({ getDb: getDatabase, executors:{ demo: async () => assert.fail('interrupted item must not be resent') } });
  queue.initialize();
  const job = queue.getJob(1);
  assert.strictEqual(job.status, 'interrupted');
  assert.strictEqual(job.items[0].status, 'interrupted');
  assert.match(job.items[0].error, /Check whether it completed/);
  closeDatabase();
});
