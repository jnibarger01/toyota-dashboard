/**
 * Granular MCP authorization scopes (server-only, no imports — safe to use
 * from tools, auth, and `scripts/mint-mcp-token.mjs` alike).
 *
 * Deliberately NOT a single broad `toyota:write` — each write category has
 * its own scope so a token can be issued for exactly what a client needs
 * (e.g. a "log communications" integration never gets RO-status authority).
 * `mcp_api_tokens.scope` stores these as a space-delimited string (unchanged
 * shape from v0.1 — no migration needed to support this).
 */
export const SCOPES = {
  READ: "toyota:read",
  RO_WRITE: "toyota:ro:write",
  COMMUNICATION_WRITE: "toyota:communication:write",
  FOLLOWUP_WRITE: "toyota:followup:write",
  RECOMMENDATION_WRITE: "toyota:recommendation:write",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

export const ALL_SCOPES: Scope[] = Object.values(SCOPES);

export function isKnownScope(value: string): value is Scope {
  return (ALL_SCOPES as string[]).includes(value);
}
