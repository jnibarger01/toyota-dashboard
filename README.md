# Toyota Dashboard

Toyota Dashboard is a service-lane operations dashboard and Model Context Protocol (MCP) server for repair orders, blockers, follow-ups, recommendations, and advisor workflows.

## Stack and architecture

- **UI:** React, TanStack Router/Start, Vite, Tailwind CSS.
- **Server:** TanStack Start server functions and route handlers, bundled by Nitro for Vercel.
- **Auth:** Better Auth at `/api/auth/*`, OAuth 2.1/MCP integration, PKCE, bearer-token compatibility, and user-scoped session checks.
- **MCP:** Authenticated `/api/mcp` endpoint with per-tool scopes, ownership checks, optimistic concurrency, and append-only audit records.
- **Data:** Neon/Postgres in production; PGlite is an explicitly local/live-preview fallback only.
- **AI:** Server-only OpenAI calls from `rewriteAdvisorText` and verified repair-order drafting functions. API keys never enter browser bundles.

The application shell is protected by the `/_app` route guard. MCP and auth routes use framework-native TanStack Start handlers; there is no competing API architecture.

## Local setup

Requirements: Node.js and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The development server listens on `http://127.0.0.1:8080`.

## Environment variables

Start from `.env.example`. Never commit `.env.local` or real credentials.

| Variable | Local development | Production |
| --- | --- | --- |
| `DATABASE_URL` | Optional; unset uses PGlite | **Required managed Postgres/Neon URL** |
| `BETTER_AUTH_SECRET` | Optional; a process-local preview secret is used | **Required; no ephemeral fallback** |
| `BETTER_AUTH_URL` | Optional; loopback/preview origin is derived | **Required public application URL** |
| `MCP_RESOURCE_URL` | Optional; defaults to `/api/mcp` on the auth origin | Set to the exact public HTTPS MCP URL |
| `VITE_AUTH_ENABLED` | May be `false` only for an explicit local/static demo | Must remain enabled; `false` is rejected |
| `OPENAI_API_KEY` | Optional; AI features return a clear unavailable result | Required only if AI features are enabled |

Production startup/build validation fails closed when managed Postgres, authentication, or the production auth URL/secret is missing. PGlite is never a production persistence fallback.

## Database setup

Schema is defined by the ordered SQL files in `migrations/`.

- Local PGlite applies migrations automatically for development and preview.
- A configured `DATABASE_URL` selects Neon/Postgres.
- `npm run build` runs `scripts/migrate.mjs`; without `DATABASE_URL` it skips only for an explicitly local build or Pages demo.
- For a managed database, run the migration command with the deployment's `DATABASE_URL` before serving traffic. Do not point local development at production data.

## Authentication and MCP setup

Better Auth is served through the framework-native routes:

- `GET`/`POST /api/auth/*` → Better Auth handler.
- `/.well-known/oauth-protected-resource/api/mcp` → protected-resource metadata.
- `/api/mcp` → authenticated MCP operations.

For OAuth/MCP, configure `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, and `MCP_RESOURCE_URL`, apply the auth/MCP migrations, then mint least-privilege MCP tokens with the documented script:

```bash
DATABASE_URL=... node scripts/mint-mcp-token.mjs \
  --user-id <id> --label "integration" \
  --scopes "toyota:read"
```

Do not place bearer tokens in source, browser code, logs, or documentation. MCP writes require explicit scopes and remain scoped to the authenticated advisor's records.

## Commands

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run build:pages
```

`npm run lint` currently reports four non-blocking pre-existing React Fast Refresh warnings and no errors. The production build emits a large-client-chunk advisory; this is a performance follow-up, not a build failure.

## Deployment architecture and requirements

The supported production target is Vercel/Nitro:

1. Vite builds the browser application.
2. TanStack Start produces the SSR graph.
3. Nitro packages the SSR server with the Vercel preset and `serverDir: "./server"`.
4. `inlineDynamicImports: true` keeps the SSR entry from producing the invalid facade/re-export failure previously seen in the Better Auth/CIMD graph.
5. Vercel provides the server runtime and managed Postgres provides durable state.

Before any production deployment, verify:

- `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` are present and valid.
- `MCP_RESOURCE_URL` matches the public HTTPS MCP endpoint.
- Auth and MCP migrations have been applied to the intended non-production/production database through an approved release process.
- OAuth redirect URLs and trusted origins match the deployed application URL.
- Vercel build output and authenticated route smoke tests pass.

This repository does not deploy production as part of local verification. No credentials or production database are required for the local test/build suite.

## Repository map

- `src/routes/` — application, auth, OAuth metadata, and MCP routes.
- `src/lib/auth/` — Better Auth configuration and session middleware.
- `src/lib/mcp/` — MCP authentication, scopes, tools, and audit behavior.
- `src/lib/` — database, repositories, AI server functions, and domain logic.
- `migrations/` — database schema and auth/MCP migrations.
- `scripts/` — migrations, fixtures, and regression/integration tests.
- `vite.config.ts` — TanStack Start, auth popup, PGlite bootstrap, and Nitro/Vercel configuration.

## Known production requirements and limitations

- The production policy intentionally rejects missing managed Postgres or auth configuration; it does not silently fall back to PGlite.
- AI output is a draft and is never treated as a sent customer communication.
- The in-process MCP rate limiter is only a speed bump across serverless instances; use platform-level controls for adversarial traffic.
- The browser client bundle contains no OpenAI API key or server database credentials.
- Production deployment, database mutation, OAuth changes, and external account changes require explicit release approval.
