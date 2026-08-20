import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { createSeedData } from "@/lib/fleet-seed";
import type { FleetSnapshot } from "@/lib/fleet-types";

function asSnap(row: { payload: unknown } | undefined): FleetSnapshot | null {
  if (!row) return null;
  const p = row.payload;
  if (typeof p === "string") {
    try {
      return JSON.parse(p) as FleetSnapshot;
    } catch {
      return null;
    }
  }
  return p as FleetSnapshot;
}

export const loadFleet = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql.query<{ payload: unknown }>(
      "select payload from fleet_orgs where user_id = $1 limit 1",
      [context.userId],
    );
    const existing = asSnap(rows[0]);
    if (existing) return existing;
    const seed = createSeedData();
    await sql.query(
      "insert into fleet_orgs (user_id, payload) values ($1, $2::jsonb)",
      [context.userId, JSON.stringify(seed)],
    );
    return seed;
  });

export const saveFleet = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: FleetSnapshot) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql.query(
      `insert into fleet_orgs (user_id, payload, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (user_id) do update set payload = excluded.payload, updated_at = now()`,
      [context.userId, JSON.stringify(data)],
    );
    return { ok: true as const };
  });
