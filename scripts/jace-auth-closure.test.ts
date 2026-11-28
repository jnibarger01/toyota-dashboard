import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  JACE_CALLBACK_PATH,
  JACE_PROVIDER_ID,
  buildJaceEndSessionUrl,
  getJaceAuthConfig,
  getMcpAuthorizationServers,
  peekUnverifiedJwtIssuer,
  sanitizePostLogoutPath,
  shouldUseJaceMcpVerifier,
} from "../src/lib/auth/jace.ts";
import { resolveJaceEndSessionUrl } from "../src/lib/auth/jace-logout.server.ts";
import { authenticateOAuthClaims } from "../src/lib/mcp/oauth.ts";

const root = new URL("../", import.meta.url);
const read = (relative: string) => readFile(new URL(relative, root), "utf8");

function makeFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "at+jwt" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

function sqlFor(db: PGlite) {
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0] ?? "";
    values.forEach((_, index) => {
      text += `$${index + 1}${strings[index + 1] ?? ""}`;
    });
    return (await db.query<T>(text, values)).rows;
  }) as any;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    (await db.query<T>(text, params)).rows;
  return sql;
}

async function authAccountDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.waitReady;
  await db.exec(await read("migrations/0001_auth.sql"));
  return db;
}

// ── 1. Redirect URI alignment & config ───────────────────────────────────────

test("Jace Auth config aligns callback path, JWKS, end-session, resources, and rollback flag", () => {
  assert.equal(JACE_CALLBACK_PATH, "/api/auth/callback/jace");
  assert.equal(JACE_PROVIDER_ID, "jace");

  const cfg = getJaceAuthConfig({
    JACE_AUTH_ISSUER: "https://jace-auth.vercel.app/",
    JACE_AUTH_CLIENT_ID: "toyota-dashboard",
    JACE_AUTH_CLIENT_SECRET: "test-secret-value-at-least-24-chars",
  });
  assert.deepEqual(cfg, {
    providerId: "jace",
    callbackPath: "/api/auth/callback/jace",
    issuer: "https://jace-auth.vercel.app",
    jwksUrl: "https://jace-auth.vercel.app/jwks",
    endSessionEndpoint: "https://jace-auth.vercel.app/oauth2/end-session",
    clientId: "toyota-dashboard",
    clientSecret: "test-secret-value-at-least-24-chars",
    resource: "https://jace-auth.vercel.app/resources/toyota-dashboard",
    mcpResource: "https://jace-auth.vercel.app/resources/toyota-mcp",
  });

  const customCfg = getJaceAuthConfig({
    JACE_AUTH_ISSUER: "https://jace-auth.vercel.app",
    JACE_AUTH_CLIENT_ID: "toyota-dashboard",
    JACE_AUTH_CLIENT_SECRET: "test-secret-value-at-least-24-chars",
    JACE_AUTH_RESOURCE: "https://toyota.example.test",
    JACE_AUTH_MCP_RESOURCE: "https://toyota.example.test/api/mcp",
  });
  assert.equal(customCfg?.resource, "https://toyota.example.test");
  assert.equal(customCfg?.mcpResource, "https://toyota.example.test/api/mcp");

  // Explicit rollback flag disables jace-auth even when credentials exist.
  assert.equal(
    getJaceAuthConfig({
      JACE_AUTH_ENABLED: "false",
      JACE_AUTH_ISSUER: "https://jace-auth.vercel.app",
      JACE_AUTH_CLIENT_ID: "toyota-dashboard",
      JACE_AUTH_CLIENT_SECRET: "test-secret-value-at-least-24-chars",
    }),
    null,
  );
  // Missing credentials or non-http(s) issuer disables jace-auth.
  assert.equal(getJaceAuthConfig({ JACE_AUTH_ISSUER: "https://jace-auth.vercel.app" }), null);
  assert.equal(
    getJaceAuthConfig({
      JACE_AUTH_ISSUER: "ftp://jace-auth.vercel.app",
      JACE_AUTH_CLIENT_ID: "toyota-dashboard",
      JACE_AUTH_CLIENT_SECRET: "test-secret-value-at-least-24-chars",
    }),
    null,
  );
});

test("redirect URI path /api/auth/callback/jace is consistent across code, env template, and docs", async () => {
  const [server, jace, envExample, doc] = await Promise.all([
    read("src/lib/auth/server.ts"),
    read("src/lib/auth/jace.ts"),
    read(".env.example"),
    read("docs/jace-auth-signin.md"),
  ]);
  for (const [name, content] of [
    ["src/lib/auth/server.ts", server],
    ["src/lib/auth/jace.ts", jace],
    [".env.example", envExample],
    ["docs/jace-auth-signin.md", doc],
  ] as const) {
    assert.doesNotMatch(content, /\/api\/auth\/oauth2\/callback\/jace/, `${name} must not contain stale /oauth2/ callback path`);
    assert.match(content, /\/api\/auth\/callback\/jace/, `${name} must document /api/auth/callback/jace`);
    assert.match(content, /JACE_CLIENT_TOYOTA_DASHBOARD_REDIRECT_URIS/, `${name} must reference JACE_CLIENT_TOYOTA_DASHBOARD_REDIRECT_URIS`);
  }
});

// ── 2. Session cookieCache disabled ──────────────────────────────────────────

test("session.cookieCache is disabled in src/lib/auth/server.ts for immediate sign-out invalidation", async () => {
  const server = await read("src/lib/auth/server.ts");
  assert.match(server, /cookieCache:\s*\{\s*enabled:\s*false\s*\}/);
  assert.doesNotMatch(server, /cookieCache:\s*\{\s*enabled:\s*true/);
});

// ── 3. RP-initiated logout ───────────────────────────────────────────────────

test("post-logout path sanitization blocks open redirects and builds valid end-session URLs", () => {
  assert.equal(sanitizePostLogoutPath("/"), "/");
  assert.equal(sanitizePostLogoutPath("/login?signedOut=1"), "/login?signedOut=1");
  assert.equal(sanitizePostLogoutPath("https://evil.example/phish"), "/");
  assert.equal(sanitizePostLogoutPath("//evil.example/phish"), "/");
  assert.equal(sanitizePostLogoutPath("/\\evil.example/phish"), "/");
  assert.equal(sanitizePostLogoutPath("/\t/evil.example/phish"), "/");
  assert.equal(sanitizePostLogoutPath("/\n/evil.example/phish"), "/");
  assert.equal(sanitizePostLogoutPath("javascript:alert(1)"), "/");
  assert.equal(sanitizePostLogoutPath(undefined), "/");

  const url = buildJaceEndSessionUrl({
    issuer: "https://jace-auth.vercel.app/",
    clientId: "toyota-dashboard",
    postLogoutRedirectUri: "https://toyota.example.test/",
    idTokenHint: "id-token-jwt",
  });
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://jace-auth.vercel.app");
  assert.equal(parsed.pathname, "/oauth2/end-session");
  assert.equal(parsed.searchParams.get("client_id"), "toyota-dashboard");
  assert.equal(parsed.searchParams.get("post_logout_redirect_uri"), "https://toyota.example.test/");
  assert.equal(parsed.searchParams.get("id_token_hint"), "id-token-jwt");
});

test("resolveJaceEndSessionUrl redirects jace-authenticated users while preserving Google and local sign-out", async (t) => {
  const db = await authAccountDb();
  t.after(() => db.close());
  const sql = sqlFor(db);

  const jaceConfig = {
    issuer: "http://localhost:8811",
    clientId: "toyota-dashboard",
    providerId: "jace" as const,
  };

  // Provision 4 users: jace-only, google-only, local-credential-only, and dual-linked.
  for (const [id, email] of [
    ["u-jace", "jace@example.test"],
    ["u-google", "google@example.test"],
    ["u-local", "local@example.test"],
    ["u-dual", "dual@example.test"],
  ]) {
    await db.query(
      'insert into "user" ("id", "name", "email", "emailVerified") values ($1, $2, $3, true)',
      [id, id, email],
    );
  }
  await db.query(
    'insert into "account" ("id", "accountId", "providerId", "userId", "idToken", "updatedAt") values ($1, $2, $3, $4, $5, $6)',
    ["a-jace", "jace-sub-1", "jace", "u-jace", "jace-id-token-1", "2026-11-26T10:00:00Z"],
  );
  await db.query(
    'insert into "account" ("id", "accountId", "providerId", "userId", "idToken", "updatedAt") values ($1, $2, $3, $4, $5, $6)',
    ["a-google", "google-sub-1", "google", "u-google", "google-id-token-1", "2026-11-26T10:00:00Z"],
  );
  await db.query(
    'insert into "account" ("id", "accountId", "providerId", "userId", "password", "updatedAt") values ($1, $2, $3, $4, $5, $6)',
    ["a-local", "u-local", "credential", "u-local", "hashed-pw", "2026-11-26T10:00:00Z"],
  );
  // Dual-linked user signed in via Google more recently than Jace.
  await db.query(
    'insert into "account" ("id", "accountId", "providerId", "userId", "idToken", "updatedAt") values ($1, $2, $3, $4, $5, $6)',
    ["a-dual-jace", "jace-sub-2", "jace", "u-dual", "jace-id-token-2", "2026-11-26T09:00:00Z"],
  );
  await db.query(
    'insert into "account" ("id", "accountId", "providerId", "userId", "idToken", "updatedAt") values ($1, $2, $3, $4, $5, $6)',
    ["a-dual-google", "google-sub-2", "google", "u-dual", "google-id-token-2", "2026-11-26T11:00:00Z"],
  );

  // Jace-authenticated user gets RP-initiated logout URL with id_token_hint.
  const jaceLogout = await resolveJaceEndSessionUrl({
    jaceConfig,
    userId: "u-jace",
    origin: "http://localhost:8080",
    redirectTo: "/",
    sql,
  });
  assert.ok(jaceLogout);
  const parsed = new URL(jaceLogout);
  assert.equal(parsed.origin, "http://localhost:8811");
  assert.equal(parsed.pathname, "/oauth2/end-session");
  assert.equal(parsed.searchParams.get("client_id"), "toyota-dashboard");
  assert.equal(parsed.searchParams.get("post_logout_redirect_uri"), "http://localhost:8080/");
  assert.equal(parsed.searchParams.get("id_token_hint"), "jace-id-token-1");

  // Google-only and local-only users stay on local sign-out.
  assert.equal(
    await resolveJaceEndSessionUrl({ jaceConfig, userId: "u-google", origin: "http://localhost:8080", sql }),
    null,
  );
  assert.equal(
    await resolveJaceEndSessionUrl({ jaceConfig, userId: "u-local", origin: "http://localhost:8080", sql }),
    null,
  );

  // Dual-linked user whose latest sign-in was Google stays on local sign-out.
  assert.equal(
    await resolveJaceEndSessionUrl({ jaceConfig, userId: "u-dual", origin: "http://localhost:8080", sql }),
    null,
  );

  // Once dual-linked user signs in via Jace more recently, RP-initiated logout activates.
  await db.query('update "account" set "updatedAt" = $1 where "id" = $2', ["2026-11-26T12:00:00Z", "a-dual-jace"]);
  const dualJaceLogout = await resolveJaceEndSessionUrl({
    jaceConfig,
    userId: "u-dual",
    origin: "http://localhost:8080",
    redirectTo: "https://evil.example/steal",
    sql,
  });
  assert.ok(dualJaceLogout);
  assert.equal(new URL(dualJaceLogout).searchParams.get("post_logout_redirect_uri"), "http://localhost:8080/");

  // Rollback (jaceConfig = null) disables central logout.
  assert.equal(
    await resolveJaceEndSessionUrl({ jaceConfig: null, userId: "u-jace", origin: "http://localhost:8080", sql }),
    null,
  );
});

test("client signOut and /api/auth/$ route wire RP-initiated logout safely", async () => {
  const [client, authRoute] = await Promise.all([
    read("src/lib/auth/client.ts"),
    read("src/routes/api/auth/$.ts"),
  ]);
  assert.match(client, /\/api\/auth\/jace-logout/);
  assert.match(client, /await authClient\.signOut\(\)/);
  assert.match(client, /endSessionUrl \?\? redirectTo/);
  assert.match(authRoute, /\/api\/auth\/jace-logout/);
  assert.match(authRoute, /resolveJaceEndSessionUrl/);
});

// ── 4. MCP issuer validation ─────────────────────────────────────────────────

test("MCP protected-resource metadata and bearer issuer selector support jace-auth alongside local issuer", () => {
  const localIssuer = "https://toyota.example.test/api/auth";
  const resource = "https://toyota.example.test/api/mcp";
  const jaceCfg = { issuer: "https://jace-auth.vercel.app", mcpResource: resource };

  assert.deepEqual(getMcpAuthorizationServers(localIssuer, null, resource), [localIssuer]);
  assert.deepEqual(getMcpAuthorizationServers(localIssuer, jaceCfg, resource), [
    "https://jace-auth.vercel.app",
    localIssuer,
  ]);
  assert.deepEqual(getMcpAuthorizationServers(jaceCfg.issuer, jaceCfg, resource), [jaceCfg.issuer]);

  assert.deepEqual(getMcpAuthorizationServers(localIssuer, { ...jaceCfg, mcpResource: "https://different.example/mcp" }, resource), [localIssuer]);

  const jaceJwt = `Bearer ${makeFakeJwt({ iss: "https://jace-auth.vercel.app", sub: "u1" })}`;
  const localJwt = `Bearer ${makeFakeJwt({ iss: localIssuer, sub: "u1" })}`;
  const evilJwt = `Bearer ${makeFakeJwt({ iss: "https://evil.example", sub: "u1" })}`;

  assert.equal(peekUnverifiedJwtIssuer(jaceJwt), "https://jace-auth.vercel.app");
  assert.equal(peekUnverifiedJwtIssuer("Bearer toyota_mcp_static_token"), null);
  assert.equal(peekUnverifiedJwtIssuer("Bearer not-a-jwt"), null);
  assert.equal(peekUnverifiedJwtIssuer(null), null);

  assert.equal(shouldUseJaceMcpVerifier(jaceJwt, jaceCfg), true);
  assert.equal(shouldUseJaceMcpVerifier(localJwt, jaceCfg), false);
  assert.equal(shouldUseJaceMcpVerifier(evilJwt, jaceCfg), false);
  assert.equal(shouldUseJaceMcpVerifier(jaceJwt, null), false);
});

test("authenticateOAuthClaims resolves linked jace-auth subjects without weakening local issuer isolation", async (t) => {
  const db = await authAccountDb();
  t.after(() => db.close());
  const sql = sqlFor(db);

  const localUserId = "local-user-1";
  const jaceSub = "jace-upstream-sub-42";
  const jaceMcpResource = "https://jace-auth.vercel.app/resources/toyota-mcp";
  const localMcpResource = "https://toyota.example.test/api/mcp";

  await db.query(
    'insert into "user" ("id", "name", "email", "emailVerified") values ($1, $2, $3, true)',
    [localUserId, "Advisor", "advisor@example.test"],
  );
  await db.query(
    'insert into "account" ("id", "accountId", "providerId", "userId", "updatedAt") values ($1, $2, $3, $4, now())',
    ["acct-jace-1", jaceSub, "jace", localUserId],
  );

  // Jace Auth MCP token resolves upstream sub via linked jace account to local userId.
  const jaceCtx = await authenticateOAuthClaims(
    { sub: jaceSub, aud: jaceMcpResource, jti: "jace-jti-1", scope: "toyota:read toyota:ro:write" },
    sql,
    jaceMcpResource,
    { providerId: "jace" },
  );
  assert.equal(jaceCtx.userId, localUserId);
  assert.equal(jaceCtx.tokenId, "oauth:jace-jti-1");
  assert.deepEqual(jaceCtx.scopes, ["toyota:read", "toyota:ro:write"]);

  // Jace Auth token must NOT match raw local user.id when no jace account link exists.
  await assert.rejects(
    authenticateOAuthClaims(
      { sub: localUserId, aud: jaceMcpResource, jti: "jace-jti-2", scope: "toyota:read" },
      sql,
      jaceMcpResource,
      { providerId: "jace" },
    ),
    /not a Toyota Dashboard user/,
  );

  // Jace Auth token with wrong audience (dashboard instead of mcp) is rejected.
  await assert.rejects(
    authenticateOAuthClaims(
      { sub: jaceSub, aud: "https://jace-auth.vercel.app/resources/toyota-dashboard", scope: "toyota:read" },
      sql,
      jaceMcpResource,
      { providerId: "jace" },
    ),
    /wrong resource audience/,
  );

  // Existing local issuer token still resolves directly via local user.id.
  const localCtx = await authenticateOAuthClaims(
    { sub: localUserId, aud: localMcpResource, jti: "local-jti-1", scope: "toyota:read" },
    sql,
    localMcpResource,
  );
  assert.equal(localCtx.userId, localUserId);
  assert.equal(localCtx.tokenId, "oauth:local-jti-1");
});

test("MCP route and protected-resource metadata route wire jace-auth alongside local issuer", async () => {
  const [mcpRoute, metaRoute] = await Promise.all([
    read("src/routes/api/mcp.ts"),
    read("src/routes/$.ts"),
  ]);
  assert.match(mcpRoute, /jaceOAuthMcpHandler/);
  assert.match(mcpRoute, /shouldUseJaceMcpVerifier/);
  assert.match(mcpRoute, /localOAuthMcpHandler/);
  assert.match(mcpRoute, /jwksUrl/);
  assert.match(mcpRoute, /providerId/);
  assert.match(metaRoute, /getMcpAuthorizationServers\(authIssuerURL,\s*jaceOAuth,\s*mcpResourceURL\)/);
});
