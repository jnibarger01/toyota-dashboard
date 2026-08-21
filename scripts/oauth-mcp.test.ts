import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { authenticateOAuthClaims } from "../src/lib/mcp/oauth.ts";
import { checkScope } from "../src/lib/mcp/tool-helpers.ts";

const RESOURCE = "https://toyota.example.test/api/mcp";
const USER_ID = "11111111-1111-4111-8111-111111111111";

function sqlFor(db: PGlite) {
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0] ?? "";
    values.forEach((_, index) => { text += `$${index + 1}${strings[index + 1] ?? ""}`; });
    return (await db.query<T>(text, values)).rows;
  }) as any;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
  return sql;
}

async function authDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.waitReady;
  await db.exec('create table "user" (id text primary key, name text not null, email text not null, "emailVerified" boolean not null, "createdAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now())');
  await db.query('insert into "user" (id,name,email,"emailVerified") values ($1,$2,$3,true)', [USER_ID, "OAuth User", "oauth@example.invalid"]);
  return db;
}

test("OAuth claims map subject to the existing Better Auth user and preserve scopes", async (t) => {
  const db = await authDb(); t.after(() => db.close());
  const context = await authenticateOAuthClaims({ sub: USER_ID, aud: RESOURCE, jti: "token-1", iat: 100, scope: "openid toyota:read toyota:ro:write" }, sqlFor(db), RESOURCE);
  assert.equal(context.userId, USER_ID);
  assert.equal(context.tokenId, "oauth:token-1");
  assert.deepEqual(context.scopes, ["openid", "toyota:read", "toyota:ro:write"]);
});

test("OAuth claims reject a wrong resource audience", async (t) => {
  const db = await authDb(); t.after(() => db.close());
  await assert.rejects(authenticateOAuthClaims({ sub: USER_ID, aud: "https://wrong.example.test/mcp", scope: "toyota:read" }, sqlFor(db), RESOURCE), /wrong resource audience/);
});

test("OAuth claims reject a missing or unknown subject", async (t) => {
  const db = await authDb(); t.after(() => db.close());
  await assert.rejects(authenticateOAuthClaims({ aud: RESOURCE, scope: "toyota:read" }, sqlFor(db), RESOURCE), /valid subject/);
  await assert.rejects(authenticateOAuthClaims({ sub: "not-a-user", aud: RESOURCE, scope: "toyota:read" }, sqlFor(db), RESOURCE), /not a Toyota Dashboard user/);
});

test("OAuth scope enforcement fails closed when a category scope is absent", () => {
  const denied = checkScope({ http: { authInfo: { scopes: ["toyota:read"] } } }, "toyota:ro:write");
  assert.equal(denied?.isError, true);
});
