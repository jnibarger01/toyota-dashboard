import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("resolving one blocker preserves other active blockers and advances the RO version", async (t) => {
  const db = new PGlite();
  t.after(async () => db.close());
  await db.waitReady;
  await db.exec(await readFile(new URL("../migrations/0003_service_advisor_os.sql", import.meta.url), "utf8"));
  await db.query("insert into service_customers (id, user_id, full_name) values ('customer-1', 'advisor-1', 'Taylor')");
  await db.query("insert into service_vehicles (id, user_id, customer_id, model) values ('vehicle-1', 'advisor-1', 'customer-1', 'Camry')");
  await db.query("insert into repair_orders (id, user_id, ro_number, customer_id, vehicle_id, workflow_state, version) values ('ro-1', 'advisor-1', '1001', 'customer-1', 'vehicle-1', 'written', 2)");
  await db.query("insert into ro_blockers (id, ro_id, blocker_type, description, severity) values ('blocker-1', 'ro-1', 'parts', 'Awaiting brake pads', 'high'), ('blocker-2', 'ro-1', 'technician', 'Need inspection', 'medium')");
  const updated = await db.query<{ id: string }>(
    `with target as (select id from repair_orders where id = $1 and user_id = $2 and version = $3 for update),
      resolved as (update ro_blockers set resolved_at = $4 where id = $5 and ro_id = $1 and resolved_at is null and exists (select 1 from target) returning id)
     update repair_orders set local_changed_at = $4, updated_at = $4, version = version + 1, sync_status = 'pending'
     where id = $1 and user_id = $2 and version = $3 and exists (select 1 from resolved) returning id`,
    ["ro-1", "advisor-1", 2, "2026-08-20T18:00:00.000Z", "blocker-1"],
  );
  assert.equal(updated.rows[0]?.id, "ro-1");
  const blockers = (await db.query<{ id: string; resolved_at: string | null }>("select id, resolved_at from ro_blockers where ro_id = 'ro-1' order by id")).rows;
  assert.ok(blockers[0]?.resolved_at);
  assert.equal(blockers[1]?.resolved_at, null);
  const version = await db.query<{ version: number }>("select version from repair_orders where id = 'ro-1'");
  assert.equal(version.rows[0]?.version, 3);
});

test("adding a blocker is optimistic, audited-ready, and advances the RO version", async (t) => {
  const db = new PGlite();
  t.after(async () => db.close());
  await db.waitReady;
  await db.exec(await readFile(new URL("../migrations/0003_service_advisor_os.sql", import.meta.url), "utf8"));
  await db.query("insert into service_customers (id, user_id, full_name) values ('customer-add', 'advisor-1', 'Taylor')");
  await db.query("insert into service_vehicles (id, user_id, customer_id, model) values ('vehicle-add', 'advisor-1', 'customer-add', 'Camry')");
  await db.query("insert into repair_orders (id, user_id, ro_number, customer_id, vehicle_id, workflow_state, version) values ('ro-add', 'advisor-1', '1002', 'customer-add', 'vehicle-add', 'written', 4)");
  const now = "2026-08-20T18:00:00.000Z";
  const added = await db.query<{ id: string }>(
    `with target as (select id from repair_orders where id = $1 and user_id = $2 and version = $3 for update),
      inserted as (insert into ro_blockers (id, ro_id, blocker_type, description, severity, source, created_at)
        select $4, $1, $5, $6, $7, 'manual', $8 where exists (select 1 from target) returning id)
     update repair_orders set local_changed_at = $8, updated_at = $8, version = version + 1, sync_status = 'pending'
     where id = $1 and user_id = $2 and version = $3 and exists (select 1 from inserted) returning id`,
    ["ro-add", "advisor-1", 4, "blocker-add", "parts", "Awaiting pads", "high", now],
  );
  assert.deepEqual(added.rows, [{ id: "ro-add" }]);
  const [order] = (await db.query<{ version: number; sync_status: string }>("select version, sync_status from repair_orders where id = 'ro-add'")).rows;
  assert.deepEqual(order, { version: 5, sync_status: "pending" });
  assert.equal((await db.query("select id from ro_blockers where ro_id = 'ro-add' and resolved_at is null")).rows.length, 1);
  const stale = await db.query("update repair_orders set version = version + 1 where id = 'ro-add' and version = 4 returning id");
  assert.equal(stale.rows.length, 0);
});
