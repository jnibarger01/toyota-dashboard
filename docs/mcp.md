# Toyota Dashboard MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) endpoint exposing a constrained Toyota
service-lane interface to MCP clients (Claude Code, Claude Desktop, Codex, ChatGPT-compatible clients,
Cursor, and other MCP-compatible tools).

```
v0.1 — READ / OBSERVE        (shipped)
v0.2 — WRITE / OPERATE       (shipped, this doc's main subject)
future — WORKFLOWS / AGENT ACTIONS   (not implemented — see "Known limitations")
```

```
MCP client
   │  HTTPS + Authorization: Bearer <token>
   ▼
/api/mcp  (TanStack Start route, Streamable HTTP, stateless)
   │
   ├── READ   get_lane_summary, list_repair_orders, get_repair_order,
   │          list_blocked_repair_orders, list_follow_ups,
   │          get_recommendations, search_repair_orders
   │
   └── WRITE  create_repair_order, update_repair_order, update_repair_order_status,
              update_repair_order_notes, close_repair_order, assign_repair_order,
              add_ro_blocker, resolve_ro_blocker, add_ro_communication,
              create_follow_up, complete_follow_up, add_recommendation,
              update_recommendation, update_recommendation_status
   │
   ▼
src/lib/mcp/tools/*.ts  →  checkScope()  →  existing domain repositories
   │                                        (RepairOrderRepository, FollowUpRepository)
   ▼
Neon Postgres (same connection as the dashboard)  +  mcp_audit_log (append-only, MCP writes only)
```

## Endpoint

```
POST https://<production-domain>/api/mcp
```

Transport is [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http),
run in **stateless** mode (`sessionIdGenerator: undefined`, `enableJsonResponse: true`): no session id, no
server-held connection state, one JSON response per request. This is the shape recommended for
serverless/Vercel deployments — see `src/routes/api/mcp.ts`.

## Authentication

**There is no API-key plugin in the installed Better Auth version** (`better-auth@1.6.30` — checked its
package `exports` map: only session/bearer/OIDC-provider-style plugins ship, no `api-key` plugin).
Standing up a full OAuth provider on top of the existing Grok-broker-federated Better Auth setup would be
disproportionate. So this ships the narrowest mechanism that fits the existing app:

- A dedicated table, `mcp_api_tokens` (migration `0010_mcp_access.sql`): `id`, `user_id` (references
  Better Auth's `"user"(id)`, but is never selected *from* — the MCP surface only ever uses it as an
  opaque scoping key), `label`, `token_hash` (SHA-256 of the token — the plaintext is never stored),
  `scope` (space-delimited, see "Authorization scopes" below), `created_at`, `last_used_at`, `revoked_at`.
- Clients send `Authorization: Bearer <token>`. `src/lib/mcp/auth.ts` hashes it and looks it up. Any
  missing/malformed/unknown/revoked/rate-limited token **fails closed** (401/429) *before* the MCP server
  or database is touched for anything else.
- Every tool call is scoped by the `user_id` resolved from the token — the exact same ownership boundary
  `authMiddleware` enforces for the dashboard itself (every `repair_orders`/`service_follow_ups` row is
  already scoped by `user_id`, and every write goes through the same `user_id`-scoped conditional UPDATE
  the dashboard's own mutations use). One token = one advisor's data, full stop — **the authenticated
  token determines the owner; no tool accepts a caller-supplied `user_id`.**
- Tokens are minted **out of band** by an operator, not through any API the dashboard or MCP surface
  exposes — see "Minting a token" below.

### Authorization scopes

v0.1 shipped a single `toyota:read` scope. v0.2 adds four granular write scopes instead of one broad
`toyota:write` — a token minted for, say, a communication-logging integration never gets authority over
RO status or recommendations:

| Scope | Grants |
| --- | --- |
| `toyota:read` | All 7 read tools |
| `toyota:ro:write` | `create_repair_order`, `update_repair_order`, `update_repair_order_status`, `update_repair_order_notes`, `close_repair_order`, `assign_repair_order`, `add_ro_blocker`, `resolve_ro_blocker` |
| `toyota:communication:write` | `add_ro_communication` |
| `toyota:followup:write` | `create_follow_up`, `complete_follow_up` |
| `toyota:recommendation:write` | `add_recommendation`, `update_recommendation`, `update_recommendation_status` |

**Scope checking happens per tool call (`checkScope()` in `src/lib/mcp/tool-helpers.ts`), not once at
connection time.** `authenticateMcpRequest` (`auth.ts`) only verifies the token itself — it deliberately
does **not** reject a token for lacking a particular scope, because different tools need different
scopes and a token may legitimately hold only some of them. A token with zero recognized scopes still
authenticates; every tool call it then attempts fails cleanly with `Missing required scope: ...`. This is
where "fail closed" for *authorization* actually happens — see `scripts/mcp.test.ts`'s `checkScope`
tests and the live-verified "a read-only token cannot call a write tool" check in the smoke test.

Existing v0.1 read-only tokens are untouched by this change and remain read-only — they simply have no
scope beyond `toyota:read`, so every write tool's `checkScope` rejects them.

### Rate limiting

A best-effort, per-process, fixed-window limiter (60 requests/minute per token) lives in
`src/lib/mcp/auth.ts`. It is **not** a distributed rate limit — Vercel Fluid Compute can serve concurrent
requests from different warm instances, each with its own in-memory bucket. Treat it as a speed bump
against a single runaway client, not abuse protection. A deployment expecting adversarial traffic should
add a platform-level control (e.g. Vercel Firewall / BotID) in front of `/api/mcp`.

## Read tools (v0.1)

None of them accept raw SQL, arbitrary field selection, or unbounded result sizes. Every input is
Zod-validated; invalid input is rejected with an MCP `-32602 Invalid params` result, not silently coerced.
All require `toyota:read`. Annotated `readOnlyHint: true`.

| Tool | Description |
| --- | --- |
| `get_lane_summary` | Current lane picture: active RO counts by stage, blocked count, overdue follow-up count, oldest waiting RO, and up to 5 ROs needing immediate attention (reuses the same `computePriority` logic the dashboard itself uses). |
| `list_repair_orders` | Lists active ROs, optional `status` filter (one `WorkflowState`), `limit` (default 20, max 50). |
| `get_repair_order` | Full operational summary for one RO by `ro_id` (accepts either the internal id or the human RO number): status, timestamps, open blockers, recommendations, communication state, follow-up state, and `version` (needed by the write tools' `expected_version`). |
| `list_blocked_repair_orders` | Active ROs with ≥1 unresolved blocker, with why — "which cars are stuck and why?" |
| `list_follow_ups` | Follow-ups, optional `due_before` (ISO datetime) and `status` filters, `limit` (default 20, max 50). |
| `get_recommendations` | Recommendation line items for one RO by `ro_id`, with amount/approval state. |
| `search_repair_orders` | Substring match over RO number / customer name / vehicle make+model only (`query`, `limit` default 10 max 25) — no wildcard/SQL syntax accepted; the term is LIKE-escaped before it reaches SQL. |

## Write tools (v0.2)

Each represents one specific domain action — there is no generic patch/CRUD tool, no `delete_*` tool, and no arbitrary SQL interface. `create_repair_order` is intentionally first-class because Toyota Dashboard owns its RO records; it reuses existing owned customer/vehicle rows when IDs are supplied and otherwise follows the existing intake path. Every input schema is a `z.strictObject(...)` — an unrecognized field is a validation error, not silently dropped. Annotated
`readOnlyHint: false, destructiveHint: false`; `idempotentHint` is `true` only where re-applying the same
target state is a genuine no-op in the existing domain model (`update_repair_order_status`,
`update_recommendation_status`) — everywhere else (creates, and the "complete/resolve" tools, which
*reject* re-application rather than silently no-op) it's `false`.

| Tool | Scope | Description |
| --- | --- | --- |
| `create_repair_order` | `toyota:ro:write` | Creates an application-owned RO from existing customer/vehicle IDs or practical intake fields. Returns the new RO id/number/version. |
| `update_repair_order` | `toyota:ro:write` | Strict bounded update of appointment/promise, concern, technician, diagnosis/findings, and parts fields. |
| `update_repair_order_notes` | `toyota:ro:write` | Appends an internal note to the immutable operational history. |
| `close_repair_order` | `toyota:ro:write` | Explicitly changes `ready` to existing terminal state `delivered`; preserves history and rejects already-closed/invalid state. |
| `assign_repair_order` | `toyota:ro:write` | Assigns the RO to an existing application advisor/user and records an event. |
| `create_follow_up` | `toyota:followup:write` | Creates a follow-up on an owned RO. |
| `complete_follow_up` | `toyota:followup:write` | Marks an owned follow-up completed. **Rejects** (does not silently no-op) if already completed. |
| `add_ro_blocker` | `toyota:ro:write` | Adds a blocker to an owned RO, using the existing `BLOCKER_TYPES` enum (`customer_approval`, `technician`, `parts`, `warranty`, `advisor`, `shop_capacity`, `sublet`, `transportation`, `unknown`) — no invented types. |
| `resolve_ro_blocker` | `toyota:ro:write` | Resolves an unresolved blocker. The row is preserved (`resolved_at` is set, not deleted) — history stays visible via `get_repair_order`. Resolving an already-resolved blocker is rejected with a clear conflict, not a silent no-op. |
| `add_ro_communication` | `toyota:communication:write` | **Documents that a communication occurred — it never sends anything.** See "`add_ro_communication` does not send messages" below. |
| `update_recommendation_status` | `toyota:recommendation:write` | Sets a recommendation to `recommended` \| `approved` \| `declined` — the actual `ro_recommendations.state` enum. (`recommended` *is* the pending/default state; there is no separate "pending"/"deferred" state in the schema, so none is invented here.) |
| `update_repair_order_status` | `toyota:ro:write` | Moves an owned RO to a new workflow status. Enforces the **same legal-transition state machine** the dashboard uses (`src/lib/ro-domain.ts`'s `TRANSITIONS` map) — e.g. `written → dispatched` is legal, `written → ready` is not. Unlike the dashboard, this tool exposes **no override** — MCP callers cannot bypass the state machine. |

All RO-scoped write tools take `expected_version` (the RO's optimistic-concurrency `version`, from
`get_repair_order`) — this is the *existing* concurrency mechanism the dashboard itself uses, reused
as-is: a stale version fails the underlying conditional `UPDATE ... WHERE version = $n`, which returns a
clear "changed elsewhere" error instead of racing a read-modify-write.

Full input/output shapes are in `src/lib/mcp/tools/*.ts`; they're short enough to read directly.

### `add_ro_communication` does not send messages

This is a **documentation tool**. Calling it inserts one row into `ro_communications` and resets the RO's
next-update-due timer (via the existing `RepairOrderRepository.recordContact`, unmodified) — the same
thing an advisor manually logging a call in the dashboard does. **It never calls a phone/SMS/email
provider, has no such integration, and cannot be made to send anything** — `RepairOrderRepository`
contains zero outbound network calls of any kind. It exists to answer "did anyone tell this customer
anything," not to tell them something.

## v0.3 ChatGPT / MCP Apps UI

The same remote MCP server registers the MCP Apps resource `ui://toyota-dashboard/service-lane.html` with MIME type `text/html;profile=mcp-app`. `get_lane_summary` links the resource through standard `_meta.ui.resourceUri` and the ChatGPT compatibility alias `openai/outputTemplate`. The widget is dependency-free and uses the MCP Apps bridge / `window.openai.callTool` when available; it does not create a second backend.

The current demo widget implements the four required compact surfaces: lane overview (active, waiting, blocked, follow-ups due, attention list), RO detail (status, customer/vehicle summary, concern, promise, recommendations, blockers), create-RO form, and confirmation actions for status change, internal notes, and close. Selecting an RO calls `get_repair_order`; mutations call the existing MCP write tools and refresh detail state. The existing dashboard route remains the full web operator surface. The resource itself is testable with MCP Inspector: connect to `/api/mcp`, list resources, read `ui://toyota-dashboard/service-lane.html`, then call `get_lane_summary`.

ChatGPT Developer Mode connection: add a custom MCP connector with the deployed HTTPS URL `https://<production-domain>/api/mcp` and the operator-minted bearer token. ChatGPT plan/workspace support for custom-authenticated write calls and embedded Apps SDK UI varies; backend writes must be verified independently with `scripts/test-mcp.mjs`. No ChatGPT-only success is claimed by this repository.
## Ownership boundary

Every write tool passes the token-resolved `userId` (never a tool argument) into the existing
`user_id`-scoped repository methods. A cross-user attempt (e.g. advisor A's token targeting advisor B's
RO) fails identically to a **not-found** — the ownership check and the existence check are the same SQL
`WHERE id = $1 AND user_id = $2`, so a wrong-owner attempt never distinguishes "doesn't exist" from
"exists but isn't yours." Verified for every entity category, both in `scripts/mcp.test.ts` (unit, PGLite)
and live in the smoke test (a second advisor's token attempting to add a blocker to the first advisor's
RO, over real HTTP):

- RO itself (add blocker / resolve blocker / record contact / transition status)
- A specific blocker
- A specific recommendation
- A follow-up (both creating one against someone else's RO, and completing someone else's follow-up)

## Audit log

Migration `0011_mcp_audit_log.sql` adds `mcp_audit_log`: `id`, `occurred_at`, `user_id`, `token_id`
(nullable FK to `mcp_api_tokens`, `ON DELETE SET NULL`), `tool_name`, `request_id`, `entity_type`,
`entity_id`, `previous_value` (`jsonb`), `new_value` (`jsonb`). `src/lib/mcp/audit.ts`'s
`recordMcpAudit()` is the only thing that writes to it, called once per successful mutation, from every
write tool.

- **`request_id`** is generated server-side once per HTTP request (`crypto.randomUUID()` in
  `src/routes/api/mcp.ts`), not taken from the client-supplied JSON-RPC id (which isn't guaranteed
  unique or trustworthy).
- **Append-only through the application path**: nothing in this codebase ever `UPDATE`s or `DELETE`s a
  `mcp_audit_log` row. This is enforced by code review / the absence of any such call, **not** by a
  restricted Postgres role — see "Database permission model" for why, and treat this the same way: an
  honest statement of what's actually enforced, not a claim of DB-level immutability.
- **A rejected mutation never creates a "success" audit row**: `recordMcpAudit` is only ever called
  *after* the mutation's own conditional/optimistic-locked update has already returned success. If
  `checkScope` denies the call, or the ownership/version/state check inside the repository method fails,
  execution never reaches the audit call at all. Verified directly in `scripts/mcp.test.ts` (a rejected
  cross-user transition leaves `mcp_audit_log` empty) and in the live smoke test.
- **`previous_value`/`new_value` contain only fields relevant to the mutation** — e.g.
  `add_ro_communication`'s audit entry is `{ method, sent }`, never the `summary`/`outcome` free text
  (which is advisor shorthand about the conversation and may reference customer-supplied details); a
  blocker's audit entry keeps `description` (the advisor's own operational note, not customer PII) but
  nothing else. No tool's audit entry contains a phone number, email, or VIN — none of those ever reach
  the MCP write-tool layer in the first place (see "Privacy" below).
- **Not wrapped in the same DB transaction as the mutation itself** — see "Known limitations" for the
  honest reason why, and what the actual failure mode is (narrower than it sounds).

The **existing** `ro_events` audit trail (already written by `RepairOrderRepository`/`FollowUpRepository`
for every mutation, dashboard or MCP) is reused, not duplicated: every RO-repository write method
(`addBlocker`, `resolveBlocker`, `decideRecommendation`, `recordContact`, `transition`) and every
follow-up method (`create`, `setOutcome`) now accepts an optional `source` parameter (default `"manual"`,
unchanged for every existing dashboard call site), and every MCP write tool passes `source: "mcp"`. So an
MCP-originated `ro_events` row is distinguishable from a dashboard-originated one at the existing
domain-event layer too, not just in `mcp_audit_log`.

## Privacy / data minimization

`src/lib/mcp/privacy.ts` and `src/lib/mcp/shape.ts` are the only place tool responses get built from raw
repository rows — true for both read and write tools:

- **Customer name** → first name + last initial only (`maskCustomerName`, e.g. "Taylor M."). The full
  surname never leaves the process.
- **Vehicle** → `"2024 Toyota RAV4 XLE"` (`vehicleSummary`) — never the VIN.
- **VIN** → never returned or required by any tool, read or write.
- **Phone / email** → never returned or required by any tool, read or write.
  `add_ro_communication` takes `method` (an enum: phone/sms/email/in_person/voicemail) — never a phone
  number or address.
- **Communication content** → never returned (`get_repair_order`'s `communication` field is state-only)
  and never copied into the audit log.
- **Follow-up notes** → included in reads (advisor's own shorthand), capped at 300 characters; write
  tools don't currently accept a note field beyond the required `label`.
- Confirmed empirically end-to-end against a real seeded advisor/customer/vehicle/RO/recommendation,
  through the full v0.2 write walkthrough: none of the real seeded full name, phone, email, or VIN appear
  in any of the 14 tools' output or in `mcp_audit_log` (see "Testing").

## Database permission model — and its real limitation

**There is no separate `mcp_reader`/`mcp_writer` Postgres role or restricted `mcp` schema of views in
this release.** The MCP surface shares the app's single Neon connection (the same `DATABASE_URL` the
dashboard uses) for both reads and writes.

This was a deliberate call, not an oversight: creating a role/schema needs either (a) a SQL migration
that runs `CREATE ROLE ... WITH PASSWORD '...'` — which would either commit a real secret to source, or
require generating a password no one can retrieve later — or (b) provisioning a second Neon role/branch
through the Neon console/API and wiring a second `MCP_DATABASE_URL`, neither of which is safe to invent
from a coding session with no live Neon access. A bad `CREATE ROLE` in a migration would also hard-fail
every future `npm run build` (see `scripts/migrate.mjs` — migrations run in a transaction per file and a
failure aborts the deploy), so it's not something to guess at. **This is stated plainly, not disguised**
— there is no view/role in this codebase that isn't actually wired to something, per the instruction not
to invent a role and claim it's enforced.

**What actually enforces the boundary today is entirely application-level:**

1. No MCP tool — read or write — ever accepts or constructs SQL from user input. Every query is a fixed,
   parameterized string in `RepairOrderRepository` / `FollowUpRepository` (existing domain layer, reused
   unmodified except for the additive `source` parameter) or the two added methods,
   `RepairOrderRepository.search()` and `FollowUpRepository.getById()`. No write tool builds a dynamic
   column list or does an unvalidated object spread into a database call.
2. Every query — read or write — is scoped by `user_id = $n`, where `$n` comes only from the verified
   MCP token, never from a tool argument.
3. Every write tool's Zod schema is `z.strictObject(...)`: unknown fields are a validation error.
4. Better Auth's own tables (`"user"`, `"account"`, `"session"`, `"verification"`) are never queried by
   anything under `src/lib/mcp/` — enforced by a structural test in `scripts/mcp.test.ts` that greps the
   entire tree.
5. Every response is built field-by-field through `privacy.ts`/`shape.ts` — nothing passes a raw
   repository row straight to the client, and the audit log never receives full communication/customer
   free text.

**Remaining risk:** if the application's own Postgres credential were ever compromised, both the
"read-only for a read-scoped token" and "writes are confined to these 7 actions" guarantees are enforced
by this code, not by Postgres GRANTs. A future iteration should provision real `mcp_reader`/`mcp_writer`
roles (via Neon console/CLI, not a committed migration) and point the MCP connection at a separate
`MCP_DATABASE_URL`. Tracked under "required before production" below, not implemented here.

## Environment variables

No new environment variable is required beyond what v0.1 needed:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes (already required) | Same Neon connection the dashboard uses, for both MCP reads and writes. |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | Yes (already required) | Unrelated to MCP auth — Better Auth's own session secret, untouched by this change. |

`mcp_api_tokens` and its bearer tokens (including their scopes) are managed entirely in the database via
`scripts/mint-mcp-token.mjs` — there's no `MCP_AUTH_*` secret to configure.

## Minting a token

Run this **out of band** (operator machine, not the deployed app), with the same `DATABASE_URL`. Scopes
are explicit and **default to `toyota:read` only** when omitted — least privilege, not "grant everything":

```bash
# Read-only (identical to omitting --scopes entirely):
DATABASE_URL=postgres://... node scripts/mint-mcp-token.mjs \
  --user-id <better-auth-user-id> --label "Claude Code (read-only)"

# Read + every write scope:
DATABASE_URL=postgres://... node scripts/mint-mcp-token.mjs \
  --user-id <better-auth-user-id> --label "ChatGPT" \
  --scopes "toyota:read,toyota:ro:write,toyota:communication:write,toyota:followup:write,toyota:recommendation:write"

# Just follow-up management, nothing else:
DATABASE_URL=postgres://... node scripts/mint-mcp-token.mjs \
  --user-id <better-auth-user-id> --label "follow-up bot" \
  --scopes "toyota:read,toyota:followup:write"
```

Unknown scope strings are rejected by the script itself before anything is written. Find
`<better-auth-user-id>` directly from Better Auth's own table (this script never queries it):

```sql
select id, email from "user" where email = 'advisor@example.com';
```

The plaintext token is printed once:

```
Save this token now — it will not be shown again:

  <token printed once by the operator>
```

Revoke it later:

```bash
DATABASE_URL=postgres://... node scripts/mint-mcp-token.mjs --revoke <token-id>
```

## Local development

```bash
npm run dev                      # PGLite fallback (no DATABASE_URL) — mint-mcp-token.mjs won't work
                                  # against it; see "Testing" for a full local walkthrough with a real DB
```

Against a real (local or remote) Postgres:

```bash
DATABASE_URL=postgres://... npm run dev
DATABASE_URL=postgres://... SEED_USER_EMAIL=you@example.com SEED_USER_PASSWORD=at-least-12-chars node scripts/seed-user.mjs
DATABASE_URL=postgres://... node scripts/mint-mcp-token.mjs --user-id <id-from-above> --label "local dev" --scopes "toyota:read,toyota:ro:write,toyota:communication:write,toyota:followup:write,toyota:recommendation:write"
```

## Testing

```bash
npm run typecheck
npm test              # includes scripts/mcp.test.ts
npm run lint
npm run build
```

`scripts/mcp.test.ts` plus `scripts/mcp-v03.test.ts` (163 total repo tests pass, all against isolated PGLite instances, no live server
needed) covers, for v0.2 specifically:

- **Authorization**: `checkScope` allow/deny; `authenticateMcpRequest` now succeeds for a token regardless
  of which scopes it holds (scope enforcement moved to per-tool, proven separately); `domainErrorResult`
  surfaces only its allowlisted safe messages and rethrows anything else (so a driver/connection error
  can never reach a client through it); `requireWriteContext` fails closed when `tokenId`/`requestId`
  are missing.
- **Mutation behavior**: the existing write tools plus the v0.3 repository vertical slice — create/update/close
  RO, notes, recommendations, status transitions, add/resolve blocker, record contact, create/complete follow-up — proven
  against PGLite, including the "already resolved"/"already completed" conflict paths and the
  legal-transition enforcement (an illegal transition is rejected with the same error the dashboard
  would get).
- **`source` tagging**: an MCP-driven mutation's `ro_events` row has `source = 'mcp'`; an existing
  dashboard-shaped call (no `source` passed) still gets `source = 'manual'` — a direct regression check.
- **Ownership**: cross-user rejection for every entity category (RO, blocker, recommendation, follow-up),
  including confirming the target row is provably unchanged after a rejected cross-user attempt.
- **Audit**: `recordMcpAudit` writes exactly one row with a correct JSONB round-trip; a foreign-key
  failure on the insert (simulated with a nonexistent `token_id`) is swallowed, not thrown, and inserts
  nothing; a full mutate-then-audit sequence produces exactly one row with correct before/after state,
  and a rejected mutation produces none.
- **Validation**: malformed UUIDs, invalid enum values (including the "deferred" recommendation status
  that isn't real), missing required fields, and unknown fields (via `z.strictObject`) are all rejected.
- Everything already covered in v0.1 (privacy helpers, `search()`, rate limiting, the structural
  no-auth-table-reference check) continues to pass unchanged.

### MCP smoke test

`scripts/test-mcp.mjs` and `scripts/mcp-test-v03-http.mjs` drive the endpoint through a **real MCP client**
(`@modelcontextprotocol/sdk`'s `Client` + `StreamableHTTPClientTransport`) over real HTTP — for the full
v0.2 walkthrough it also directly queries `DATABASE_URL` (if set) to confirm audit rows, since an MCP
client itself has no way to inspect the audit log:

```bash
npm run dev   # in one terminal, against a real DATABASE_URL

MCP_URL=http://localhost:8080/api/mcp \
MCP_TOKEN=<full-scope token, from mint-mcp-token.mjs>            \
MCP_READONLY_TOKEN=<toyota:read-only token, SAME advisor>        \
MCP_OTHER_USER_TOKEN=<any-scope token, a DIFFERENT advisor>      \
DATABASE_URL=postgres://...   \
node scripts/test-mcp.mjs
```

It checks (omit the optional tokens/`DATABASE_URL` to run a smaller subset): unauthenticated/invalid
token rejection, `initialize`/`tools/list` (all 21 tools present, read tools annotated
`readOnlyHint:true`, write tools `readOnlyHint:false`), the v0.1 read checks (PII-absence, missing-RO,
unknown-tool, excessive-limit), then the full write walkthrough — create a follow-up, complete it (and
confirm re-completing is rejected), add a blocker, resolve it (and confirm re-resolving is rejected), add
a communication, approve a recommendation, transition the RO's status (and confirm an illegal transition
is rejected) — reading the result back through `get_repair_order` after each step, then finally a
read-only token failing to call a write tool, and a different advisor's token failing to mutate this RO.

The v0.3 HTTP flow was executed against a disposable `postgres:16-alpine` container, migrated and seeded
with two Better Auth users, owned customer/vehicle/RO data, a recommendation, and three scoped tokens,
then torn down. The run passed: all 21 tools were present; create/read/update/notes/blocker/
communication/recommendation/follow-up/status/close operations passed; read-only and cross-user writes
were rejected; and a direct SQL check found 20 audit rows for 20 successful mutations. The final created
RO read back as `delivered`. No seeded full customer name, phone, email, or VIN was returned by the MCP
responses.

The reproducible client-side flow is `scripts/mcp-test-v03-http.mjs`; it expects `MCP_URL`, `MCP_TOKEN`,
`MCP_READONLY_TOKEN`, and `MCP_OTHER_USER_TOKEN`. Run it only against a disposable database/container,
never against live production data.

## Deployment

No Vercel configuration changes are required. `npm run build` (`vite build && npm run db:migrate`)
already applies `migrations/*.sql` — including `0010_mcp_access.sql` and `0011_mcp_audit_log.sql` — to
`DATABASE_URL` on every deploy, the same as every other migration in this repo. The route is bundled as
part of the existing Nitro `vercel` preset server function; nothing about the Better Auth routes, static
assets, or existing API surface changes.

After deploying, mint a token (with the scopes the client actually needs — see "Minting a token") against
production's `DATABASE_URL`, then point an MCP client at `https://<production-domain>/api/mcp`.

## Connecting an MCP client

### Claude Code

```bash
claude mcp add --transport http toyota-dashboard https://<production-domain>/api/mcp \
  --header "Authorization: Bearer <token>"
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "toyota-dashboard": {
      "url": "https://<production-domain>/api/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

### Codex CLI (`~/.codex/config.toml`)

```toml
[mcp_servers.toyota-dashboard]
url = "https://<production-domain>/api/mcp"
headers = { Authorization = "Bearer <token>" }
```

### ChatGPT (Developer Mode custom connector) / other clients supporting a custom MCP connector

Add a connector with:
- **MCP Server URL**: `https://<production-domain>/api/mcp`
- **Authentication**: Custom header, `Authorization: Bearer <token>`

The exact steps depend on the client's connector UI, but every MCP-compatible client that supports the
Streamable HTTP transport with a custom `Authorization` header works the same way.

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "toyota-dashboard": {
      "url": "https://<production-domain>/api/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

Never put a real token in a committed file — pass it via the client's own secret/env mechanism. Mint a
token with only the scopes that client actually needs (see "Minting a token").

## Known limitations

- No dedicated Postgres role/schema isolation yet (see "Database permission model" above) — the
  enforcement boundary is entirely application-level, for both reads and writes.
- Rate limiting is per-process, best-effort, not distributed.
- No token-issuance UI — minting is a CLI script run by an operator with `DATABASE_URL` access.
- `search_repair_orders` only matches RO number / customer name / vehicle make+model — it does not search
  `concern`/`diagnosis` free text (deliberate: those fields aren't in the allowlist).
- **The mutation and its `mcp_audit_log` row are not wrapped in a single DB transaction.** The shared
  `Sql` connection is a `pg.Pool`; the existing repository methods (reused unmodified here, shared with
  the dashboard) don't hand callers a dedicated connection to `BEGIN`/`COMMIT` across two calls, and
  changing that is a much larger, riskier change to shared infrastructure than this task's scope
  justifies. The actual gap this leaves is narrow: the mutation itself is always atomic (a single
  conditional `UPDATE`/CTE), and `recordMcpAudit` is only ever called after that mutation already
  returned success — so the only failure mode is "the mutation succeeded but the audit insert itself then
  failed" (e.g. a transient connection error), which is logged loudly server-side
  (`console.error("[mcp] failed to write audit log entry...")`) even though the tool call still correctly
  reports success to the client. The reverse (a rejected mutation producing a fake success audit row) is
  structurally impossible, not just avoided in practice — the audit call only exists in the code path
  that runs after a successful repository return.
- `update_repair_order_status` exposes no override — if the dashboard's advisor-correction bypass is ever
  needed, that stays a dashboard-only action.
- `create_follow_up` doesn't accept `estimated_opportunity` (kept out to keep the input surface narrow;
  the repository defaults it to 0).
- No workflow/agent-action layer (multi-step automated sequences, e.g. "chase every overdue follow-up") —
  intentionally out of scope for this phase; each call remains one discrete, auditable action.

## Future — WORKFLOWS / AGENT ACTIONS (not implemented)

Not built in this phase. Any future workflow layer should compose the existing discrete v0.1/v0.2 tools
rather than introduce new direct-mutation surface — the write tools already give an agent everything a
workflow would need (read state, take one action, read state again), so a workflow orchestrator can stay
entirely client-side (or as a thin MCP prompt/resource layer) without the server needing to know about
"workflows" as a concept. Anything that *would* need new server-side capability (e.g. transactional
multi-step operations, or human-approval gates before a write) should get its own design pass rather than
being folded into this write layer's scope.
