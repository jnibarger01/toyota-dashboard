import assert from "node:assert/strict";
import test from "node:test";
import { assertProductionConfiguration } from "../src/lib/runtime-policy.ts";

test("production requires a database and enabled authentication", () => {
  assert.throws(
    () => assertProductionConfiguration({ production: true, staticDemo: false, databaseUrl: "", authEnabled: true }),
    /DATABASE_URL is required/,
  );
  assert.throws(
    () => assertProductionConfiguration({ production: true, staticDemo: false, databaseUrl: "postgres://db", authEnabled: false }),
    /authentication must remain enabled/,
  );
});

test("static demo is allowed to omit production services", () => {
  assert.doesNotThrow(() =>
    assertProductionConfiguration({ production: true, staticDemo: true, databaseUrl: "", authEnabled: false }),
  );
});
