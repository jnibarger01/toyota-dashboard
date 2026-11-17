/**
 * Central-issuer sign-in (jace-auth) — server-only configuration.
 *
 * Stage C of the identity consolidation (jace-auth `docs/MIGRATION.md`): the
 * dashboard stops being its own identity authority and federates sign-in to
 * the central OAuth 2.1 / OIDC issuer (jace-auth, the shared Better Auth
 * deployment). This module mirrors `google.ts`: it only READS env and never
 * exports secrets to client code.
 *
 * Dual-run (rollback): jace-auth sign-in is added ALONGSIDE the direct Google
 * social provider, never replacing it. Both toggles are env-driven:
 *   - Server: `JACE_AUTH_ENABLED=false` removes the genericOAuth provider
 *     (the default Google path keeps working unchanged).
 *   - Client: `VITE_JACE_AUTH_ENABLED=false` hides the sign-in button.
 * Both default to ON whenever `JACE_AUTH_ISSUER` + client credentials are
 * present, so setting the env is the opt-in.
 *
 * Required env:
 *   - `JACE_AUTH_ISSUER`        e.g. https://jace-auth.vercel.app (frozen — see jace-auth docs/ISSUER.md)
 *   - `JACE_AUTH_CLIENT_ID`     the `toyota-dashboard` client id on jace-auth
 *   - `JACE_AUTH_CLIENT_SECRET` the matching client secret (secret manager only)
 * Optional env:
 *   - `JACE_AUTH_RESOURCE`      audience/resource indicator; defaults to
 *                               `<issuer>/resources/toyota-dashboard`, which is
 *                               what jace-auth mints for this client by default.
 *                               If overridden, the SAME string must be set as
 *                               `JACE_RESOURCE_TOYOTA_DASHBOARD` on jace-auth
 *                               (audience equality — see CONSUMER_CUTOVER docs).
 *
 * Account continuity: first central login links the incoming jace-auth identity
 * to the existing local user by verified email (Better Auth `accountLinking`
 * with `trustedProviders` in `server.ts`), so `sub` → local `user.id` mapping
 * happens without a link table while the local user table remains the app's
 * ownership anchor.
 */
export const JACE_PROVIDER_ID = "jace";

export type JaceAuthConfig = {
  providerId: typeof JACE_PROVIDER_ID;
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Audience / resource indicator jace-auth mints into access tokens. */
  resource: string;
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
    issuer,
    clientId,
    clientSecret,
    resource: env.JACE_AUTH_RESOURCE?.trim() || `${issuer}/resources/toyota-dashboard`,
  };
}
