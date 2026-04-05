/**
 * @arraypress/audit-log
 *
 * Generic audit trail logging. Log actions by actors on resources,
 * query logs with filtering, and clean up old entries.
 *
 * Storage-agnostic — bring your own store (D1, SQLite, Postgres).
 * Zero dependencies.
 *
 * @module @arraypress/audit-log
 */

/**
 * Create an audit logger backed by a store.
 *
 * @param {AuditStore} store - Storage adapter.
 * @returns {{ log, query, queryByActor, queryByResource, deleteOlderThan }}
 *
 * @example
 * const audit = createAuditLog(myStore);
 * await audit.log({
 *   action: 'product.updated',
 *   actorId: 'user_1',
 *   actorEmail: 'admin@store.com',
 *   resourceType: 'product',
 *   resourceId: '42',
 *   ip: '1.2.3.4',
 *   details: { field: 'price', from: 1999, to: 2499 },
 * });
 */
export function createAuditLog(store) {
  return {
    /**
     * Log an audit event.
     *
     * @param {AuditEntry} entry - The event to log.
     * @returns {Promise<string>} The generated entry ID.
     *
     * @example
     * await audit.log({
     *   action: 'order.refunded',
     *   actorId: 'user_1',
     *   resourceType: 'order',
     *   resourceId: 'pi_abc123',
     *   details: { amount: 1999, reason: 'customer request' },
     * });
     */
    async log(entry) {
      const record = {
        id: generateId(),
        action: entry.action,
        actorId: entry.actorId || null,
        actorEmail: entry.actorEmail || null,
        resourceType: entry.resourceType || null,
        resourceId: entry.resourceId || null,
        ip: entry.ip || null,
        details: entry.details || null,
        status: entry.status || 'success',
        createdAt: new Date().toISOString(),
      };
      await store.insert(record);
      return record.id;
    },

    /**
     * Query audit logs with filtering and pagination.
     *
     * @param {Object} [filters]
     * @param {string} [filters.action] - Filter by action name.
     * @param {string} [filters.actorId] - Filter by actor ID.
     * @param {string} [filters.resourceType] - Filter by resource type.
     * @param {string} [filters.resourceId] - Filter by resource ID.
     * @param {string} [filters.status] - Filter by status.
     * @param {string} [filters.since] - Only entries after this ISO datetime.
     * @param {string} [filters.until] - Only entries before this ISO datetime.
     * @param {number} [filters.limit=50] - Max entries to return.
     * @param {number} [filters.offset=0] - Pagination offset.
     * @returns {Promise<AuditRecord[]>}
     *
     * @example
     * const logs = await audit.query({ action: 'product.updated', limit: 20 });
     */
    async query(filters = {}) {
      return store.query(filters);
    },

    /**
     * Get all actions by a specific actor.
     *
     * @param {string} actorId
     * @param {Object} [options]
     * @param {number} [options.limit=50]
     * @param {number} [options.offset=0]
     * @returns {Promise<AuditRecord[]>}
     */
    async queryByActor(actorId, options = {}) {
      return store.query({ actorId, ...options });
    },

    /**
     * Get all actions on a specific resource.
     *
     * @param {string} resourceType
     * @param {string} resourceId
     * @param {Object} [options]
     * @param {number} [options.limit=50]
     * @param {number} [options.offset=0]
     * @returns {Promise<AuditRecord[]>}
     */
    async queryByResource(resourceType, resourceId, options = {}) {
      return store.query({ resourceType, resourceId, ...options });
    },

    /**
     * Delete audit entries older than a cutoff date.
     * Use for retention policies (e.g. keep 90 days).
     *
     * @param {string} cutoffDate - ISO datetime. Entries before this are deleted.
     * @returns {Promise<number>} Number of entries deleted.
     *
     * @example
     * const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
     * await audit.deleteOlderThan(cutoff); // Delete entries older than 90 days
     */
    async deleteOlderThan(cutoffDate) {
      return store.deleteOlderThan(cutoffDate);
    },
  };
}

/**
 * Create an in-memory audit store for testing.
 *
 * @returns {AuditStore}
 *
 * @example
 * const store = createMemoryStore();
 * const audit = createAuditLog(store);
 */
export function createMemoryStore() {
  const entries = [];

  return {
    async insert(record) {
      entries.push({ ...record });
    },
    async query(filters = {}) {
      let result = [...entries];

      if (filters.action) result = result.filter(e => e.action === filters.action);
      if (filters.actorId) result = result.filter(e => e.actorId === filters.actorId);
      if (filters.resourceType) result = result.filter(e => e.resourceType === filters.resourceType);
      if (filters.resourceId) result = result.filter(e => e.resourceId === filters.resourceId);
      if (filters.status) result = result.filter(e => e.status === filters.status);
      if (filters.since) result = result.filter(e => e.createdAt >= filters.since);
      if (filters.until) result = result.filter(e => e.createdAt <= filters.until);

      // Sort newest first
      result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const offset = filters.offset || 0;
      const limit = filters.limit || 50;
      return result.slice(offset, offset + limit);
    },
    async deleteOlderThan(cutoff) {
      const before = entries.length;
      const keep = entries.filter(e => e.createdAt >= cutoff);
      entries.length = 0;
      entries.push(...keep);
      return before - entries.length;
    },
  };
}

// ── Internal ─────────────────────────────

/** Generate a simple unique ID (timestamp + random). */
function generateId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}_${rand}`;
}
