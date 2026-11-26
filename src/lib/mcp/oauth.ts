import type { Sql } from "../db.ts";
import { McpHttpError, type McpAuthContext } from "./auth.ts";
import { getBetterAuthUserId } from "../auth/oauth-user.server.ts";


/**
 * Converts a verified OAuth access-token claim set into the same ownership
 * context used by static MCP bearer tokens. `requireMcpAuth` has already
 * verified signature, issuer, audience, and expiry before this function runs;
 * this function adds the application-level user existence boundary.
 *
 * When `opts.providerId` is set (e.g. `"jace"` for central jace-auth tokens),
 * `sub` is resolved through the linked `"account"` record for that provider.
 */
export async function authenticateOAuthClaims(
  claims: Record<string, unknown>,
  sql: Sql,
  expectedResource: string,
  opts?: { providerId?: string },
): Promise<McpAuthContext> {
  const subject = claims.sub;
  if (typeof subject !== "string" || !subject) {
    throw new McpHttpError("OAuth access token has no valid subject", 401);
  }

  const audience = claims.aud;
  const audiences = Array.isArray(audience) ? audience : [audience];
  if (!audiences.includes(expectedResource)) {
    throw new McpHttpError("OAuth access token has the wrong resource audience", 401);
  }

  const userId = await getBetterAuthUserId(sql, subject, opts?.providerId);
  if (!userId) throw new McpHttpError("OAuth subject is not a Toyota Dashboard user", 401);

  const scopeClaim = claims.scope;
  const scopes = typeof scopeClaim === "string" ? scopeClaim.split(/\s+/).filter(Boolean) : [];
  const tokenId = typeof claims.jti === "string" && claims.jti ? `oauth:${claims.jti}` : `oauth:${subject}:${String(claims.iat ?? "unknown")}`;
  return { userId, scopes, tokenId };
}
