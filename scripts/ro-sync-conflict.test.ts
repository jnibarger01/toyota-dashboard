import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

async function conflictRecord(db: PGlite, id: string, source = "xtime") {
  await db.query("insert into service_customers (id, user_id, full_name) values ($1, 'advisor-1', 'Taylor')", [`customer-${id}`]);
  await db.query("insert into service_vehicles (id, user_id, customer_id, model) values ($1, 'advisor-1', $2, 'Camry')", [`vehicle-${id}`, `customer-${id}`]);
  await db.query("insert into repair_orders (id, user_id, ro_number, customer_id, vehicle_id, source_system, external_id, workflow_state, sync_status, sync_error, conflict_state, version) values ($1, 'advisor-1', $2, $3, $4, $5, 'external-7', 'written', 'conflict', 'Source changed after local edit', 'source_newer', 3)", [id, `RO-${id}`, `customer-${id}`, `vehicle-${id}`, source]);
}

test("sync conflict resolution retains local data with an optimistic version check", async (t) => {
  const db = new PGlite();
  t.after(async () => db.close());
  await db.waitReady;
  await db.exec(await readFile(new URL("../migrations/0003_service_advisor_os.sql", import.meta.url), "utf8"));
  await conflictRecord(db, "ro-sync-1");
  const resolved = (await db.query<{ sync_status: string; conflict_state: string | null; sync_error: string | null; version: number }>(
    `update repair_orders set conflict_state = null, sync_error = null, sync_status = $1, local_changed_at = $2, updated_at = $2, version = version + 1 where id = $3 and user_id = $4 and version = $5 and conflict_state is not null returning sync_status, conflict_state, sync_error, version`,
    ["pending", "2026-08-20T18:00:00.000Z", "ro-sync-1", "advisor-1", 3],
  )).rows[0];
  assert.deepEqual(resolved, { sync_status: "pending", conflict_state: null, sync_error: null, version: 4 });
  const stale = await db.query("update repair_orders set conflict_state = null where id = $1 and user_id = $2 and version = $3 and conflict_state is not null returning id", ["ro-sync-1", "advisor-1", 3]);
  assert.equal(stale.rows.length, 0);
});

test("manual records return to local-only after conflict acknowledgement", async (t) => {
  const db = new PGlite();
  t.after(async () => db.close());
  await db.waitReady;
  await db.exec(await readFile(new URL("../migrations/0003_service_advisor_os.sql", import.meta.url), "utf8"));
  await conflictRecord(db, "ro-sync-2", "manual");
  const rows = await db.query<{ sync_status: string }>("update repair_orders set conflict_state = null, sync_error = null, sync_status = $1, version = version + 1 where id = $2 and user_id = $3 and version = $4 and conflict_state is not null returning sync_status", ["local-only", "ro-sync-2", "advisor-1", 3]);
  assert.equal(rows.rows[0]?.sync_status, "local-only");
});
