import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("normalized follow-up storage preserves a due date and user scope", async (t) => {
  const db = new PGlite();
  t.after(async () => db.close());
  await db.waitReady;
  await db.exec(await readFile(new URL("../migrations/0003_service_advisor_os.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../migrations/0004_service_follow_ups.sql", import.meta.url), "utf8"));
  await db.query("insert into service_customers (id, user_id, full_name) values ('customer-1', 'advisor-1', 'Taylor')");
  await db.query("insert into service_vehicles (id, user_id, customer_id, model) values ('vehicle-1', 'advisor-1', 'customer-1', 'Camry')");
  await db.query("insert into repair_orders (id, user_id, ro_number, customer_id, vehicle_id, workflow_state) values ('ro-1', 'advisor-1', '1001', 'customer-1', 'vehicle-1', 'written')");
  await db.query("insert into service_follow_ups (id, user_id, ro_id, reason, label, due_at, estimated_opportunity, note) values ('follow-1', 'advisor-1', 'ro-1', 'declined', 'Call about brake service', '2026-08-21T15:00:00.000Z', 640, 'Customer asked for Friday')");
  const rows = (await db.query<{ id: string; due_at: string | Date; note: string; estimated_opportunity: string }>("select id, due_at, note, estimated_opportunity from service_follow_ups where user_id = 'advisor-1'")).rows;
  assert.equal(rows[0]?.id, "follow-1");
  assert.equal(rows[0]?.note, "Customer asked for Friday");
  assert.equal(rows[0]?.estimated_opportunity, "640");
  assert.ok(new Date(rows[0]!.due_at).toISOString().startsWith("2026-08-21"));
});
