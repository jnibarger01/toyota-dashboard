import type { Sql } from "../db.ts";

export type AuditEntry = {
  userId: string;
  tokenId: string;
  toolName: string;
  requestId: string;
  entityType: string;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
};

/**
 * Records one append-only audit row for a successful mutation.
 *
 * Called AFTER the mutation's own conditional/optimistic-locked update has
 * already committed — never before, so a rejected mutation (not-found,
 * version conflict, missing scope, etc.) can never produce a "success" audit
 * row. Not wrapped in the same DB transaction as the mutation: the shared
 * `Sql` connection (a `pg.Pool`) doesn't hand callers a single dedicated
 * connection to `BEGIN`/`COMMIT` across two calls, and the existing
 * repository methods (used unmodified here, shared with the dashboard) don't
 * expose transaction control to callers — see docs/mcp.md "Known
 * limitations". The failure mode this leaves is narrow and logged loudly:
 * the mutation succeeds but this insert itself fails (e.g. a transient
 * connection error) — never the reverse.
 */
export async function recordMcpAudit(sql: Sql, entry: AuditEntry): Promise<void> {
  try {
    await sql.query(
      `insert into mcp_audit_log (id, user_id, token_id, tool_name, request_id, entity_type, entity_id, previous_value, new_value)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
      [
        crypto.randomUUID(),
        entry.userId,
        entry.tokenId,
        entry.toolName,
        entry.requestId,
        entry.entityType,
        entry.entityId,
        JSON.stringify(entry.previousValue ?? null),
        JSON.stringify(entry.newValue ?? null),
      ],
    );
  } catch (err) {
    console.error(`[mcp] failed to write audit log entry for ${entry.toolName}`, err);
  }
}
