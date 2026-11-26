import type { Sql } from "../db.ts";

/**
 * Resolves an OAuth subject to an existing Better Auth user id.
 *
 * - Local Better Auth issuer (`providerId` omitted): `subject` is the local `"user"."id"`.
 * - External central issuer (e.g. `providerId === "jace"`): `subject` is the
 *   upstream `sub` stored in `"account"."accountId"` for that provider, mapped
 *   strictly to the linked local `"userId"` (never falling back to raw `"user"."id"`).
 */
export async function getBetterAuthUserId(
  sql: Sql,
  subject: string,
  providerId?: string,
): Promise<string | null> {
  if (providerId) {
    const rows = await sql.query<{ id: string }>(
      'select "userId" as id from "account" where "providerId" = $1 and "accountId" = $2 limit 1',
      [providerId, subject],
    );
    return rows[0]?.id ?? null;
  }
  const rows = await sql.query<{ id: string }>('select id from "user" where id = $1', [subject]);
  return rows[0]?.id ?? null;
}
