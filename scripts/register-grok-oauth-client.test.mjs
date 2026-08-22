import assert from "node:assert/strict";
import test from "node:test";
import {
  GROK_CLIENT_ID,
  GROK_REDIRECT_URI,
  GROK_SCOPES,
  MCP_RESOURCE,
  buildClientRecord,
} from "./register-grok-oauth-client.mjs";

test("Grok operator registration is a fixed read-only public PKCE client", () => {
  const client = buildClientRecord();
  assert.equal(client.clientId, GROK_CLIENT_ID);
  assert.equal(client.clientSecret, null);
  assert.deepEqual(client.redirectUris, [GROK_REDIRECT_URI]);
  assert.deepEqual(client.scopes, GROK_SCOPES);
  assert.deepEqual(client.grantTypes, ["authorization_code"]);
  assert.deepEqual(client.responseTypes, ["code"]);
  assert.equal(client.tokenEndpointAuthMethod, "none");
  assert.equal(client.requirePKCE, true);
  assert.equal(client.metadata.resource, MCP_RESOURCE);
});

test("Grok operator registration rejects a non-Grok redirect URI", () => {
  const client = buildClientRecord();
  assert.deepEqual(client.redirectUris, ["https://grok.com/connectors-oauth-exchange-code/"]);
  assert.notEqual(client.redirectUris[0], "https://example.invalid/callback");
});

test("Grok operator registration rejects malformed client IDs", () => {
  assert.throws(() => buildClientRecord({ clientId: "grok client" }), /client id/);
});
