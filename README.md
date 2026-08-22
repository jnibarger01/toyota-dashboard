# Toyota Dashboard

Toyota Dashboard is a service-lane operations dashboard and Model Context Protocol (MCP) server for repair orders, blockers, follow-ups, recommendations, and advisor workflows.

## What it provides

- A web operator surface for service-lane work.
- A stateless `/api/mcp` endpoint for MCP-compatible clients.
- Read tools for lane summaries, repair orders, blockers, follow-ups, recommendations, and bounded search.
- Narrow write tools for repair-order operations, communications logging, follow-ups, and recommendations.
- OAuth 2.1 with PKCE through Better Auth, plus legacy scoped bearer-token compatibility.
- User-scoped ownership checks, optimistic concurrency, and append-only MCP audit records.
- Neon/Postgres production storage with PGlite/local development support.

The full MCP contract, authorization scopes, deployment requirements, and known limitations are documented in [`docs/mcp.md`](docs/mcp.md).

## Local development

Requirements: Node.js and npm.

```bash
npm install
npm run dev
```

The development server listens on `http://127.0.0.1:8080`.

Useful checks:

```bash
npm run typecheck
npm test
npm run lint
```

Do not use production credentials for local testing. Start from [`.env.example`](.env.example), and keep real secrets out of Git.

## Database setup

Local development can use the PGlite fallback. Production uses Neon/Postgres through `DATABASE_URL` and the checked-in migrations:

```bash
npm run db:migrate
```

The production build also runs the migration command, so run it only with an intentionally selected database connection.

## Authentication setup

Set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` for Better Auth, and keep `VITE_AUTH_ENABLED` enabled for the production operator surface. MCP clients use OAuth 2.1 with PKCE at the configured resource URL; legacy bearer tokens remain scoped compatibility credentials. Never commit secrets or use production tokens in local tests.

## Build and validation commands

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

## Deployment architecture

The intended deployment is the Vite/TanStack Start application and MCP route on a managed Nitro-compatible host, with Neon/Postgres for durable state and Better Auth for OAuth 2.1/PKCE. The local PGlite fallback is for development only. No deployment was performed as part of this remediation.

## Known production requirements

- `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and exact public `MCP_RESOURCE_URL`.
- Applied migrations, HTTPS, and a verified OAuth metadata/resource configuration.
- Scoped bearer tokens or OAuth clients with ownership checks and optimistic concurrency enabled.
- Production database backups and monitoring for append-only MCP audit records.
- Verification that outbound communication tools remain logging-only; the current MCP write tools do not send customer communications.

## MCP production configuration

Set `MCP_RESOURCE_URL` to the exact public HTTPS URL of the MCP endpoint, normally:

```env
MCP_RESOURCE_URL=https://<production-domain>/api/mcp
```

Apply the Better Auth OAuth/MCP migration through the normal migration path before enabling production OAuth. MCP writes are authorization-gated and do not send customer communications; `add_ro_communication` records that a communication occurred.

## Project structure

- `src/routes/` — application and MCP routes
- `src/lib/mcp/` — authentication, scopes, tools, and audit behavior
- `src/lib/` — domain repositories and service-lane logic
- `migrations/` — database migrations
- `scripts/` — migrations, fixtures, and test helpers
- `docs/mcp.md` — detailed MCP and OAuth documentation
