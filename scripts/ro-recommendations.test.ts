import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationRoot = new URL("../migrations/", import.meta.url);

async function applyMigration(db: PGlite, name: string) {
  await db.exec(await readFile(new URL(name, migrationRoot), "utf8"));
}

test("recommendation decision updates the authoritative totals atomically in PGlite", async (t) => {
  const db = new PGlite();
  t.after(async () => db.close());
  await db.waitReady;
  await applyMigration(db, "0003_service_advisor_os.sql");
  await applyMigration(db, "0004_service_follow_ups.sql");

  await db.query("insert into service_customers (id, user_id, full_name) values ('customer-1', 'advisor-1', 'Taylor Customer')");
  await db.query("insert into service_vehicles (id, user_id, customer_id, make, model) values ('vehicle-1', 'advisor-1', 'customer-1', 'Toyota', 'Camry')");
  await db.query("insert into repair_orders (id, user_id, ro_number, customer_id, vehicle_id, workflow_state) values ('ro-1', 'advisor-1', 'RO-1001', 'customer-1', 'vehicle-1', 'estimate_ready')");
  await db.query("insert into ro_recommendations (id, ro_id, description, amount, state) values ('rec-1', 'ro-1', 'Brake fluid service', 190, 'recommended'), ('rec-2', 'ro-1', 'Cabin filter', 70, 'declined')");

  const result = await db.query<{ id: string }>(
    `with target as (
      select id from repair_orders where id = $3 and user_id = $4 and version = $5 for update
    ), decision as (
      update ro_recommendations recommendation set state = $1, decided_at = case when $1 = 'recommended' then null else now() end
      where recommendation.id = $2 and recommendation.ro_id = (select id from target)
      returning recommendation.id
    ), totals as (
      select coalesce(sum(amount) filter (where case when id = $2 then $1 else state end = 'recommended'), 0) as recommended_total,
             coalesce(sum(amount) filter (where case when id = $2 then $1 else state end = 'approved'), 0) as approved_total,
             coalesce(sum(amount) filter (where case when id = $2 then $1 else state end = 'declined'), 0) as declined_total
      from ro_recommendations where ro_id = $3
    )
    update repair_orders ro set recommended_total = totals.recommended_total, approved_total = totals.approved_total,
      declined_total = totals.declined_total, local_changed_at = now(), updated_at = now(), version = version + 1, sync_status = 'pending'
    from totals where ro.id = $3 and ro.user_id = $4 and ro.version = $5 and exists (select 1 from decision)
    returning ro.id`,
    ["approved", "rec-1", "ro-1", "advisor-1", 1],
  );

  assert.deepEqual(result.rows, [{ id: "ro-1" }]);
  const [order] = (await db.query<{ recommended_total: string; approved_total: string; declined_total: string; version: number; sync_status: string }>("select recommended_total, approved_total, declined_total, version, sync_status from repair_orders where id = 'ro-1'")).rows;
  assert.deepEqual(order, { recommended_total: "0", approved_total: "190", declined_total: "70", version: 2, sync_status: "pending" });
  const [recommendation] = (await db.query<{ state: string; decided_at: string | null }>("select state, decided_at from ro_recommendations where id = 'rec-1'")).rows;
  assert.equal(recommendation.state, "approved");
  assert.notEqual(recommendation.decided_at, null);
});

test("a new manual estimate increments the recommended total under the expected version", async (t) => {
  const db = new PGlite();
  t.after(async () => db.close());
  await db.waitReady;
  await applyMigration(db, "0003_service_advisor_os.sql");
  await db.query("insert into service_customers (id, user_id, full_name) values ('customer-add', 'advisor-1', 'Taylor Customer')");
  await db.query("insert into service_vehicles (id, user_id, customer_id, make, model) values ('vehicle-add', 'advisor-1', 'customer-add', 'Toyota', 'Camry')");
  await db.query("insert into repair_orders (id, user_id, ro_number, customer_id, vehicle_id, workflow_state, recommended_total, version) values ('ro-add', 'advisor-1', 'RO-1002', 'customer-add', 'vehicle-add', 'estimate_ready', 125, 4)");
  const result = await db.query<{ id: string }>(
    `with target as (select id from repair_orders where id = $1 and user_id = $2 and version = $3 for update),
      inserted as (insert into ro_recommendations (id, ro_id, description, amount, state, created_at) select $4, $1, $5, $6, 'recommended', $7 where exists (select 1 from target) returning id)
     update repair_orders set recommended_total = recommended_total + $6, local_changed_at = $7, updated_at = $7, version = version + 1, sync_status = 'pending'
     where id = $1 and user_id = $2 and version = $3 and exists (select 1 from inserted) returning id`,
    ["ro-add", "advisor-1", 4, "rec-add", "Brake fluid service", 190, "2026-08-20T18:00:00.000Z"],
  );
  assert.deepEqual(result.rows, [{ id: "ro-add" }]);
  const [order] = (await db.query<{ recommended_total: string; version: number }>("select recommended_total, version from repair_orders where id = 'ro-add'")).rows;
  assert.deepEqual(order, { recommended_total: "315", version: 5 });
});
