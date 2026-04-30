import type { Kysely } from 'kysely';
import type { AuditStore } from './index.js';

/**
 * Options for {@link createKyselyAuditStore}. Only the table name is
 * configurable — column names are fixed because the AuditEntry shape
 * is part of the lib's public API.
 *
 * Identifier names must match `[a-zA-Z_][a-zA-Z0-9_]*` — the value is
 * validated and the library refuses anything that could be SQL injection.
 */
export interface KyselyAuditStoreOptions {
  /** Table name. Default: `'audit_log'`. */
  table?: string;
}

/**
 * Build a Kysely-backed `AuditStore`.
 *
 * **Schema requirement:**
 *
 * ```sql
 * CREATE TABLE audit_log (
 *   id INTEGER PRIMARY KEY AUTOINCREMENT,
 *   action TEXT NOT NULL,
 *   actor_id INTEGER,
 *   actor_email TEXT,
 *   resource_type TEXT,
 *   resource_id TEXT,
 *   ip TEXT,
 *   details TEXT,
 *   status TEXT NOT NULL DEFAULT 'success',
 *   created_at TEXT NOT NULL DEFAULT (datetime('now'))
 * );
 * ```
 *
 * `details` is JSON-serialised on insert and parsed on query so callers
 * see a plain object. Malformed rows fall back to `null` rather than
 * throwing — the audit trail should be resilient to bad data.
 *
 * @example
 * ```ts
 * import { createAuditLog } from '@arraypress/audit-log';
 * import { createKyselyAuditStore } from '@arraypress/audit-log/kysely';
 *
 * const audit = createAuditLog(createKyselyAuditStore(db));
 * await audit.log({ action: 'auth.login', actorId: '42', ip: '1.2.3.4' });
 * const rows = await audit.query({ action: 'auth.login', limit: 100 });
 * ```
 *
 * @param db Kysely instance.
 * @param options Optional table-name override.
 * @returns An `AuditStore` ready to pass to `createAuditLog`.
 * @throws {Error} when the table name fails the safe-character regex.
 */
export function createKyselyAuditStore<Db = unknown>(
  db: Kysely<Db>,
  options?: KyselyAuditStoreOptions,
): AuditStore;
