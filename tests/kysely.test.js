/**
 * @arraypress/audit-log/kysely — test suite.
 *
 * Real SQLite (via better-sqlite3) so we exercise the actual SQL path:
 * insert + JSON serialisation, query filters, retention cleanup.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect, sql } from 'kysely';
import { createKyselyAuditStore } from '../src/kysely.js';
import { createAuditLog } from '../src/index.js';

async function setupDb(table = 'audit_log') {
  const db = new Kysely({
    dialect: new SqliteDialect({ database: new SQLite(':memory:') }),
  });
  await sql.raw(`
    CREATE TABLE ${table} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      actor_id INTEGER,
      actor_email TEXT,
      resource_type TEXT,
      resource_id TEXT,
      ip TEXT,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'success',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).execute(db);
  return db;
}

// ── Validation ─────────────────────────────────────

describe('createKyselyAuditStore validation', () => {
  it('rejects an unsafe table name', () => {
    const db = new Kysely({
      dialect: new SqliteDialect({ database: new SQLite(':memory:') }),
    });
    assert.throws(
      () => createKyselyAuditStore(db, { table: 'audit_log; DROP TABLE users' }),
      /Invalid/,
    );
  });
});

// ── Insert ─────────────────────────────────────────

describe('insert', () => {
  it('writes a record with all fields', async () => {
    const db = await setupDb();
    const store = createKyselyAuditStore(db);

    await store.insert({
      id: 'irrelevant',
      action: 'auth.login',
      actorId: '42',
      actorEmail: 'admin@example.com',
      resourceType: 'session',
      resourceId: 's_abc',
      ip: '1.2.3.4',
      details: { device: 'macOS', firstLogin: false },
      status: 'success',
      createdAt: 'irrelevant',
    });

    const rows = await db.selectFrom('audit_log').selectAll().execute();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, 'auth.login');
    assert.equal(rows[0].actor_id, 42);
    assert.equal(rows[0].actor_email, 'admin@example.com');
    assert.equal(rows[0].ip, '1.2.3.4');
    assert.equal(rows[0].status, 'success');
    assert.deepEqual(JSON.parse(rows[0].details), { device: 'macOS', firstLogin: false });
  });

  it('handles missing optional fields with safe defaults', async () => {
    const db = await setupDb();
    const store = createKyselyAuditStore(db);

    await store.insert({ id: 'x', action: 'minimal', createdAt: 'x' });

    const rows = await db.selectFrom('audit_log').selectAll().execute();
    assert.equal(rows[0].actor_id, null);
    assert.equal(rows[0].actor_email, '');
    assert.equal(rows[0].resource_type, '');
    assert.equal(rows[0].ip, '');
    assert.equal(rows[0].status, 'success');
    assert.equal(rows[0].details, '{}');
  });

  it('coerces non-numeric actorId to null', async () => {
    const db = await setupDb();
    const store = createKyselyAuditStore(db);

    await store.insert({
      id: 'x', action: 'test', actorId: 'not-a-number', createdAt: 'x',
    });

    const rows = await db.selectFrom('audit_log').selectAll().execute();
    assert.equal(rows[0].actor_id, null);
  });
});

// ── Query ──────────────────────────────────────────

describe('query', () => {
  it('returns rows in reverse-chronological order', async () => {
    const db = await setupDb();
    const store = createKyselyAuditStore(db);

    for (const action of ['a', 'b', 'c']) {
      await store.insert({ id: 'x', action, createdAt: 'x' });
    }

    const rows = await store.query();
    assert.equal(rows.length, 3);
    // Most recent insert is `c`, oldest is `a`
    assert.equal(rows[0].action, 'c');
    assert.equal(rows[2].action, 'a');
  });

  it('filters by action', async () => {
    const db = await setupDb();
    const store = createKyselyAuditStore(db);

    await store.insert({ id: 'x', action: 'auth.login', createdAt: 'x' });
    await store.insert({ id: 'x', action: 'auth.logout', createdAt: 'x' });
    await store.insert({ id: 'x', action: 'auth.login', createdAt: 'x' });

    const rows = await store.query({ action: 'auth.login' });
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.action === 'auth.login'));
  });

  it('filters by actorId', async () => {
    const db = await setupDb();
    const store = createKyselyAuditStore(db);

    await store.insert({ id: 'x', action: 'a', actorId: '1', createdAt: 'x' });
    await store.insert({ id: 'x', action: 'a', actorId: '2', createdAt: 'x' });

    const rows = await store.query({ actorId: '1' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actorId, '1');
  });

  it('parses details JSON on read', async () => {
    const db = await setupDb();
    const store = createKyselyAuditStore(db);

    await store.insert({
      id: 'x', action: 'test',
      details: { foo: 'bar', n: 42 },
      createdAt: 'x',
    });

    const [row] = await store.query();
    assert.deepEqual(row.details, { foo: 'bar', n: 42 });
  });

  it('returns null details for malformed JSON rows', async () => {
    const db = await setupDb();
    const store = createKyselyAuditStore(db);

    await db.insertInto('audit_log').values({
      action: 'legacy', details: 'this is not json',
    }).execute();

    const [row] = await store.query();
    assert.equal(row.details, null);
  });

  it('respects limit + offset', async () => {
    const db = await setupDb();
    const store = createKyselyAuditStore(db);
    for (let i = 0; i < 10; i++) {
      await store.insert({ id: 'x', action: `a${i}`, createdAt: 'x' });
    }

    const page1 = await store.query({ limit: 3, offset: 0 });
    const page2 = await store.query({ limit: 3, offset: 3 });
    assert.equal(page1.length, 3);
    assert.equal(page2.length, 3);
    assert.notEqual(page1[0].action, page2[0].action);
  });
});

// ── Retention cleanup ──────────────────────────────

describe('deleteOlderThan', () => {
  it('deletes rows older than the cutoff', async () => {
    const db = await setupDb();
    const store = createKyselyAuditStore(db);

    // Insert with explicit older timestamp
    await db.insertInto('audit_log').values({
      action: 'old', created_at: '2020-01-01 00:00:00',
    }).execute();
    await db.insertInto('audit_log').values({
      action: 'new', created_at: '2099-01-01 00:00:00',
    }).execute();

    const deleted = await store.deleteOlderThan('2025-01-01 00:00:00');
    assert.equal(deleted, 1);

    const rows = await db.selectFrom('audit_log').selectAll().execute();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, 'new');
  });
});

// ── End-to-end via the lib's createAuditLog ───────

describe('integration with createAuditLog', () => {
  it('round-trips an entry through log() and query()', async () => {
    const db = await setupDb();
    const audit = createAuditLog(createKyselyAuditStore(db));

    const id = await audit.log({
      action: 'order.refund',
      actorId: '7',
      resourceType: 'order',
      resourceId: 'ord_xyz',
      details: { amount: 4200, currency: 'usd' },
    });
    assert.ok(id);

    const rows = await audit.query();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, 'order.refund');
    assert.equal(rows[0].actorId, '7');
    assert.deepEqual(rows[0].details, { amount: 4200, currency: 'usd' });
  });

  it('queryByResource finds entries scoped to one object', async () => {
    const db = await setupDb();
    const audit = createAuditLog(createKyselyAuditStore(db));

    await audit.log({ action: 'order.created', resourceType: 'order', resourceId: 'A' });
    await audit.log({ action: 'order.created', resourceType: 'order', resourceId: 'B' });
    await audit.log({ action: 'order.refund', resourceType: 'order', resourceId: 'A' });

    const rowsForA = await audit.queryByResource('order', 'A');
    assert.equal(rowsForA.length, 2);
    assert.ok(rowsForA.every((r) => r.resourceId === 'A'));
  });
});
