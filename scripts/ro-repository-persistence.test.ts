import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { RepairOrderRepository } from "../src/lib/ro-repository.server.ts";

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

test("repository persists manual intake, confirmed contact timer reset, and immutable operational history", async (t) => {
  const db = new PGlite();
  t.after(async () => db.close());
  await db.waitReady;
  await db.exec(await readFile(new URL("../migrations/0003_service_advisor_os.sql", import.meta.url), "utf8"));
  const repository = new RepairOrderRepository(sqlFor(db));
  const created = await repository.createManual({
    id: "00000000-0000-4000-8000-000000000001", userId: "advisor-1", actorId: "advisor-1", roNumber: "RO-1001",
    customerName: "Taylor Customer", preferredName: "Taylor", phone: "8165550101", email: "taylor@example.test", preferredContactMethod: "sms", communicationConsent: "granted",
    year: 2025, make: "Toyota", model: "Camry", trim: "XSE", vin: "JT123", mileage: 1200, licensePlate: "TEST123",
    concern: "Brake concern", transportation: "waiting", waitingCustomer: true, promiseAt: "2026-08-20T22:00:00.000Z", updateIntervalMinutes: 45,
  });
  assert.equal(created.state, "written");
  assert.equal(created.preferredName, "Taylor");
  assert.equal(created.email, "taylor@example.test");
  assert.equal(created.preferredContactMethod, "sms");
  assert.equal(created.vehicle.licensePlate, "TEST123");
  assert.equal(created.version, 1);

  const contacted = await repository.recordContact({
    userId: "advisor-1", actorId: "advisor-1", roId: created.id, expectedVersion: created.version,
    method: "sms", summary: "Customer updated with the inspection status", outcome: "Customer acknowledged", intervalMinutes: 45,
  });
  assert.equal(contacted.version, 2);
  assert.ok(contacted.lastCustomerContactAt);
  assert.ok(contacted.nextUpdateDueAt);
  assert.equal(Math.round((Date.parse(contacted.nextUpdateDueAt!) - Date.parse(contacted.lastCustomerContactAt!)) / 60_000), 45);

  const reloaded = await repository.getById("advisor-1", created.id);
  assert.equal(reloaded?.version, 2);
  assert.equal(reloaded?.lastCustomerContactAt, contacted.lastCustomerContactAt);
  assert.equal(await repository.getById("other-advisor", created.id), null);

  const transitioned = await repository.transition({
    userId: "advisor-1", actorId: "advisor-1", roId: created.id, expectedVersion: contacted.version,
    to: "dispatched", source: "manual", reason: "Technician assigned", notes: "Released to the shop",
  });
  assert.equal(transitioned.state, "dispatched");
  assert.equal(transitioned.previousState, "written");
  assert.equal(transitioned.version, 3);
  const [statusHistory] = (await db.query<{ previous_state: string | null; new_state: string; source: string; actor_id: string | null; reason: string | null; notes: string | null }>("select previous_state, new_state, source, actor_id, reason, notes from ro_status_history where ro_id = $1 and new_state = 'dispatched'", [created.id])).rows;
  assert.deepEqual(statusHistory, { previous_state: "written", new_state: "dispatched", source: "manual", actor_id: "advisor-1", reason: "Technician assigned", notes: "Released to the shop" });

  const history = await repository.getOperationalHistory("advisor-1", created.id);
  assert.equal(history.communications.length, 1);
  assert.equal(history.communications[0]?.sent, true);
  assert.equal(history.communications[0]?.method, "sms");
  assert.deepEqual(history.statusHistory.map((item) => [item.previousState, item.newState, item.reason]), [[null, "written", null], ["written", "dispatched", "Technician assigned"]]);
  assert.deepEqual(history.events.map((event) => event.type).sort(), ["customer_contacted", "ro_created", "status_changed"]);
});
