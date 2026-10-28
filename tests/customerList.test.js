const test = require('node:test');
const assert = require('node:assert');
const { freshDb, closeDatabase } = require('./helpers');
const { getDatabase } = require('../src/database/dbInit');
const ledger = require('../src/services/ledgerService');

test('customer list returns ledger due, customer credit, and a working due filter', () => {
  freshDb();
  const db = getDatabase();
  const dueId = Number(db.prepare("INSERT INTO customers(customer_name) VALUES('A Due')").run().lastInsertRowid);
  const creditId = Number(db.prepare("INSERT INTO customers(customer_name) VALUES('B Credit')").run().lastInsertRowid);
  db.prepare(`INSERT INTO customer_ledger(customer_id,reference_type,debit,credit,running_balance,entry_date) VALUES(?, 'Sale', 125,0,125,'2026-01-01')`).run(dueId);
  db.prepare(`INSERT INTO customer_ledger(customer_id,reference_type,debit,credit,running_balance,entry_date) VALUES(?, 'Return', 0,25,-25,'2026-01-02')`).run(creditId);
  const all = ledger.getAllCustomers({ limit:20 });
  const due = all.customers.find((c) => c.id === dueId);
  const credit = all.customers.find((c) => c.id === creditId);
  assert.strictEqual(due.total_due, 125);
  assert.strictEqual(credit.total_due, 0);
  assert.strictEqual(credit.ledger_balance, -25);
  const owing = ledger.getAllCustomers({ hasDue:true, limit:20 });
  assert.deepStrictEqual(owing.customers.map((c) => c.id), [dueId]);
  assert.strictEqual(owing.total, 1);
  closeDatabase();
});
