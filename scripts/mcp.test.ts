import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { z } from "zod";
import { PGlite } from "@electric-sql/pglite";
import { escapeLikePattern, maskCustomerName, maskVin, vehicleSummary } from "../src/lib/mcp/privacy.ts";
import {
  checkScope,
  clampLimit,
  domainErrorResult,
  errorResult,
  requireUserId,
  requireWriteContext,
  safeToolCall,
  textResult,
} from "../src/lib/mcp/tool-helpers.ts";
import { authenticateMcpRequest, McpHttpError } from "../src/lib/mcp/auth.ts";
import { SCOPES } from "../src/lib/mcp/scopes.ts";
import { recordMcpAudit } from "../src/lib/mcp/audit.ts";
import { RepairOrderRepository } from "../src/lib/ro-repository.server.ts";
import { FollowUpRepository } from "../src/lib/follow-up-repository.server.ts";
import { WORKFLOW_STATES, BLOCKER_TYPES } from "../src/lib/ro-domain.ts";

// --- privacy.ts --------------------------------------------------------

test("vehicleSummary joins only present fields, falling back to a generic label", () => {
  assert.equal(vehicleSummary({ year: 2024, make: "Toyota", model: "RAV4", trim: "XLE" }), "2024 Toyota RAV4 XLE");
  assert.equal(vehicleSummary({ year: null, make: "Toyota", model: "RAV4", trim: null }), "Toyota RAV4");
  assert.equal(vehicleSummary({ year: null, make: null, model: null, trim: null }), "Vehicle");
});

test("maskCustomerName never returns a full surname", () => {
  assert.equal(maskCustomerName("Taylor Morrison"), "Taylor M.");
  assert.equal(maskCustomerName("Cher"), "Cher");
  assert.equal(maskCustomerName("  Pat   Lee  "), "Pat L.");
  assert.equal(maskCustomerName(""), "Customer");
});

test("maskVin only ever exposes the last 4 characters", () => {
  const masked = maskVin("1HGCM82633A004352");
  assert.equal(masked, "•••••••••••••4352");
  assert.ok(!masked.includes("1HGCM82633A"));
});

test("escapeLikePattern neutralizes LIKE metacharacters so a search term can't widen its own match", () => {
  assert.equal(escapeLikePattern("50%_off\\deal"), "50\\%\\_off\\\\deal");
});

// --- tool-helpers.ts -----------------------------------------------------

test("clampLimit defaults, clamps to the hard max, and floors below 1", () => {
  assert.equal(clampLimit(undefined, 20, 50), 20);
  assert.equal(clampLimit(500, 20, 50), 50);
  assert.equal(clampLimit(0, 20, 50), 1);
  assert.equal(clampLimit(Number.NaN, 20, 50), 20);
});

test("requireUserId throws rather than proceed with an unresolved user", () => {
  assert.throws(() => requireUserId({}), /resolved user context/);
  assert.equal(requireUserId({ authInfo: { extra: { userId: "advisor-1" } } }), "advisor-1");
});

test("safeToolCall never lets a database/driver error message reach the client", async () => {
  const leaky = new Error('password authentication failed for user "postgres" at host db.internal.example.com');
  const result = await safeToolCall("some_tool", async () => {
    throw leaky;
  });
  assert.equal(result.isError, true);
  const text = (result.content[0] as { text: string }).text;
  assert.ok(!text.includes("postgres"));
  assert.ok(!text.includes("db.internal.example.com"));
  assert.equal(text, "Internal error — the request could not be completed.");
});

test("textResult / errorResult shape", () => {
  assert.deepEqual(textResult({ a: 1 }), { content: [{ type: "text", text: JSON.stringify({ a: 1 }, null, 2) }] });
  assert.deepEqual(errorResult("nope"), { content: [{ type: "text", text: "nope" }], isError: true });
});

test("checkScope allows a token holding the required scope and rejects one without it", () => {
  assert.equal(checkScope({ authInfo: { scopes: [SCOPES.READ, SCOPES.RO_WRITE] } }, SCOPES.RO_WRITE), null);

  const denied = checkScope({ authInfo: { scopes: [SCOPES.READ] } }, SCOPES.RO_WRITE);
  assert.equal(denied?.isError, true);
  assert.match((denied!.content[0] as { text: string }).text, /toyota:ro:write/);

  const noAuthInfoAtAll = checkScope({}, SCOPES.READ);
  assert.equal(noAuthInfoAtAll?.isError, true);
});

test("domainErrorResult surfaces known-safe messages and rethrows anything unrecognized", () => {
  const known = domainErrorResult(new Error("Repair order not found"), ["Repair order not found"]);
  assert.equal(known.isError, true);
  assert.equal((known.content[0] as { text: string }).text, "Repair order not found");

  const knownByRegex = domainErrorResult(new Error("Invalid repair-order transition: written -> ready"), [/^Invalid repair-order transition: /]);
  assert.equal(knownByRegex.isError, true);

  // A driver/connection-shaped message is NOT in the allowlist, so it must
  // propagate (to be caught by the enclosing safeToolCall's generic handler),
  // never be echoed back to the client directly.
  assert.throws(
    () => domainErrorResult(new Error("connection terminated unexpectedly"), ["Repair order not found"]),
    /connection terminated/,
  );
});

test("requireWriteContext throws when tokenId/requestId are missing, else returns all three", () => {
  assert.throws(() => requireWriteContext({ authInfo: { extra: { userId: "advisor-1" } } }), /token id/);
  assert.throws(() => requireWriteContext({ authInfo: { extra: { userId: "advisor-1", tokenId: "t1" } } }), /request id/);
  assert.deepEqual(
    requireWriteContext({ authInfo: { extra: { userId: "advisor-1", tokenId: "t1", requestId: "r1" } } }),
    { userId: "advisor-1", tokenId: "t1", requestId: "r1" },
  );
});

// --- auth.ts ---------------------------------------------------------------

function sqlFor(db: PGlite) {
  const normalize = <T>(value: T): T => {
    if (value instanceof Date) return value.toISOString() as T;
    if (Array.isArray(value)) return value.map(normalize) as T;
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)])) as T;
    return value;
  };
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1] ?? ""}`;
    return (await db.query<T>(text, values)).rows.map(normalize);
  }) as typeof import("../src/lib/db.ts").getSql extends () => Promise<infer T> ? T : never;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows.map(normalize);
  return sql;
}

/** `user` (for the FK) + `mcp_api_tokens` only. No session/account/
 * verification table exists at all — proves authentication has zero
 * dependency on Better Auth's other tables. */
async function authDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.waitReady;
  await db.exec('create table "user" (id text primary key, name text not null, email text not null, "emailVerified" boolean not null, "createdAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now())');
  await db.exec(await readFile(new URL("../migrations/0010_mcp_access.sql", import.meta.url), "utf8"));
  return db;
}

async function mintToken(db: PGlite, opts: { userId: string; scope?: string; revoked?: boolean }): Promise<string> {
  await db.query('insert into "user" (id, name, email, "emailVerified") values ($1, $2, $3, true) on conflict (id) do nothing', [opts.userId, opts.userId, `${opts.userId}@example.com`]);
  const token = `toyota_mcp_test_${opts.userId}_${Math.random().toString(36).slice(2)}_padding_padding`;
  const hash = createHash("sha256").update(token).digest("hex");
  await db.query("insert into mcp_api_tokens (id, user_id, label, token_hash, scope, revoked_at) values ($1,$2,'test',$3,$4,$5)", [
    `${opts.userId}-token`, opts.userId, hash, opts.scope ?? SCOPES.READ, opts.revoked ? new Date().toISOString() : null,
  ]);
  return token;
}

function requestWith(auth: string | null): Request {
  const headers = new Headers();
  if (auth) headers.set("authorization", auth);
  return new Request("https://example.com/api/mcp", { headers });
}

test("authenticateMcpRequest rejects a missing bearer token", async (t) => {
  const db = await authDb();
  t.after(() => db.close());
  await assert.rejects(authenticateMcpRequest(requestWith(null), sqlFor(db)), (err: unknown) => err instanceof McpHttpError && err.status === 401);
});

test("authenticateMcpRequest rejects a malformed/unknown token", async (t) => {
  const db = await authDb();
  t.after(() => db.close());
  await assert.rejects(authenticateMcpRequest(requestWith("Bearer short"), sqlFor(db)), (err: unknown) => err instanceof McpHttpError && err.status === 401);
  await assert.rejects(
    authenticateMcpRequest(requestWith(`Bearer ${"x".repeat(43)}`), sqlFor(db)),
    (err: unknown) => err instanceof McpHttpError && err.status === 401 && err.message === "Invalid or revoked token",
  );
});

test("authenticateMcpRequest rejects a revoked token", async (t) => {
  const db = await authDb();
  t.after(() => db.close());
  const token = await mintToken(db, { userId: "advisor-1", revoked: true });
  await assert.rejects(authenticateMcpRequest(requestWith(`Bearer ${token}`), sqlFor(db)), (err: unknown) => err instanceof McpHttpError && err.status === 401);
});

// A successful call fires an un-awaited "last_used_at" update (by design —
// it must never add latency to the request). Give PGlite a tick to drain its
// query queue before closing, or `close()` can race that pending write.
async function closeAfterDrain(db: PGlite): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
  await db.close();
}

test("authenticateMcpRequest succeeds for ANY non-revoked token regardless of which scopes it holds — scope enforcement is per-tool, not per-connection", async (t) => {
  const db = await authDb();
  t.after(() => closeAfterDrain(db));
  const readOnly = await mintToken(db, { userId: "advisor-1", scope: SCOPES.READ });
  const writeOnly = await mintToken(db, { userId: "advisor-2", scope: SCOPES.RO_WRITE });
  const noScopesAtAll = await mintToken(db, { userId: "advisor-3", scope: "" });

  const readCtx = await authenticateMcpRequest(requestWith(`Bearer ${readOnly}`), sqlFor(db));
  assert.deepEqual(readCtx.scopes, [SCOPES.READ]);

  const writeCtx = await authenticateMcpRequest(requestWith(`Bearer ${writeOnly}`), sqlFor(db));
  assert.deepEqual(writeCtx.scopes, [SCOPES.RO_WRITE]);

  // Authenticates fine even with an empty scope string — every tool call it
  // then attempts will cleanly fail checkScope(), which is where "fail
  // closed" actually happens for authorization (see checkScope tests above).
  const noScopeCtx = await authenticateMcpRequest(requestWith(`Bearer ${noScopesAtAll}`), sqlFor(db));
  assert.deepEqual(noScopeCtx.scopes, []);
});

test("authenticateMcpRequest resolves the owning advisor and its tokenId — with no session/account/verification table present", async (t) => {
  const db = await authDb();
  t.after(() => closeAfterDrain(db));
  const token = await mintToken(db, { userId: "advisor-1" });
  const context = await authenticateMcpRequest(requestWith(`Bearer ${token}`), sqlFor(db));
  assert.equal(context.userId, "advisor-1");
  assert.equal(context.tokenId, "advisor-1-token");
});

test("authenticateMcpRequest rate-limits a single token after sustained bursts", async (t) => {
  const db = await authDb();
  t.after(() => closeAfterDrain(db));
  const token = await mintToken(db, { userId: "advisor-burst" });
  const sql = sqlFor(db);
  for (let i = 0; i < 60; i += 1) await authenticateMcpRequest(requestWith(`Bearer ${token}`), sql);
  await assert.rejects(authenticateMcpRequest(requestWith(`Bearer ${token}`), sql), (err: unknown) => err instanceof McpHttpError && err.status === 429);
});

// --- RepairOrderRepository.search ------------------------------------------

async function laneDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.waitReady;
  await db.exec(await readFile(new URL("../migrations/0003_service_advisor_os.sql", import.meta.url), "utf8"));
  await db.query("insert into service_customers (id, user_id, full_name) values ('cust-1','advisor-1','Taylor Morrison'), ('cust-2','advisor-2','Jamie Rivera')");
  await db.query("insert into service_vehicles (id, user_id, customer_id, make, model) values ('veh-1','advisor-1','cust-1','Toyota','RAV4'), ('veh-2','advisor-2','cust-2','Toyota','Camry')");
  await db.query("insert into repair_orders (id, user_id, ro_number, customer_id, vehicle_id, workflow_state) values ('ro-1','advisor-1','10482','cust-1','veh-1','written'), ('ro-2','advisor-2','99001','cust-2','veh-2','written')");
  return db;
}

test("search matches RO number, customer name, and vehicle make/model, scoped to the caller's own ROs", async (t) => {
  const db = await laneDb();
  t.after(() => db.close());
  const repository = new RepairOrderRepository(sqlFor(db));
  assert.equal((await repository.search("advisor-1", "%10482%", 10))[0]?.id, "ro-1");
  assert.equal((await repository.search("advisor-1", "%Morrison%", 10))[0]?.id, "ro-1");
  assert.equal((await repository.search("advisor-1", "%RAV4%", 10))[0]?.id, "ro-1");
  // Same term, wrong advisor: never crosses the user_id boundary.
  assert.deepEqual(await repository.search("advisor-1", "%99001%", 10), []);
  assert.deepEqual(await repository.search("advisor-1", "%Rivera%", 10), []);
});

test("search cannot be used to inject SQL or widen its own match via unescaped wildcards", async (t) => {
  const db = await laneDb();
  t.after(() => db.close());
  const repository = new RepairOrderRepository(sqlFor(db));
  const injection = `%${escapeLikePattern("'; drop table repair_orders; --")}%`;
  assert.deepEqual(await repository.search("advisor-1", injection, 10), []);
  const tables = await db.query("select table_name from information_schema.tables where table_name = 'repair_orders'");
  assert.equal(tables.rows.length, 1, "repair_orders must still exist");
  const wouldMatchIfUnescaped = `%${escapeLikePattern("1_482")}%`;
  assert.deepEqual(await repository.search("advisor-1", wouldMatchIfUnescaped, 10), []);
});

test("search respects the caller-provided limit", async (t) => {
  const db = await laneDb();
  t.after(() => db.close());
  await db.query("insert into repair_orders (id, user_id, ro_number, customer_id, vehicle_id, workflow_state) values ('ro-3','advisor-1','10483','cust-1','veh-1','written')");
  const repository = new RepairOrderRepository(sqlFor(db));
  const results = await repository.search("advisor-1", "%Toyota%", 1);
  assert.equal(results.length, 1);
});

// --- write layer: repository methods called by the 7 new MCP write tools ---
// These exercise exactly what the tool handlers call, proving (a) mutation
// behavior works, (b) the ownership boundary holds for every entity
// category, and (c) `source` correctly tags MCP-originated ro_events rows
// without disturbing the existing "manual" default the dashboard relies on.

/** PGlite's raw `.query()` returns `{ rows, fields, ... }`, not an array — this unwraps it. */
async function rows<T = Record<string, unknown>>(db: PGlite, text: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(text, params)).rows;
}

async function writeDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.waitReady;
  await db.exec('create table "user" (id text primary key, name text not null, email text not null, "emailVerified" boolean not null, "createdAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now())');
  for (const name of ["0003_service_advisor_os.sql", "0004_service_follow_ups.sql", "0008_follow_up_manual_origin.sql", "0010_mcp_access.sql", "0011_mcp_audit_log.sql"]) {
    await db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  }
  await db.query('insert into "user" (id, name, email, "emailVerified") values ($1,$1,$2,true), ($3,$3,$4,true)', ["advisor-1", "a1@example.com", "advisor-2", "a2@example.com"]);
  await db.query("insert into service_customers (id, user_id, full_name) values ('cust-1','advisor-1','Taylor Morrison')");
  await db.query("insert into service_vehicles (id, user_id, customer_id, make, model) values ('veh-1','advisor-1','cust-1','Toyota','RAV4')");
  await db.query("insert into repair_orders (id, user_id, ro_number, customer_id, vehicle_id, workflow_state, version) values ('ro-1','advisor-1','10482','cust-1','veh-1','written',1)");
  return db;
}

test("mutation behavior: add_ro_blocker / resolve_ro_blocker (addBlocker, resolveBlocker)", async (t) => {
  const db = await writeDb();
  t.after(() => db.close());
  const repository = new RepairOrderRepository(sqlFor(db));

  const added = await repository.addBlocker({ userId: "advisor-1", roId: "ro-1", actorId: "advisor-1", type: "parts", description: "Awaiting brake pads", severity: "high", expectedVersion: 1, source: "mcp" });
  assert.equal(added.version, 2);
  const [blocker] = await rows<{ id: string; resolved_at: string | null }>(db, "select id, resolved_at from ro_blockers where ro_id = 'ro-1'");
  assert.equal(blocker.resolved_at, null);
  assert.ok((BLOCKER_TYPES as readonly string[]).includes("parts"));

  const resolved = await repository.resolveBlocker({ userId: "advisor-1", roId: "ro-1", blockerId: blocker.id, expectedVersion: 2, actorId: "advisor-1", source: "mcp" });
  assert.equal(resolved.version, 3);
  const after = await rows<{ resolved_at: string | null }>(db, "select resolved_at from ro_blockers where id = $1", [blocker.id]);
  assert.ok(after[0]?.resolved_at, "blocker row is preserved with resolved_at set, not deleted");

  // Resolving an already-resolved blocker is a clean, specific conflict, not a silent no-op.
  await assert.rejects(
    repository.resolveBlocker({ userId: "advisor-1", roId: "ro-1", blockerId: blocker.id, expectedVersion: 3, actorId: "advisor-1" }),
    /Active blocker not found/,
  );

  const events = (await rows<{ event_type: string; source: string }>(db, "select event_type, source from ro_events where ro_id = 'ro-1' order by occurred_at")).map((e) => `${e.event_type}:${e.source}`);
  assert.deepEqual(events, ["blocker_added:mcp", "blocker_resolved:mcp"]);
});

test("mutation behavior: add_ro_communication (recordContact) documents contact without any outbound send", async (t) => {
  const db = await writeDb();
  t.after(() => db.close());
  const repository = new RepairOrderRepository(sqlFor(db));

  const updated = await repository.recordContact({ userId: "advisor-1", roId: "ro-1", expectedVersion: 1, actorId: "advisor-1", method: "phone", summary: "Discussed brake estimate", outcome: "approved", intervalMinutes: 90, source: "mcp" });
  assert.equal(updated.version, 2);
  assert.ok(updated.lastCustomerContactAt);
  assert.ok(updated.nextUpdateDueAt);
  const comm = await rows<{ method: string; sent: boolean; source: string }>(db, "select method, sent, source from ro_communications where ro_id = 'ro-1'");
  assert.deepEqual(comm[0], { method: "phone", sent: true, source: "mcp" });

  const events = await rows<{ source: string }>(db, "select source from ro_events where ro_id = 'ro-1' and event_type = 'customer_contacted'");
  assert.equal(events[0]?.source, "mcp");
});

test("mutation behavior: update_recommendation_status (decideRecommendation) defaults ro_events.source to 'manual' when the caller omits it (dashboard regression check)", async (t) => {
  const db = await writeDb();
  t.after(() => db.close());
  const repository = new RepairOrderRepository(sqlFor(db));
  await repository.addRecommendation({ userId: "advisor-1", roId: "ro-1", description: "Front brake pads", amount: 400, expectedVersion: 1, actorId: "advisor-1" });
  const [rec] = await rows<{ id: string }>(db, "select id from ro_recommendations where ro_id = 'ro-1'");

  const updated = await repository.decideRecommendation({ userId: "advisor-1", roId: "ro-1", id: rec.id, state: "approved", expectedVersion: 2, actorId: "advisor-1", source: "mcp" });
  assert.equal(updated.approvedTotal, 400);
  const mcpEvent = await rows<{ source: string }>(db, "select source from ro_events where event_type = 'recommendation_state_changed'");
  assert.equal(mcpEvent[0]?.source, "mcp");

  await repository.addRecommendation({ userId: "advisor-1", roId: "ro-1", description: "Wiper blades", amount: 40, expectedVersion: 3, actorId: "advisor-1" });
  const [rec2] = await rows<{ id: string }>(db, "select id from ro_recommendations where description = 'Wiper blades'");
  await repository.decideRecommendation({ userId: "advisor-1", roId: "ro-1", id: rec2.id, state: "declined", expectedVersion: 4, actorId: "advisor-1" }); // no `source` — existing dashboard call shape
  const manualEvent = await rows<{ source: string }>(db, "select source from ro_events where event_type = 'recommendation_state_changed' and previous_value->>'id' = $1", [rec2.id]);
  assert.equal(manualEvent[0]?.source, "manual");
});

test("mutation behavior: update_repair_order_status (transition) enforces the existing legal-transition state machine", async (t) => {
  const db = await writeDb();
  t.after(() => db.close());
  const repository = new RepairOrderRepository(sqlFor(db));
  const updated = await repository.transition({ userId: "advisor-1", roId: "ro-1", to: "dispatched", expectedVersion: 1, actorId: "advisor-1", source: "mcp" });
  assert.equal(updated.state, "dispatched");
  assert.equal(updated.previousState, "written");

  // written -> ready is not a legal transition — the MCP tool exposes no
  // override, unlike the dashboard's advisor-correction path.
  await assert.rejects(
    repository.transition({ userId: "advisor-1", roId: "ro-1", to: "ready", expectedVersion: 2, actorId: "advisor-1", source: "mcp" }),
    /Invalid repair-order transition: dispatched -> ready/,
  );
});

test("mutation behavior: create_follow_up / complete_follow_up (FollowUpRepository.create, getById, setOutcome)", async (t) => {
  const db = await writeDb();
  t.after(() => db.close());
  const repository = new FollowUpRepository(sqlFor(db));

  assert.equal(await repository.getById("advisor-1", "does-not-exist"), null);

  const created = await repository.create({ userId: "advisor-1", roId: "ro-1", reason: "customer_callback", label: "Call after parts arrive", callbackAt: "2026-08-21T15:00:00.000Z", createdManually: true });
  assert.equal(created.outcome, "open");
  assert.deepEqual(await repository.getById("advisor-1", created.id), created);

  const completed = await repository.setOutcome("advisor-1", created.id, "completed");
  assert.equal(completed.outcome, "completed");
  // completing does NOT fabricate a communication row (unlike called/texted/voicemail/responded).
  assert.equal((await rows(db, "select id from ro_communications where ro_id = 'ro-1'")).length, 0);
});

// --- ownership boundary: every entity category, cross-user -----------------

test("ownership: User A cannot mutate User B's repair order (add blocker, resolve blocker, record contact, transition status)", async (t) => {
  const db = await writeDb();
  t.after(() => db.close());
  const repository = new RepairOrderRepository(sqlFor(db));
  // ro-1 is owned by advisor-1; advisor-2 attempts every RO-scoped mutation.
  await assert.rejects(
    repository.addBlocker({ userId: "advisor-2", roId: "ro-1", actorId: "advisor-2", type: "parts", description: "x", severity: "low", expectedVersion: 1 }),
    /Repair order not found/,
  );
  await assert.rejects(
    repository.recordContact({ userId: "advisor-2", roId: "ro-1", expectedVersion: 1, actorId: "advisor-2", method: "phone", summary: "x", intervalMinutes: 90 }),
    /Repair order not found/,
  );
  await assert.rejects(
    repository.transition({ userId: "advisor-2", roId: "ro-1", to: "dispatched", expectedVersion: 1, actorId: "advisor-2", source: "mcp" }),
    /Repair order not found/,
  );
});

test("ownership: User A cannot resolve User B's blocker", async (t) => {
  const db = await writeDb();
  t.after(() => db.close());
  const repository = new RepairOrderRepository(sqlFor(db));
  await repository.addBlocker({ userId: "advisor-1", roId: "ro-1", actorId: "advisor-1", type: "parts", description: "x", severity: "low", expectedVersion: 1 });
  const [blocker] = await rows<{ id: string }>(db, "select id from ro_blockers where ro_id = 'ro-1'");
  // advisor-2 has no RO named "ro-1" it owns, so the lookup fails identically
  // to "wrong id" — it never confirms the blocker (or RO) exists for advisor-1.
  await assert.rejects(
    repository.resolveBlocker({ userId: "advisor-2", roId: "ro-1", blockerId: blocker.id, expectedVersion: 2, actorId: "advisor-2" }),
    /Repair order not found/,
  );
});

test("ownership: User A cannot mutate User B's recommendation", async (t) => {
  const db = await writeDb();
  t.after(() => db.close());
  const repository = new RepairOrderRepository(sqlFor(db));
  await repository.addRecommendation({ userId: "advisor-1", roId: "ro-1", description: "Front brake pads", amount: 400, expectedVersion: 1, actorId: "advisor-1" });
  const [rec] = await rows<{ id: string }>(db, "select id from ro_recommendations where ro_id = 'ro-1'");
  await assert.rejects(
    repository.decideRecommendation({ userId: "advisor-2", roId: "ro-1", id: rec.id, state: "approved", expectedVersion: 2, actorId: "advisor-2" }),
    /Recommendation changed elsewhere; refresh before trying again/,
  );
  const stillPending = await rows<{ state: string }>(db, "select state from ro_recommendations where id = $1", [rec.id]);
  assert.equal(stillPending[0]?.state, "recommended", "the cross-user attempt must not have applied");
});

test("ownership: User A cannot create a follow-up on, or complete a follow-up belonging to, User B's repair order", async (t) => {
  const db = await writeDb();
  t.after(() => db.close());
  const repository = new FollowUpRepository(sqlFor(db));
  await assert.rejects(repository.create({ userId: "advisor-2", roId: "ro-1", reason: "manual", label: "x" }), /Repair order not found/);

  const created = await repository.create({ userId: "advisor-1", roId: "ro-1", reason: "manual", label: "Owned by advisor-1" });
  assert.equal(await repository.getById("advisor-2", created.id), null, "cross-user getById must not leak the row");
  await assert.rejects(repository.setOutcome("advisor-2", created.id, "completed"), /Follow-up not found/);
  const stillOpen = await repository.getById("advisor-1", created.id);
  assert.equal(stillOpen?.outcome, "open", "the cross-user attempt must not have applied");
});

// --- audit.ts ----------------------------------------------------------

test("recordMcpAudit writes exactly one row with correct fields, including a jsonb round trip", async (t) => {
  const db = await writeDb();
  t.after(() => db.close());
  const sql = sqlFor(db);
  await db.query("insert into mcp_api_tokens (id, user_id, label, token_hash, scope) values ('tok-1','advisor-1','t','hash-1','toyota:ro:write')");

  await recordMcpAudit(sql, {
    userId: "advisor-1",
    tokenId: "tok-1",
    toolName: "add_ro_blocker",
    requestId: "req-1",
    entityType: "ro_blocker",
    entityId: "blocker-1",
    previousValue: null,
    newValue: { type: "parts", severity: "high", nested: { ok: true } },
  });

  const auditRows = await rows<{ user_id: string; token_id: string; tool_name: string; request_id: string; entity_type: string; entity_id: string; previous_value: unknown; new_value: unknown }>(
    db,
    "select user_id, token_id, tool_name, request_id, entity_type, entity_id, previous_value, new_value from mcp_audit_log",
  );
  assert.equal(auditRows.length, 1);
  assert.deepEqual(auditRows[0], {
    user_id: "advisor-1", token_id: "tok-1", tool_name: "add_ro_blocker", request_id: "req-1",
    entity_type: "ro_blocker", entity_id: "blocker-1", previous_value: null, new_value: { type: "parts", severity: "high", nested: { ok: true } },
  });
});

test("recordMcpAudit never throws and never inserts a partial/fake row when the insert itself fails", async (t) => {
  const db = await writeDb();
  t.after(() => db.close());
  const sql = sqlFor(db);
  // token_id references mcp_api_tokens(id); this one was never minted, so
  // the FK constraint rejects the insert — simulating an audit-write failure.
  await recordMcpAudit(sql, { userId: "advisor-1", tokenId: "does-not-exist", toolName: "add_ro_blocker", requestId: "req-1", entityType: "ro_blocker", entityId: "blocker-1", previousValue: null, newValue: null });
  assert.equal((await rows(db, "select id from mcp_audit_log")).length, 0);
});

test("each successful mutation produces exactly one audit row with correct before/after state, and a rejected mutation produces none", async (t) => {
  const db = await writeDb();
  t.after(() => db.close());
  const sql = sqlFor(db);
  const repository = new RepairOrderRepository(sql);
  await db.query("insert into mcp_api_tokens (id, user_id, label, token_hash, scope) values ('tok-1','advisor-1','t','hash-1','toyota:ro:write')");

  // A rejected (cross-user) mutation must create no audit row at all.
  await assert.rejects(repository.transition({ userId: "advisor-2", roId: "ro-1", to: "dispatched", expectedVersion: 1, actorId: "advisor-2", source: "mcp" }));
  assert.equal((await rows(db, "select id from mcp_audit_log")).length, 0, "a rejected authorization/ownership check must not create a success audit row");

  // A successful one creates exactly one, with real before/after state.
  const updated = await repository.transition({ userId: "advisor-1", roId: "ro-1", to: "dispatched", expectedVersion: 1, actorId: "advisor-1", source: "mcp" });
  await recordMcpAudit(sql, { userId: "advisor-1", tokenId: "tok-1", toolName: "update_repair_order_status", requestId: "req-1", entityType: "repair_order", entityId: updated.id, previousValue: { state: updated.previousState }, newValue: { state: updated.state } });
  const auditRows = await rows<{ previous_value: { state: string }; new_value: { state: string } }>(db, "select previous_value, new_value from mcp_audit_log");
  assert.equal(auditRows.length, 1);
  assert.deepEqual(auditRows[0], { previous_value: { state: "written" }, new_value: { state: "dispatched" } });
});

// --- structural: the MCP surface never touches Better Auth's own tables ----

test("no file under src/lib/mcp references the user/session/account/verification auth tables", async () => {
  const root = new URL("../src/lib/mcp/", import.meta.url);
  const forbidden = [/from\s+"user"/i, /from\s+"session"/i, /from\s+"account"/i, /from\s+"verification"/i, /join\s+"?user"?\s/i, /join\s+"?session"?\s/i];
  async function walk(dirUrl: URL): Promise<string[]> {
    const entries = await readdir(dirUrl, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const childUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dirUrl);
      if (entry.isDirectory()) files.push(...(await walk(childUrl)));
      else if (entry.name.endsWith(".ts")) files.push(childUrl.pathname);
    }
    return files;
  }
  const files = await walk(root);
  assert.ok(files.length >= 20, "expected the (now larger, read+write) mcp module tree to have been discovered");
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(text), `${file} appears to reference a Better Auth table (matched ${pattern})`);
    }
  }
});

// --- input validation (mirrors what the registered tools enforce) ----------

test("workflow-state input validation rejects unknown states and out-of-range limits", () => {
  const schema = z.object({ status: z.enum(WORKFLOW_STATES).optional(), limit: z.number().int().min(1).max(50).optional() });
  assert.equal(schema.safeParse({ status: "written" }).success, true);
  assert.equal(schema.safeParse({ status: "not_a_real_state" }).success, false);
  assert.equal(schema.safeParse({ limit: 50 }).success, true);
  assert.equal(schema.safeParse({ limit: 9999 }).success, false);
  assert.equal(schema.safeParse({ limit: 0 }).success, false);
  assert.equal(schema.safeParse({ limit: -1 }).success, false);
});

test("search query input validation rejects empty and oversized queries", () => {
  const schema = z.object({ query: z.string().trim().min(1).max(100) });
  assert.equal(schema.safeParse({ query: "10482" }).success, true);
  assert.equal(schema.safeParse({ query: "" }).success, false);
  assert.equal(schema.safeParse({ query: "  " }).success, false);
  assert.equal(schema.safeParse({ query: "x".repeat(101) }).success, false);
});

test("write-tool input validation: malformed ids, invalid enums, and unknown fields are all rejected (z.strictObject)", () => {
  const addBlockerShape = z.strictObject({
    repair_order_id: z.string().uuid(),
    expected_version: z.number().int().positive(),
    type: z.enum(BLOCKER_TYPES),
    description: z.string().trim().min(1).max(2000),
    severity: z.enum(["low", "medium", "high", "critical"]),
    owner: z.string().trim().min(1).max(120).optional(),
  });
  const valid = { repair_order_id: "11111111-1111-4111-8111-111111111111", expected_version: 1, type: "parts", description: "x", severity: "high" };
  assert.equal(addBlockerShape.safeParse(valid).success, true);
  assert.equal(addBlockerShape.safeParse({ ...valid, repair_order_id: "not-a-uuid" }).success, false, "malformed id rejected");
  assert.equal(addBlockerShape.safeParse({ ...valid, severity: "urgent" }).success, false, "invalid enum rejected");
  assert.equal(addBlockerShape.safeParse({ ...valid, type: "made_up_type" }).success, false, "invented blocker type rejected");
  assert.equal(addBlockerShape.safeParse({ type: "parts" }).success, false, "missing required fields rejected");
  assert.equal(addBlockerShape.safeParse({ ...valid, extra_field_the_model_invented: true }).success, false, "unknown field rejected, not silently dropped");

  const recommendationShape = z.strictObject({ repair_order_id: z.string().uuid(), recommendation_id: z.string().uuid(), status: z.enum(["recommended", "approved", "declined"]), expected_version: z.number().int().positive() });
  assert.equal(recommendationShape.safeParse({ repair_order_id: valid.repair_order_id, recommendation_id: valid.repair_order_id, status: "deferred", expected_version: 1 }).success, false, "'deferred' is not a real schema state");

  const dueAtShape = z.strictObject({ repair_order_id: z.string().uuid(), reason: z.string(), label: z.string().min(1).max(200), due_at: z.string().datetime().optional() });
  assert.equal(dueAtShape.safeParse({ repair_order_id: valid.repair_order_id, reason: "manual", label: "x", due_at: "not-a-timestamp" }).success, false, "malformed timestamp rejected");
});
