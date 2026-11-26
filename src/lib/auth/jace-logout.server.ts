import type { Sql } from "../db.ts";
import {
  JACE_PROVIDER_ID,
  buildJaceEndSessionUrl,
  sanitizePostLogoutPath,
  type JaceAuthConfig,
} from "./jace.ts";

export type AccountLogoutRow = {
  providerId: string;
  idToken: string | null;
  updatedAt: string | Date | null;
};

/**
 * Determine whether the current authenticated user should be redirected through
 * jace-auth's RP-Initiated Logout (`/oauth2/end-session`) on sign-out.
 *
 * Returns `null` when:
 * - jace-auth is disabled (`jaceConfig === null`),
 * - the user has no linked `jace` account (Google-only or local email/password user), or
 * - a different external OAuth provider (e.g. `google`) was updated more recently
 *   than `jace`, preserving direct Google sign-out behavior during dual-run.
 */
export async function resolveJaceEndSessionUrl(opts: {
  jaceConfig: Pick<JaceAuthConfig, "issuer" | "clientId" | "providerId"> | null;
  userId: string | null;
  origin: string;
  redirectTo?: unknown;
  sql: Sql;
}): Promise<string | null> {
  if (!opts.jaceConfig || !opts.userId) return null;

  const rows = await opts.sql.query<AccountLogoutRow>(
    'select "providerId", "idToken", "updatedAt" from "account" where "userId" = $1 order by "updatedAt" desc',
    [opts.userId],
  );
  if (rows.length === 0) return null;

  const jaceRow = rows.find((row) => row.providerId === (opts.jaceConfig?.providerId ?? JACE_PROVIDER_ID));
  if (!jaceRow) return null;

  // If the most recently updated external OAuth account is a different provider
  // (e.g. direct Google sign-in), preserve local/Google sign-out without
  // redirecting through jace-auth.
  const latestOAuthRow = rows.find((row) => row.providerId !== "credential");
  if (latestOAuthRow && latestOAuthRow.providerId !== jaceRow.providerId) {
    return null;
  }

  const safePath = sanitizePostLogoutPath(opts.redirectTo);
  const postLogoutRedirectUri = new URL(safePath, opts.origin).href;
  return buildJaceEndSessionUrl({
    issuer: opts.jaceConfig.issuer,
    clientId: opts.jaceConfig.clientId,
    postLogoutRedirectUri,
    idTokenHint: jaceRow.idToken,
  });
}
