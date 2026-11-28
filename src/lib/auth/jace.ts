/**
 * Central-issuer sign-in (jace-auth) — server-only configuration & helpers.
 *
 * Stage C of the identity consolidation (jace-auth `docs/MIGRATION.md`): the
 * dashboard stops being its own identity authority and federates sign-in to
 * the central OAuth 2.1 / OIDC issuer (jace-auth, the shared Better Auth
 * deployment). This module mirrors `google.ts`: it only READS env and never
 * exports secrets to client code.
 *
 * Dual-run (rollback): jace-auth sign-in is added ALONGSIDE the direct Google
 * social provider, never replacing it. Both toggles are env-driven:
 *   - Server: `JACE_AUTH_ENABLED=false` removes the genericOAuth provider,
 *     disables RP-initiated central logout, and reverts MCP OAuth verification
 *     to the local issuer only (the default Google/local paths keep working).
 *   - Client: `VITE_JACE_AUTH_ENABLED=false` hides the sign-in button.
 * Both default to ON whenever `JACE_AUTH_ISSUER` + client credentials are
 * present, so setting the env is the opt-in.
 *
 * Required env:
 *   - `JACE_AUTH_ISSUER`        e.g. https://jace-auth.vercel.app (frozen — see jace-auth docs/ISSUER.md)
 *   - `JACE_AUTH_CLIENT_ID`     the `toyota-dashboard` client id on jace-auth
 *   - `JACE_AUTH_CLIENT_SECRET` the matching client secret (secret manager only)
 * Optional env:
 *   - `JACE_AUTH_RESOURCE`      audience/resource indicator for dashboard sign-in;
 *                               defaults to `<issuer>/resources/toyota-dashboard`,
 *                               which must equal `JACE_RESOURCE_TOYOTA_DASHBOARD` on jace-auth.
 *   - `JACE_AUTH_MCP_RESOURCE`  audience/resource indicator for jace-auth-issued MCP
 *                               bearer tokens; defaults to `<issuer>/resources/toyota-mcp`,
 *                               which must equal `JACE_RESOURCE_TOYOTA_MCP` on jace-auth.
 *
 * jace-auth client registration requirements (exact match, no wildcards):
 *   - `JACE_CLIENT_TOYOTA_DASHBOARD_REDIRECT_URIS`:
 *       `https://<toyota-host>/api/auth/callback/jace`
 *       (local dev: `http://localhost:8080/api/auth/callback/jace,http://127.0.0.1:8080/api/auth/callback/jace`)
 *   - `JACE_CLIENT_TOYOTA_DASHBOARD_POST_LOGOUT_REDIRECT_URIS`:
 *       `https://<toyota-host>/`
 *       (local dev: `http://localhost:8080/,http://127.0.0.1:8080/`)
 *
 * Account continuity: first central login links the incoming jace-auth identity
 * to the existing local user by verified email (Better Auth `accountLinking`
 * with `trustedProviders` in `server.ts`), so `sub` → local `user.id` mapping
 * happens without a link table while the local user table remains the app's
 * ownership anchor.
 */
export const JACE_PROVIDER_ID = "jace";

/**
 * Better Auth 1.7 routes `genericOAuth` providers through `/api/auth/callback/<providerId>`.
 * This exact path must be registered in `JACE_CLIENT_TOYOTA_DASHBOARD_REDIRECT_URIS`.
 */
export const JACE_CALLBACK_PATH = "/api/auth/callback/jace";

export type JaceAuthConfig = {
  providerId: typeof JACE_PROVIDER_ID;
  callbackPath: typeof JACE_CALLBACK_PATH;
  issuer: string;
  jwksUrl: string;
  endSessionEndpoint: string;
  clientId: string;
  clientSecret: string;
  /** Audience / resource indicator jace-auth mints into dashboard access tokens. */
  resource: string;
  /** Audience / resource indicator jace-auth mints into MCP access tokens. */
  mcpResource: string;
};

/**
 * Enable central-issuer sign-in only when the full credential set is present
 * and the rollback flag has not explicitly disabled it. Credentials are never
 * exported to client code.
 */
export function getJaceAuthConfig(
  env: Record<string, string | undefined> = process.env,
): JaceAuthConfig | null {
  if (env.JACE_AUTH_ENABLED?.trim() === "false") return null;
  const issuer = env.JACE_AUTH_ISSUER?.trim().replace(/\/$/, "");
  const clientId = env.JACE_AUTH_CLIENT_ID?.trim();
  const clientSecret = env.JACE_AUTH_CLIENT_SECRET?.trim();
  if (!issuer || !clientId || !clientSecret) return null;
  if (!/^https?:\/\//.test(issuer)) return null;
  return {
    providerId: JACE_PROVIDER_ID,
    callbackPath: JACE_CALLBACK_PATH,
    issuer,
    jwksUrl: `${issuer}/jwks`,
    endSessionEndpoint: `${issuer}/oauth2/end-session`,
    clientId,
    clientSecret,
    resource: env.JACE_AUTH_RESOURCE?.trim() || `${issuer}/resources/toyota-dashboard`,
    mcpResource: env.JACE_AUTH_MCP_RESOURCE?.trim() || `${issuer}/resources/toyota-mcp`,
  };
}

/**
 * Normalize a client-supplied post-logout path to a safe same-origin relative
 * path (prevents open redirects via `//evil.example` or absolute URLs).
 */
export function sanitizePostLogoutPath(redirectTo: unknown): string {
  if (typeof redirectTo !== "string") return "/";
  const trimmed = redirectTo.trim();
  if (!trimmed.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(trimmed)) return "/";
  try {
    const origin = "https://local.invalid";
    const url = new URL(trimmed, origin);
    if (url.origin !== origin) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

/**
 * Build the OIDC RP-Initiated Logout 1.0 URL for jace-auth (`/oauth2/end-session`).
 */
export function buildJaceEndSessionUrl(opts: {
  issuer: string;
  clientId: string;
  postLogoutRedirectUri: string;
  idTokenHint?: string | null;
}): string {
  const url = new URL(`${opts.issuer.replace(/\/$/, "")}/oauth2/end-session`);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("post_logout_redirect_uri", opts.postLogoutRedirectUri);
  if (opts.idTokenHint?.trim()) {
    url.searchParams.set("id_token_hint", opts.idTokenHint.trim());
  }
  return url.href;
}

/**
 * Authorization servers advertised by RFC 9728 protected-resource metadata.
 * When jace-auth is enabled, advertise jace-auth alongside the local issuer so
 * both central-issuer and legacy local-issuer MCP clients remain supported.
 */
export function getMcpAuthorizationServers(
  localIssuer: string,
  jaceConfig: Pick<JaceAuthConfig, "issuer" | "mcpResource"> | null,
  resource: string,
): string[] {
  if (!jaceConfig || jaceConfig.mcpResource !== resource) return [localIssuer];
  if (jaceConfig.issuer === localIssuer) return [localIssuer];
  return [jaceConfig.issuer, localIssuer];
}

/**
 * Extract the unverified `iss` claim from a Bearer JWT solely to select which
 * cryptographic verifier (jace-auth vs local issuer) to invoke. Callers MUST
 * still verify signature, issuer, audience, and expiry via JWKS.
 */
export function peekUnverifiedJwtIssuer(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorizationHeader.trim());
  if (!match) return null;
  const parts = match[1].split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json) as { iss?: unknown };
    return typeof payload.iss === "string" && payload.iss.trim() ? payload.iss.trim() : null;
  } catch {
    return null;
  }
}

/**
 * True when jace-auth is enabled and the incoming Bearer JWT claims the
 * configured jace-auth issuer (selecting the jace-auth JWKS/issuer/audience
 * verifier instead of the local Better Auth verifier).
 */
export function shouldUseJaceMcpVerifier(
  authorizationHeader: string | null,
  jaceConfig: Pick<JaceAuthConfig, "issuer"> | null,
): boolean {
  if (!jaceConfig) return false;
  return peekUnverifiedJwtIssuer(authorizationHeader) === jaceConfig.issuer;
}
