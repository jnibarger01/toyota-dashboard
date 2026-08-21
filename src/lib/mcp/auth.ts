/**
 * Authentication + authorization for the MCP surface (server-only).
 *
 * There is no Better Auth API-key plugin available in the installed version
 * (checked `better-auth`'s package exports — only session/bearer/OIDC-style
 * plugins ship), and standing up a full OAuth provider is disproportionate
 * for a single first-party read scope. So this is the narrowest mechanism
 * that fits: a dedicated `mcp_api_tokens` table (migration 0010) holding only
 * a SHA-256 hash of an opaque bearer token plus the advisor `user_id` it
 * represents and a space-delimited scope string. It never touches Better
 * Auth's own tables ("user" is referenced only by foreign key, never
 * selected from). Tokens are minted out-of-band by `scripts/mint-mcp-token.mjs`.
 *
 * Every MCP tool call is scoped by the `userId` resolved here — the same
 * ownership boundary `authMiddleware` enforces for the dashboard itself.
 * Fails closed: any missing/malformed/unknown/revoked/rate-limited token
 * throws before any tool or database query runs. Per-tool SCOPE checks
 * (`toyota:read`, `toyota:ro:write`, ...) happen separately, per call, in
 * each tool via `checkScope` — see `scopes.ts`.
 */
import { createHash } from "node:crypto";
import type { Sql } from "../db.ts";

/** Thrown for any authentication/authorization/rate-limit failure. Carries the HTTP status to respond with. */
export class McpHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "McpHttpError";
    this.status = status;
  }
}

export type McpAuthContext = { userId: string; scopes: string[]; tokenId: string };

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

type TokenRow = { id: string; user_id: string; scope: string; revoked_at: string | null };

/**
 * Verifies the request's `Authorization: Bearer` token. Fails closed.
 * `sql` is injectable (defaults to the shared connection) so tests can run
 * this against an isolated PGLite instance, matching the rest of the
 * repository layer's testing style.
 */
export async function authenticateMcpRequest(request: Request, sql?: Sql): Promise<McpAuthContext> {
  const token = extractBearerToken(request);
  if (!token) throw new McpHttpError("Missing bearer token", 401);
  // Bound the length before it ever reaches a query — minted tokens are 43
  // base64url chars; this just rejects obviously-wrong input cheaply.
  if (token.length < 20 || token.length > 200) throw new McpHttpError("Malformed bearer token", 401);

  // Dynamic (not a static top-level import) so this module — and its tests,
  // which always inject `sql` — never has to resolve `../db.ts` (and its own
  // relative-without-extension imports) unless the fallback path is actually
  // used, matching the repository layer's own `static async connect()` style.
  const db = sql ?? (await (await import("../db.ts")).getSql());
  const rows = await db.query<TokenRow>(
    'select id, user_id, scope, revoked_at from mcp_api_tokens where token_hash = $1',
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row || row.revoked_at) throw new McpHttpError("Invalid or revoked token", 401);

  // NOT checked here: which specific scopes the token holds. Different tools
  // require different scopes (see `../scopes.ts`), so that check happens per
  // tool call, at call time — see `checkScope` in `tool-helpers.ts`, invoked
  // from every registered tool before it does anything else. A token with an
  // empty/unrecognized scope string still authenticates successfully; every
  // tool call it attempts will then cleanly fail that per-tool check.
  const scopes = row.scope.split(/\s+/).filter(Boolean);

  checkRateLimit(row.id);

  // Best-effort usage timestamp — never blocks or fails the request.
  void db
    .query('update mcp_api_tokens set last_used_at = now() where id = $1', [row.id])
    .catch((err: unknown) => console.error("[mcp] failed to record token use", err));

  return { userId: row.user_id, scopes, tokenId: row.id };
}

// --- rate limiting ---------------------------------------------------------
// Best-effort, per-process fixed-window limiter keyed by token id. Vercel
// Fluid Compute reuses warm instances, but concurrent requests can still land
// on different instances, so this is a speed bump against a single runaway
// client, not a real distributed rate limit — see docs/mcp.md "Known
// limitations". A production deployment expecting adversarial traffic should
// pair this with a platform-level control (e.g. Vercel Firewall).
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_WINDOW = 60;

const globalRef = globalThis as typeof globalThis & {
  __mcpRateLimitBuckets__?: Map<string, { windowStart: number; count: number }>;
};
globalRef.__mcpRateLimitBuckets__ ??= new Map();

function checkRateLimit(tokenId: string): void {
  const buckets = globalRef.__mcpRateLimitBuckets__!;
  const now = Date.now();
  const bucket = buckets.get(tokenId);
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    buckets.set(tokenId, { windowStart: now, count: 1 });
    return;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX_PER_WINDOW) {
    throw new McpHttpError("Rate limit exceeded — slow down and retry shortly", 429);
  }
}
