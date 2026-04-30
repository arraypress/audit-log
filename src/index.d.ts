export interface AuditEntry {
  action: string;
  actorId?: string | null;
  actorEmail?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  ip?: string | null;
  details?: Record<string, unknown> | null;
  status?: 'success' | 'failure' | 'error' | string;
}

export interface AuditRecord extends Required<AuditEntry> {
  id: string;
  createdAt: string;
}

export interface AuditQueryFilters {
  action?: string;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  status?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export interface AuditStore {
  insert(record: AuditRecord): Promise<void>;
  query(filters?: AuditQueryFilters): Promise<AuditRecord[]>;
  deleteOlderThan(cutoffDate: string): Promise<number>;
}

export interface AuditLogger {
  /** Await-able log. Throws on store failure — use when you genuinely need the row. */
  log(entry: AuditEntry): Promise<string>;
  /**
   * Fire-and-forget log. Never throws — store errors surface as
   * `console.warn` with the action name. Use this for the 95% case
   * where the audit row is "nice to have" rather than load-bearing.
   */
  logSafe(entry: AuditEntry): void;
  query(filters?: AuditQueryFilters): Promise<AuditRecord[]>;
  queryByActor(actorId: string, options?: { limit?: number; offset?: number }): Promise<AuditRecord[]>;
  queryByResource(resourceType: string, resourceId: string, options?: { limit?: number; offset?: number }): Promise<AuditRecord[]>;
  deleteOlderThan(cutoffDate: string): Promise<number>;
}

/** Create an audit logger backed by a store. */
export function createAuditLog(store: AuditStore): AuditLogger;

/** Create an in-memory audit store for testing. */
export function createMemoryStore(): AuditStore;

/**
 * Build a `.catch` handler that warns on failure instead of swallowing
 * it. Generic enough for any fire-and-forget promise; exported here
 * because audit logging is the canonical use case.
 *
 * The label appears bracketed in the warn output so log filters can
 * spot the source: `[audit-log] auth.login failed: <error>`.
 *
 * @example
 * audit.log({ action: 'auth.login', ... }).catch(catchVisible('auth.login'));
 * cache.set(key, value).catch(catchVisible(`cache.set ${key}`));
 */
export function catchVisible(label: string): (err: unknown) => void;
