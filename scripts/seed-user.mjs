#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";

const databaseUrl = process.env.DATABASE_URL?.trim();
const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_USER_PASSWORD;

if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!email || !email.includes("@")) throw new Error("SEED_USER_EMAIL must be a valid email address");
if (!password || password.length < 12) throw new Error("SEED_USER_PASSWORD must be at least 12 characters");

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const existing = await client.query('select id from "user" where email = $1 limit 1', [email]);
  if (existing.rowCount) {
    throw new Error(`A user already exists for ${email}; refusing to overwrite it.`);
  }

  const userId = randomUUID();
  const accountId = randomUUID();
  const now = new Date();
  const passwordHash = await hashPassword(password);
  await client.query(
    'insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, $5)',
    [userId, email.split("@")[0], email, true, now],
  );
  await client.query(
    'insert into "account" (id, issuer, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, $6, $7, $7)',
    [accountId, "local:credential", userId, "credential", userId, passwordHash, now],
  );
  await client.query("COMMIT");
  console.log(`Seeded one password user: ${email}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
