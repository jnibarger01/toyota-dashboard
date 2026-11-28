# Central-issuer sign-in (jace-auth)

The dashboard can federate sign-in to the central **jace-auth** issuer
(OAuth 2.1 / OIDC) instead of being its own identity authority. This is
Stage C of the identity consolidation — see jace-auth `docs/MIGRATION.md`
and `docs/CONSUMER_CUTOVER.md`.

## Enable

Set on the dashboard deployment (secrets via secret manager only):

```sh
JACE_AUTH_ISSUER=https://jace-auth.vercel.app   # frozen issuer (jace-auth docs/ISSUER.md)
JACE_AUTH_CLIENT_ID=toyota-dashboard
JACE_AUTH_CLIENT_SECRET=<from jace-auth seed secret>
VITE_JACE_AUTH_ENABLED=true                     # shows the sign-in button
# Optional audience overrides (defaults shown):
# JACE_AUTH_RESOURCE=https://jace-auth.vercel.app/resources/toyota-dashboard
# JACE_AUTH_MCP_RESOURCE=https://jace-auth.vercel.app/resources/toyota-mcp
```

### jace-auth Client Registration Requirements

On the `jace-auth` side, the `toyota-dashboard` managed client must allow these
exact URIs (no wildcards; better-auth 1.7 routes `genericOAuth` providers
through `/api/auth/callback/<providerId>`):

- **`JACE_CLIENT_TOYOTA_DASHBOARD_REDIRECT_URIS`**:
  - Production: `https://<this-app-host>/api/auth/callback/jace`
  - Local dev: `http://localhost:8080/api/auth/callback/jace,http://127.0.0.1:8080/api/auth/callback/jace`
- **`JACE_CLIENT_TOYOTA_DASHBOARD_POST_LOGOUT_REDIRECT_URIS`**:
  - Production: `https://<this-app-host>/`
  - Local dev: `http://localhost:8080/,http://127.0.0.1:8080/`
- **Audience equality**: if overriding audiences, `JACE_RESOURCE_TOYOTA_DASHBOARD`
  on jace-auth must equal `JACE_AUTH_RESOURCE`, and `JACE_RESOURCE_TOYOTA_MCP`
  must equal `JACE_AUTH_MCP_RESOURCE`.

## Session Invalidation & RP-Initiated Logout

- `session.cookieCache` is disabled (`enabled: false`) in `src/lib/auth/server.ts`
  so sign-out and session revocation take effect immediately against the database
  with no 300-second signed-cookie replay window.
- When a user signed in via `jace-auth` clicks **Sign out**, `signOut()` queries
  `POST /api/auth/jace-logout`, clears Toyota's local session, and redirects
  through jace-auth's OIDC RP-Initiated Logout endpoint
  (`<issuer>/oauth2/end-session`) with `client_id`, `id_token_hint`, and a
  same-origin `post_logout_redirect_uri`. Direct Google and local email/password
  sign-out continue to perform local logout without redirecting to jace-auth.

## MCP Bearer Token Validation

When jace-auth is enabled:

- `/.well-known/oauth-protected-resource/api/mcp` advertises `jace-auth`
  alongside the local Toyota issuer only when `JACE_AUTH_MCP_RESOURCE` equals
  `MCP_RESOURCE_URL` exactly. Configure that same resource on jace-auth before
  enabling discovery. A mismatch leaves the local issuer discoverable while
  avoiding advertising a central issuer that cannot serve the requested audience.
- `POST /api/mcp` verifies Bearer JWTs issued by `jace-auth` against
  `<JACE_AUTH_ISSUER>/jwks`, `JACE_AUTH_ISSUER`, and `JACE_AUTH_MCP_RESOURCE`,
  mapping `sub` through the linked `"account"` (`providerId = 'jace'`) to the
  owning local `"user"."id"`.
- Existing local-issuer OAuth tokens and static `toyota_mcp_*` bearer tokens
  continue to work unchanged.

## Rollback (dual-run)

Both paths stay live side by side — the direct **Continue with Google**
button is untouched. To roll back:

```sh
VITE_JACE_AUTH_ENABLED=false   # hides the button (client)
JACE_AUTH_ENABLED=false        # unregisters jace provider, disables RP logout & jace MCP issuer
```

Flipping either back restores central sign-in. No data is destroyed: local
users keep existing, and jace-auth identities link by verified email
(`accountLinking.trustedProviders`), so returning users keep ownership
history either way.

## Identity mapping

First central login: the jace-auth identity (`sub`) links to the existing
local user with the same verified email; otherwise a new local user is
created. The local `user.id` remains the ownership anchor for repair-order
data — identity truth moves to jace-auth, authorization stays local.

## Verification

Local proof (no real secrets): `jace-auth scripts/verify-toyota-stagec.mjs`
drives the real browser flow against a local jace-auth + this app and checks
the flag-off rollback paths.
