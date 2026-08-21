import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { RepairOrderRepository } from "../src/lib/ro-repository.server.ts";

function sqlFor(db: PGlite) {
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0] ?? "";
    values.forEach((_, i) => { text += `$${i + 1}${strings[i + 1] ?? ""}`; });
    return (await db.query<T>(text, values)).rows;
  }) as any;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
  return sql;
}

async function setup() {
  const db = new PGlite(); await db.waitReady;
  await db.exec('create table "user" (id text primary key, name text not null, email text not null, "emailVerified" boolean not null, "createdAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now())');
  await db.exec(await readFile(new URL("../migrations/0003_service_advisor_os.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../migrations/0004_service_follow_ups.sql", import.meta.url), "utf8"));
  await db.query('insert into "user" (id,name,email,"emailVerified") values ($1,$1,$2,true)', ["11111111-1111-4111-8111-111111111111", "a@example.com"]);
  return db;
}

test("v0.3 repository vertical slice creates, updates, recommends, and closes an owned RO", async (t) => {
  const db = await setup(); t.after(() => db.close()); const sql = sqlFor(db); const repo = new RepairOrderRepository(sql);
  const userId = "11111111-1111-4111-8111-111111111111";
  const created = await repo.createRepairOrder({ userId, actorId: userId, roNumber: "V03-100", customerName: "Taylor Morrison", model: "RAV4", concern: "Brake noise", promiseAt: "2026-08-21T18:00:00.000Z" });
  assert.equal(created.state, "written"); assert.equal(created.roNumber, "V03-100");
  const updated = await repo.updateOperational({ userId, roId: created.id, expectedVersion: created.version, actorId: userId, diagnosis: "Front pads worn", source: "mcp" });
  const recAdded = await repo.addRecommendation({ userId, roId: created.id, description: "Front brake pads", amount: 400, expectedVersion: updated.version, actorId: userId });
  const [rec] = await repo.listRecommendations(userId, created.id);
  const recUpdated = await repo.updateRecommendation({ userId, roId: created.id, id: rec.id, expectedVersion: recAdded.version, actorId: userId, amount: 425 });
  let current = recUpdated;
  for (const state of ["dispatched", "diagnosing", "estimate_ready", "awaiting_approval", "approved", "repairing", "qc", "ready"] as const) current = await repo.transition({ userId, roId: created.id, to: state, expectedVersion: current.version, actorId: userId, source: "mcp" });
  const closed = await repo.close({ userId, roId: created.id, expectedVersion: current.version, actorId: userId });
  assert.equal(closed.state, "delivered");
  await assert.rejects(repo.close({ userId, roId: created.id, expectedVersion: closed.version, actorId: userId }), /already closed/);
});
