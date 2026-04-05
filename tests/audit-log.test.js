import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAuditLog, createMemoryStore } from '../src/index.js';

describe('audit log', () => {
  it('logs an entry and returns an ID', async () => {
    const audit = createAuditLog(createMemoryStore());
    const id = await audit.log({ action: 'product.created', actorId: 'u1' });
    assert.ok(id);
    assert.equal(typeof id, 'string');
  });

  it('queries all entries', async () => {
    const audit = createAuditLog(createMemoryStore());
    await audit.log({ action: 'a', actorId: 'u1' });
    await audit.log({ action: 'b', actorId: 'u2' });
    const results = await audit.query();
    assert.equal(results.length, 2);
  });

  it('filters by action', async () => {
    const audit = createAuditLog(createMemoryStore());
    await audit.log({ action: 'product.created', actorId: 'u1' });
    await audit.log({ action: 'order.completed', actorId: 'u1' });
    const results = await audit.query({ action: 'product.created' });
    assert.equal(results.length, 1);
    assert.equal(results[0].action, 'product.created');
  });

  it('filters by actorId', async () => {
    const audit = createAuditLog(createMemoryStore());
    await audit.log({ action: 'a', actorId: 'u1' });
    await audit.log({ action: 'b', actorId: 'u2' });
    const results = await audit.queryByActor('u1');
    assert.equal(results.length, 1);
  });

  it('filters by resource', async () => {
    const audit = createAuditLog(createMemoryStore());
    await audit.log({ action: 'updated', resourceType: 'product', resourceId: '42' });
    await audit.log({ action: 'updated', resourceType: 'order', resourceId: '99' });
    const results = await audit.queryByResource('product', '42');
    assert.equal(results.length, 1);
    assert.equal(results[0].resourceId, '42');
  });

  it('respects limit and offset', async () => {
    const audit = createAuditLog(createMemoryStore());
    for (let i = 0; i < 10; i++) await audit.log({ action: `a${i}` });
    const page1 = await audit.query({ limit: 3, offset: 0 });
    const page2 = await audit.query({ limit: 3, offset: 3 });
    assert.equal(page1.length, 3);
    assert.equal(page2.length, 3);
    assert.notEqual(page1[0].id, page2[0].id);
  });

  it('returns newest first', async () => {
    const audit = createAuditLog(createMemoryStore());
    await audit.log({ action: 'first' });
    await new Promise(r => setTimeout(r, 10));
    await audit.log({ action: 'second' });
    const results = await audit.query();
    assert.equal(results[0].action, 'second');
    assert.equal(results[1].action, 'first');
  });

  it('stores all fields', async () => {
    const audit = createAuditLog(createMemoryStore());
    await audit.log({
      action: 'product.updated',
      actorId: 'u1',
      actorEmail: 'admin@store.com',
      resourceType: 'product',
      resourceId: '42',
      ip: '1.2.3.4',
      details: { field: 'price', from: 1999, to: 2499 },
      status: 'success',
    });
    const [entry] = await audit.query();
    assert.equal(entry.action, 'product.updated');
    assert.equal(entry.actorId, 'u1');
    assert.equal(entry.actorEmail, 'admin@store.com');
    assert.equal(entry.resourceType, 'product');
    assert.equal(entry.resourceId, '42');
    assert.equal(entry.ip, '1.2.3.4');
    assert.equal(entry.details.field, 'price');
    assert.equal(entry.status, 'success');
    assert.ok(entry.createdAt);
  });

  it('defaults status to success', async () => {
    const audit = createAuditLog(createMemoryStore());
    await audit.log({ action: 'test' });
    const [entry] = await audit.query();
    assert.equal(entry.status, 'success');
  });

  it('deletes old entries', async () => {
    const audit = createAuditLog(createMemoryStore());
    await audit.log({ action: 'old' });
    await new Promise(r => setTimeout(r, 50));
    const cutoff = new Date().toISOString();
    await new Promise(r => setTimeout(r, 50));
    await audit.log({ action: 'new' });
    const deleted = await audit.deleteOlderThan(cutoff);
    assert.equal(deleted, 1);
    const remaining = await audit.query();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].action, 'new');
  });
});
