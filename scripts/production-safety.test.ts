import assert from "node:assert/strict";
import test from "node:test";
import { assertProductionConfiguration } from "../src/lib/runtime-policy.ts";

test("production requires managed Postgres, enabled authentication, and auth deployment settings", () => {
  assert.throws(
    () => assertProductionConfiguration({ production: true, staticDemo: false, databaseUrl: "", authEnabled: true }),
    /DATABASE_URL is required/,
  );
  assert.throws(
    () => assertProductionConfiguration({ production: true, staticDemo: false, databaseUrl: "postgres://db", authEnabled: false }),
    /authentication must remain enabled/,
  );
  assert.throws(
    () =>
      assertProductionConfiguration({
        production: true,
        staticDemo: false,
        databaseUrl: "postgres://db",
        authEnabled: true,
        authSecret: "",
        authUrl: "",
      }),
    /BETTER_AUTH_SECRET is required/,
  );
  assert.throws(
    () =>
      assertProductionConfiguration({
        production: true,
        staticDemo: false,
        databaseUrl: "postgres://db",
        authEnabled: true,
        authSecret: "configured-secret",
        authUrl: "",
      }),
    /BETTER_AUTH_URL is required/,
  );
  assert.doesNotThrow(() =>
    assertProductionConfiguration({
      production: true,
      staticDemo: false,
      databaseUrl: "postgres://db",
      authEnabled: true,
      authSecret: "configured-secret",
      authUrl: "https://dashboard.example.com",
    }),
  );
});

test("static demo is allowed to omit production services", () => {
  assert.doesNotThrow(() =>
    assertProductionConfiguration({ production: true, staticDemo: true, databaseUrl: "", authEnabled: false }),
  );
});
