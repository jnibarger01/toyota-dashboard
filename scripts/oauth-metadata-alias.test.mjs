import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../src/routes/$.ts", import.meta.url), "utf8");

test("issuer-derived OAuth metadata path forwards to canonical Better Auth metadata", () => {
  assert.ok(route.includes('issuerDerivedMetadataPath = "/.well-known/oauth-authorization-server/api/auth"'));
  assert.ok(route.includes('canonicalMetadataPath = "/api/auth/.well-known/oauth-authorization-server"'));
  assert.ok(route.includes("canonicalURL.pathname = canonicalMetadataPath"));
  assert.ok(route.includes("auth.handler(new Request(canonicalURL, request))"));
});
