import type { Sql } from "../db.ts";

/** Resolves an OAuth subject to an existing Better Auth user id. */
export async function getBetterAuthUserId(sql: Sql, subject: string): Promise<string | null> {
  const rows = await sql.query<{ id: string }>('select id from "user" where id = $1', [subject]);
  return rows[0]?.id ?? null;
}
