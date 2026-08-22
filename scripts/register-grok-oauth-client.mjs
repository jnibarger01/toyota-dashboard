#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

export const GROK_CLIENT_ID = "grok-toyota-dashboard-public";
export const GROK_REDIRECT_URI = "https://grok.com/connectors-oauth-exchange-code/";
export const GROK_SCOPES = ["openid", "profile", "toyota:read"];
export const MCP_RESOURCE = "https://toyota-dashboard-six.vercel.app/api/mcp";

function usage() {
  console.error(`Usage: DATABASE_URL=... node scripts/register-grok-oauth-client.mjs [--client-id ID]`);
}

export function buildClientRecord({ clientId = GROK_CLIENT_ID } = {}) {
  if (!/^[A-Za-z0-9._~-]+$/.test(clientId)) {
    throw new Error("client id must use OAuth client-id characters only");
  }
  return {
    id: `oauth-client-${clientId}`,
    clientId,
    clientSecret: null,
    redirectUris: [GROK_REDIRECT_URI],
    scopes: GROK_SCOPES,
    grantTypes: ["authorization_code"],
    responseTypes: ["code"],
    tokenEndpointAuthMethod: "none",
    requirePKCE: true,
    name: "Grok Custom Connector (Toyota Dashboard read-only)",
    applicationType: "web",
    metadata: { operatorManaged: true, provider: "grok", resource: MCP_RESOURCE },
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required; no database changes were made");

  const args = process.argv.slice(2);
  let clientId = GROK_CLIENT_ID;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--client-id") {
      clientId = args[i + 1] ?? "";
      i += 1;
    } else {
      usage();
      process.exitCode = 2;
      return;
    }
  }

  const client = buildClientRecord({ clientId });
  const pool = new Pool({ connectionString: databaseUrl });
  const db = await pool.connect();
  try {
    await db.query("begin");
    await db.query(
      `insert into "oauthResource" ("id", "identifier", "name", "allowedScopes", "disabled", "createdAt", "updatedAt")
       values ($1, $2, $3, $4::jsonb, false, now(), now())
       on conflict ("identifier") do update set "allowedScopes" = excluded."allowedScopes", "updatedAt" = now(), "disabled" = false`,
      [randomUUID(), MCP_RESOURCE, "Toyota Dashboard MCP", JSON.stringify(GROK_SCOPES)],
    );
    await db.query(
      `insert into "oauthClient"
       ("id", "clientId", "clientSecret", "clientDiscoveryId", "disabled", "skipConsent", "scopes", "redirectUris", "tokenEndpointAuthMethod", "applicationType", "grantTypes", "responseTypes", "requirePKCE", "createdAt", "updatedAt", "name", "metadata")
       values ($1, $2, null, null, false, false, $3::jsonb, $4::jsonb, $5, $6, $7::jsonb, $8::jsonb, $9, now(), now(), $10, $11::jsonb)
       on conflict ("clientId") do update set
         "clientSecret" = null,
         "disabled" = false,
         "skipConsent" = false,
         "scopes" = excluded."scopes",
         "redirectUris" = excluded."redirectUris",
         "tokenEndpointAuthMethod" = excluded."tokenEndpointAuthMethod",
         "applicationType" = excluded."applicationType",
         "grantTypes" = excluded."grantTypes",
         "responseTypes" = excluded."responseTypes",
         "requirePKCE" = excluded."requirePKCE",
         "updatedAt" = now(),
         "name" = excluded."name",
         "metadata" = excluded."metadata"
       returning "clientId", "clientSecret", "redirectUris", "scopes", "grantTypes", "responseTypes", "tokenEndpointAuthMethod", "requirePKCE"`,
      [
        client.id,
        client.clientId,
        JSON.stringify(client.scopes),
        JSON.stringify(client.redirectUris),
        client.tokenEndpointAuthMethod,
        client.applicationType,
        JSON.stringify(client.grantTypes),
        JSON.stringify(client.responseTypes),
        client.requirePKCE,
        client.name,
        JSON.stringify(client.metadata),
      ],
    );
    const existingLink = await db.query(
      `select 1 from "oauthClientResource" where "clientId" = $1 and "resourceId" = $2 limit 1`,
      [client.clientId, MCP_RESOURCE],
    );
    if (existingLink.rowCount === 0) {
      await db.query(
        `insert into "oauthClientResource" ("id", "clientId", "resourceId", "createdAt")
         values ($1, $2, $3, now())`,
        [randomUUID(), client.clientId, MCP_RESOURCE],
      );
    }
    await db.query("commit");
    console.log(JSON.stringify({ clientId: client.clientId, clientSecret: null, redirectUri: GROK_REDIRECT_URI, scopes: GROK_SCOPES, resource: MCP_RESOURCE }));
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
