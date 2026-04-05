# @arraypress/audit-log

Generic audit trail logging. Log actions by actors on resources, query with filtering, and manage retention. Storage-agnostic — works with D1, SQLite, Postgres. Zero dependencies.

## Installation

```bash
npm install @arraypress/audit-log
```

## Usage

```js
import { createAuditLog, createMemoryStore } from '@arraypress/audit-log';

const audit = createAuditLog(createMemoryStore()); // Or your D1 adapter

// Log an action
await audit.log({
  action: 'product.updated',
  actorId: 'user_1',
  actorEmail: 'admin@store.com',
  resourceType: 'product',
  resourceId: '42',
  ip: '1.2.3.4',
  details: { field: 'price', from: 1999, to: 2499 },
});

// Query logs
const recent = await audit.query({ action: 'product.updated', limit: 20 });
const byUser = await audit.queryByActor('user_1');
const forProduct = await audit.queryByResource('product', '42');

// Retention cleanup (keep 90 days)
const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
await audit.deleteOlderThan(cutoff);
```

## API

### `createAuditLog(store)`

Create an audit logger backed by a store. Returns: `{ log, query, queryByActor, queryByResource, deleteOlderThan }`.

### `audit.log(entry)`

Log an audit event. Fields: `action` (required), `actorId`, `actorEmail`, `resourceType`, `resourceId`, `ip`, `details` (object), `status` (default 'success'). Returns the generated entry ID.

### `audit.query(filters?)`

Query logs with optional filters: `action`, `actorId`, `resourceType`, `resourceId`, `status`, `since`, `until`, `limit` (default 50), `offset`.

### `audit.queryByActor(actorId, options?)`

Shorthand for querying by actor.

### `audit.queryByResource(resourceType, resourceId, options?)`

Shorthand for querying by resource.

### `audit.deleteOlderThan(cutoffDate)`

Delete entries before the cutoff. Returns count deleted.

### `createMemoryStore()`

In-memory store for testing.

### Store Interface

```ts
interface AuditStore {
  insert(record: AuditRecord): Promise<void>;
  query(filters?: AuditQueryFilters): Promise<AuditRecord[]>;
  deleteOlderThan(cutoffDate: string): Promise<number>;
}
```

## License

MIT
