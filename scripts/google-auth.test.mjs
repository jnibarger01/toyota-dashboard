import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getGoogleSocialProviderConfig } from "../src/lib/auth/google.ts";
import { currentAuthReturnURL, pendingOAuthAuthorizationURL } from "../src/lib/auth/oauth-return.ts";

const root = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("Google provider requires both server-side credentials", () => {
  assert.equal(getGoogleSocialProviderConfig({ GOOGLE_CLIENT_ID: "id" }), null);
  assert.equal(getGoogleSocialProviderConfig({ GOOGLE_CLIENT_SECRET: "secret" }), null);
  assert.deepEqual(
    getGoogleSocialProviderConfig({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }),
    { clientId: "id", clientSecret: "secret", prompt: "select_account" },
  );
});

test("Google credentials are not present in browser auth modules", async () => {
  const [client, login] = await Promise.all([read("src/lib/auth/client.ts"), read("src/routes/login.tsx")]);
  assert.doesNotMatch(client, /GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_ID/);
  assert.doesNotMatch(login, /GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_ID/);
});

test("login exposes Google social sign-in and preserves the pending OAuth URL", async () => {
  const login = await read("src/routes/login.tsx");
  assert.match(login, /Continue with Google/);
  assert.match(login, /signIn\.social/);
  assert.match(login, /provider: "google"/);
  assert.match(login, /pendingOAuthAuthorizationURL/);
  assert.match(login, /oauth_query/);
  assert.match(await read("src/lib/auth/oauth-return.ts"), /api\/auth\/oauth2\/authorize/);
});

test("pending OAuth authorization context round-trips through login", () => {
  const search = "?client_id=grok-toyota-dashboard-public&redirect_uri=https%3A%2F%2Fgrok.com%2Fconnectors-oauth-exchange-code%2F&scope=openid+profile+toyota%3Aread";
  assert.equal(currentAuthReturnURL({ pathname: "/login", search, hash: "" }), `/login${search}`);
  assert.equal(pendingOAuthAuthorizationURL(search), `/api/auth/oauth2/authorize${search}`);
  assert.equal(pendingOAuthAuthorizationURL("?foo=bar"), null);
});

test("Toyota OAuth security contract remains unchanged", async () => {
  const [server, clientScript] = await Promise.all([read("src/lib/auth/server.ts"), read("scripts/register-grok-oauth-client.mjs")]);
  assert.match(server, /allowDynamicClientRegistration: false/);
  assert.match(server, /allowUnauthenticatedClientRegistration: false/);
  assert.match(server, /code_challenge_methods_supported|mcp\(/);
  assert.match(clientScript, /grok-toyota-dashboard-public/);
  assert.match(clientScript, /connectors-oauth-exchange-code/);
  assert.match(clientScript, /openid.*profile.*toyota:read/s);
});
