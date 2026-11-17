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
```

jace-auth side: the `toyota-dashboard` managed client must allow the exact
redirect `https://<this-app-host>/api/auth/oauth2/callback/jace`
(`JACE_CLIENT_TOYOTA_DASHBOARD_REDIRECT_URIS`) and, if overriding audiences,
`JACE_RESOURCE_TOYOTA_DASHBOARD` must equal the dashboard's
`JACE_AUTH_RESOURCE` (audience equality).

## Rollback (dual-run)

Both paths stay live side by side — the direct **Continue with Google**
button is untouched. To roll back:

```sh
VITE_JACE_AUTH_ENABLED=false   # hides the button (client)
JACE_AUTH_ENABLED=false        # unregisters the provider (server; sign-in then 400s)
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
