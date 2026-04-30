/**
 * @arraypress/audit-log/kysely
 *
 * Kysely-backed `AuditStore` implementation. Drop-in replacement for
 * `createMemoryStore()` when you want persistent audit trail storage
 * on D1 / SQLite / libSQL / Postgres.
 *
 * **Schema requirement** — your DB needs a table with this shape:
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
 * `details` is stored as a JSON string — `insert` serialises on write,
 * `query` parses on read so callers see a plain object.
 *
 * @module @arraypress/audit-log/kysely
 */

const DEFAULT_TABLE = 'audit_log';

/** Validate identifier names — same restriction as @arraypress/db-migrate. */
function quoteIdentifier(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid table name: "${name}". Use [a-zA-Z_][a-zA-Z0-9_]*.`);
  }
  return name;
}

/**
 * Build a Kysely-backed AuditStore.
 *
 * The returned object satisfies the `AuditStore` shape from the main
 * `@arraypress/audit-log` export — pass it straight to
 * `createAuditLog(store)`.
 *
 * @param {import('kysely').Kysely<any>} db Kysely instance.
 * @param {import('./kysely.d.ts').KyselyAuditStoreOptions} [options={}]
 * @returns {import('./index.d.ts').AuditStore}
 *
 * @example
 * ```ts
 * import { createAuditLog } from '@arraypress/audit-log';
 * import { createKyselyAuditStore } from '@arraypress/audit-log/kysely';
 *
 * const audit = createAuditLog(createKyselyAuditStore(db));
 * await audit.log({ action: 'auth.login', actorId: '42', ip: '1.2.3.4' });
 * ```
 */
export function createKyselyAuditStore(db, options = {}) {
  const table = quoteIdentifier(options.table ?? DEFAULT_TABLE);

  return {
    /** Write a new audit entry. The lib has already minted an `id` and `createdAt`. */
    async insert(record) {
      const actorIdRaw = record.actorId;
      const actorId = actorIdRaw == null || actorIdRaw === '' ? null : Number(actorIdRaw);
      await db
        .insertInto(table)
        .values({
          action: record.action,
          actor_id: Number.isFinite(actorId) ? actorId : null,
          actor_email: record.actorEmail || '',
          resource_type: record.resourceType || '',
          resource_id: record.resourceId || '',
          ip: record.ip || '',
          details: JSON.stringify(record.details ?? {}),
          status: record.status || 'success',
        })
        .execute();
    },

    /**
     * Filter and page through historical audit rows.
     *
     * `details` is JSON-parsed on the way out so callers see a plain
     * object. Malformed/legacy rows fall back to `null` rather than
     * throwing — the audit trail should be resilient to bad data.
     */
    async query(filters = {}) {
      let query = db.selectFrom(table).selectAll();

      if (filters.action) query = query.where('action', '=', filters.action);
      if (filters.actorId != null && filters.actorId !== '') {
        const id = Number(filters.actorId);
        if (Number.isFinite(id)) query = query.where('actor_id', '=', id);
      }
      if (filters.resourceType) query = query.where('resource_type', '=', filters.resourceType);
      if (filters.resourceId) query = query.where('resource_id', '=', filters.resourceId);
      if (filters.status) query = query.where('status', '=', filters.status);
      if (filters.since) query = query.where('created_at', '>=', filters.since);
      if (filters.until) query = query.where('created_at', '<=', filters.until);

      const rows = await query
        // `id DESC` is a stable tiebreaker — when several rows land in
        // the same second (SQLite's `datetime('now')` has 1-second
        // resolution), `created_at DESC` alone is non-deterministic.
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .limit(filters.limit ?? 50)
        .offset(filters.offset ?? 0)
        .execute();

      return rows.map((r) => {
        let details = null;
        if (r.details) {
          try { details = JSON.parse(r.details); } catch { details = null; }
        }
        return {
          id: String(r.id),
          action: r.action,
          actorId: r.actor_id != null ? String(r.actor_id) : null,
          actorEmail: r.actor_email || null,
          resourceType: r.resource_type || null,
          resourceId: r.resource_id || null,
          ip: r.ip || null,
          details,
          status: r.status || 'success',
          createdAt: r.created_at,
        };
      });
    },

    /**
     * Retention cleanup. Deletes rows whose `created_at` is older
     * than `cutoffDate`. Returns the number of rows deleted.
     */
    async deleteOlderThan(cutoffDate) {
      const result = await db
        .deleteFrom(table)
        .where('created_at', '<', cutoffDate)
        .executeTakeFirst();
      return Number(result?.numDeletedRows ?? result?.numAffectedRows ?? 0);
    },
  };
}
