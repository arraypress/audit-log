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
  log(entry: AuditEntry): Promise<string>;
  query(filters?: AuditQueryFilters): Promise<AuditRecord[]>;
  queryByActor(actorId: string, options?: { limit?: number; offset?: number }): Promise<AuditRecord[]>;
  queryByResource(resourceType: string, resourceId: string, options?: { limit?: number; offset?: number }): Promise<AuditRecord[]>;
  deleteOlderThan(cutoffDate: string): Promise<number>;
}

/** Create an audit logger backed by a store. */
export function createAuditLog(store: AuditStore): AuditLogger;

/** Create an in-memory audit store for testing. */
export function createMemoryStore(): AuditStore;
