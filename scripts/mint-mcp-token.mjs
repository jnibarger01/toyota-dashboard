#!/usr/bin/env node
/**
 * Operator CLI: mints a Toyota MCP bearer token for one advisor, with
 * explicit, least-privilege scopes.
 *
 * Deliberately takes a `user_id`, not an email — it never queries Better
 * Auth's "user" table, keeping token minting fully outside the MCP/auth
 * table boundary. Find your advisor's user id from Better Auth directly
 * (e.g. the Neon SQL console: `select id, email from "user"`), not through
 * this script.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/mint-mcp-token.mjs \
 *     --user-id <better-auth-user-id> --label "Claude Code" \
 *     --scopes "toyota:read,toyota:ro:write,toyota:followup:write"
 *
 *   # No --scopes given -> read-only (least privilege), same as v0.1:
 *   DATABASE_URL=postgres://... node scripts/mint-mcp-token.mjs \
 *     --user-id <id> --label "read-only dashboard viewer"
 *
 *   DATABASE_URL=postgres://... node scripts/mint-mcp-token.mjs --revoke <token-id>
 *
 * The plaintext token is printed ONCE. Only its SHA-256 hash is stored.
 * Known scopes (see src/lib/mcp/scopes.ts — duplicated here as plain JS
 * constants since this script runs under plain `node`, not the TS loader):
 *   toyota:read
 *   toyota:ro:write
 *   toyota:communication:write
 *   toyota:followup:write
 *   toyota:recommendation:write
 */
import { randomBytes, createHash } from "node:crypto";
import pg from "pg";

const KNOWN_SCOPES = new Set([
  "toyota:read",
  "toyota:ro:write",
  "toyota:communication:write",
  "toyota:followup:write",
  "toyota:recommendation:write",
]);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--user-id") out.userId = argv[++i];
    else if (arg === "--label") out.label = argv[++i];
    // --scopes is the primary flag (comma- or space-separated list).
    // --scope (singular, v0.1) is kept as an alias for one scope.
    else if (arg === "--scopes") out.scopes = argv[++i];
    else if (arg === "--scope") out.scopes = argv[++i];
    else if (arg === "--revoke") out.revoke = argv[++i];
  }
  return out;
}

function parseScopes(raw) {
  if (!raw) return ["toyota:read"]; // omitted -> least-privilege default, not every scope
  const scopes = [...new Set(raw.split(/[,\s]+/).filter(Boolean))];
  const unknown = scopes.filter((scope) => !KNOWN_SCOPES.has(scope));
  if (unknown.length) {
    throw new Error(`Unknown scope(s): ${unknown.join(", ")}. Known scopes: ${[...KNOWN_SCOPES].join(", ")}`);
  }
  if (!scopes.length) throw new Error("At least one scope is required.");
  return scopes;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const args = parseArgs(process.argv.slice(2));
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

  try {
    if (args.revoke) {
      const result = await pool.query('update mcp_api_tokens set revoked_at = now() where id = $1 and revoked_at is null returning id', [args.revoke]);
      console.log(result.rows[0] ? `Revoked token ${args.revoke}` : `No active token found with id ${args.revoke}`);
      return;
    }

    if (!args.userId) {
      console.error('Usage: node scripts/mint-mcp-token.mjs --user-id <id> --label "<label>" [--scopes "toyota:read,toyota:ro:write"]');
      console.error("       node scripts/mint-mcp-token.mjs --revoke <token-id>");
      process.exit(1);
    }
    const label = args.label ?? "MCP client";
    const scopes = parseScopes(args.scopes);
    const scope = scopes.join(" ");

    const owner = await pool.query('select id from "user" where id = $1', [args.userId]);
    if (!owner.rows[0]) {
      console.error(`No Better Auth user with id ${args.userId} — refusing to mint a token for an unknown advisor.`);
      process.exit(1);
    }

    const id = randomBytes(12).toString("hex");
    const token = `toyota_mcp_${randomBytes(32).toString("base64url")}`;
    const tokenHash = createHash("sha256").update(token).digest("hex");

    await pool.query(
      "insert into mcp_api_tokens (id, user_id, label, token_hash, scope) values ($1, $2, $3, $4, $5)",
      [id, args.userId, label, tokenHash, scope],
    );

    console.log(`Minted MCP token "${label}" (id: ${id}) for user ${args.userId}.`);
    console.log(`Scopes: ${scope}`);
    console.log("");
    console.log("Save this token now — it will not be shown again:");
    console.log("");
    console.log(`  ${token}`);
    console.log("");
    console.log(`To revoke it later: node scripts/mint-mcp-token.mjs --revoke ${id}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Failed to mint token:", err?.message ?? err);
  process.exit(1);
});
