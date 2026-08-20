import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { FollowUpRepository } from "../src/lib/follow-up-repository.server.ts";

function sqlFor(db: PGlite) {
  const normalize = <T>(value: T): T => {
    if (value instanceof Date) return value.toISOString() as T;
    if (Array.isArray(value)) return value.map(normalize) as T;
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)])) as T;
    return value;
  };
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1] ?? ""}`;
    return (await db.query<T>(text, values)).rows.map(normalize);
  }) as typeof import("../src/lib/db.ts").getSql extends () => Promise<infer T> ? T : never;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows.map(normalize);
  return sql;
}

test("follow-up repository persists due work, outcome changes, user scope, and RO audit events", async (t) => {
  const db = new PGlite();
  t.after(async () => db.close());
  await db.waitReady;
  await db.exec(await readFile(new URL("../migrations/0003_service_advisor_os.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../migrations/0004_service_follow_ups.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../migrations/0008_follow_up_manual_origin.sql", import.meta.url), "utf8"));
  await db.query("insert into service_customers (id, user_id, full_name) values ('customer-follow', 'advisor-1', 'Taylor')");
  await db.query("insert into service_vehicles (id, user_id, customer_id, model) values ('vehicle-follow', 'advisor-1', 'customer-follow', 'Camry')");
  await db.query("insert into repair_orders (id, user_id, ro_number, customer_id, vehicle_id, workflow_state) values ('ro-follow', 'advisor-1', '1001', 'customer-follow', 'vehicle-follow', 'written')");
  const repository = new FollowUpRepository(sqlFor(db));
  const created = await repository.create({ userId: "advisor-1", roId: "ro-follow", reason: "customer_callback", label: "Call after parts arrive", callbackAt: "2026-08-21T15:00:00.000Z", estimatedOpportunity: 640, note: "Customer requested an afternoon call", createdManually: true });
  assert.equal(created.outcome, "open");
  assert.equal(created.estimatedOpportunity, 640);
  assert.equal(created.callbackAt, "2026-08-21T15:00:00.000Z");
  assert.equal(created.createdManually, true);
  assert.deepEqual(await repository.list("other-advisor"), []);
  assert.equal((await repository.list("advisor-1"))[0]?.note, "Customer requested an afternoon call");

  const called = await repository.setOutcome("advisor-1", created.id, "called");
  assert.equal(called.outcome, "called");
  const contact = (await db.query<{ method: string; direction: string; summary: string; sent: boolean }>("select method, direction, summary, sent from ro_communications where ro_id = 'ro-follow'" )).rows[0];
  assert.deepEqual(contact, { method: "phone", direction: "outgoing", summary: "Follow-up: Call after parts arrive", sent: true });
  const timer = (await db.query<{ last_customer_contact_at: string; next_update_due_at: string }>("select last_customer_contact_at, next_update_due_at from repair_orders where id = 'ro-follow'" )).rows[0];
  assert.ok(timer?.last_customer_contact_at);
  assert.ok(timer?.next_update_due_at && new Date(timer.next_update_due_at).getTime() > new Date(timer.last_customer_contact_at).getTime());
  const events = (await db.query<{ event_type: string }>("select event_type from ro_events where ro_id = 'ro-follow' order by event_type")).rows.map((row) => row.event_type);
  assert.deepEqual(events, ["customer_contacted", "follow_up_created", "follow_up_outcome_changed"]);
});
