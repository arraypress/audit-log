/**
 * @arraypress/audit-log v1.1 — extension tests for `catchVisible` and `logSafe`.
 *
 * The original test file (`audit-log.test.js`) covers `log`, `query`,
 * `deleteOlderThan`, etc. This file adds coverage for the v1.1
 * additions:
 *   - `catchVisible(label)` — generic console.warn handler factory
 *   - `logger.logSafe(entry)` — fire-and-forget log convenience
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createAuditLog, createMemoryStore, catchVisible } from '../src/index.js';

// ── Test helper: capture console.warn ──────────────────

let warnings = [];
const originalWarn = console.warn;

beforeEach(() => {
  warnings = [];
  console.warn = (...args) => warnings.push(args);
});

afterEach(() => {
  console.warn = originalWarn;
});

// ── catchVisible ───────────────────────────────────────

describe('catchVisible', () => {
  it('returns a function that warns on call', async () => {
    const handler = catchVisible('test.label');
    handler(new Error('boom'));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0][0], /\[audit-log\] test\.label failed:/);
  });

  it('passes the original error through to console.warn', async () => {
    const err = new Error('original');
    catchVisible('foo')(err);
    assert.equal(warnings[0][1], err);
  });

  it('works as a plain .catch handler', async () => {
    const failing = Promise.reject(new Error('rejected'));
    await failing.catch(catchVisible('failing.op'));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0][0], /failing\.op/);
  });

  it('is generic — works for non-audit promises too', async () => {
    const cacheOp = Promise.reject(new Error('cache miss'));
    await cacheOp.catch(catchVisible('cache.set user:1'));
    assert.match(warnings[0][0], /cache\.set user:1/);
  });
});

// ── logSafe ────────────────────────────────────────────

describe('logger.logSafe', () => {
  it('logs successfully without throwing', async () => {
    const store = createMemoryStore();
    const audit = createAuditLog(store);
    audit.logSafe({ action: 'auth.login', actorId: 'u1' });

    // Wait for the microtask queue to drain.
    await new Promise((r) => setTimeout(r, 5));

    const rows = await audit.query();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, 'auth.login');
    assert.equal(warnings.length, 0);
  });

  it('warns instead of throwing when the store fails', async () => {
    const failingStore = {
      async insert() { throw new Error('store down'); },
      async query() { return []; },
      async deleteOlderThan() { return 0; },
    };
    const audit = createAuditLog(failingStore);

    // Should NOT throw.
    audit.logSafe({ action: 'auth.bad', actorId: 'u1' });

    // Drain microtasks so the .catch fires.
    await new Promise((r) => setTimeout(r, 5));

    assert.equal(warnings.length, 1);
    assert.match(warnings[0][0], /\[audit-log\] auth\.bad failed:/);
  });

  it('returns void (not a promise)', () => {
    const audit = createAuditLog(createMemoryStore());
    const result = audit.logSafe({ action: 'noop', actorId: 'u1' });
    assert.equal(result, undefined);
  });
});
