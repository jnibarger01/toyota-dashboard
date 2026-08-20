import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("per-RO update interval atomically recalculates the due time and advances the version", async (t) => {
  const db = new PGlite();
  t.after(async () => db.close());
  await db.waitReady;
  await db.exec(await readFile(new URL("../migrations/0003_service_advisor_os.sql", import.meta.url), "utf8"));
  await db.query("insert into service_customers (id, user_id, full_name) values ('customer-1', 'advisor-1', 'Taylor')");
  await db.query("insert into service_vehicles (id, user_id, customer_id, model) values ('vehicle-1', 'advisor-1', 'customer-1', 'Camry')");
  await db.query("insert into repair_orders (id, user_id, ro_number, customer_id, vehicle_id, workflow_state, last_customer_contact_at, next_update_due_at, update_interval_minutes, version) values ('ro-1', 'advisor-1', '1001', 'customer-1', 'vehicle-1', 'written', '2026-08-20T14:00:00.000Z', '2026-08-20T15:30:00.000Z', 90, 2)");
  const contactAt = "2026-08-20T14:00:00.000Z";
  const intervalMinutes = 45;
  const nextDue = new Date(Date.parse(contactAt) + intervalMinutes * 60_000).toISOString();
  const result = await db.query<{ id: string }>(
    `update repair_orders set update_interval_minutes = $1, next_update_due_at = $2,
      local_changed_at = $3, updated_at = $3, version = version + 1, sync_status = 'pending'
     where id = $4 and user_id = $5 and version = $6 returning id`,
    [intervalMinutes, nextDue, "2026-08-20T14:05:00.000Z", "ro-1", "advisor-1", 2],
  );
  assert.deepEqual(result.rows, [{ id: "ro-1" }]);
  const [record] = (await db.query<{ update_interval_minutes: number; next_update_due_at: string | Date; version: number; sync_status: string }>("select update_interval_minutes, next_update_due_at, version, sync_status from repair_orders where id = 'ro-1'")).rows;
  assert.equal(record.update_interval_minutes, 45);
  assert.equal(new Date(record.next_update_due_at).toISOString(), nextDue);
  assert.equal(record.version, 3);
  assert.equal(record.sync_status, "pending");
});
