import { createFileRoute } from "@tanstack/react-router";
import { Pool } from "pg";

const CLIENT_ID = "grok-toyota-dashboard-public";
const REDIRECT_URI = "https://grok.com/connectors-oauth-exchange-code/";
const SCOPES = ["openid", "profile", "toyota:read"];
const RESOURCE = "https://toyota-dashboard-six.vercel.app/api/mcp";

function unauthorized(): Response {
  return new Response(null, { status: 404 });
}

export const Route = createFileRoute("/api/internal/grok-registration")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedToken = process.env.GROK_OAUTH_OPERATOR_TOKEN?.trim();
        const authorization = request.headers.get("authorization")?.trim();
        if (!expectedToken || authorization !== `Bearer ${expectedToken}`) return unauthorized();

        const databaseUrl = process.env.DATABASE_URL?.trim();
        if (!databaseUrl) return new Response(null, { status: 503 });

        const pool = new Pool({ connectionString: databaseUrl });
        const db = await pool.connect();
        try {
          await db.query("begin");
          await db.query(
            `insert into "oauthResource" ("id", "identifier", "name", "allowedScopes", "disabled", "createdAt", "updatedAt")
             values (gen_random_uuid()::text, $1, $2, $3::jsonb, false, now(), now())
             on conflict ("identifier") do update set "allowedScopes" = excluded."allowedScopes", "updatedAt" = now(), "disabled" = false`,
            [RESOURCE, "Toyota Dashboard MCP", JSON.stringify(SCOPES)],
          );
          const clientRows = await db.query(
            `insert into "oauthClient"
             ("id", "clientId", "clientSecret", "clientDiscoveryId", "disabled", "skipConsent", "scopes", "redirectUris", "tokenEndpointAuthMethod", "applicationType", "grantTypes", "responseTypes", "requirePKCE", "createdAt", "updatedAt", "name", "metadata")
             values (gen_random_uuid()::text, $1, null, null, false, false, $2::jsonb, $3::jsonb, 'none', 'web', '["authorization_code"]'::jsonb, '["code"]'::jsonb, true, now(), now(), $4, $5::jsonb)
             on conflict ("clientId") do update set
               "clientSecret" = null, "disabled" = false, "skipConsent" = false,
               "scopes" = excluded."scopes", "redirectUris" = excluded."redirectUris",
               "tokenEndpointAuthMethod" = 'none', "grantTypes" = '["authorization_code"]'::jsonb,
               "responseTypes" = '["code"]'::jsonb, "requirePKCE" = true,
               "updatedAt" = now(), "name" = excluded."name", "metadata" = excluded."metadata"
             returning "clientId", "clientSecret", "redirectUris", "scopes", "grantTypes", "responseTypes", "tokenEndpointAuthMethod", "requirePKCE"`,
            [CLIENT_ID, JSON.stringify(SCOPES), JSON.stringify([REDIRECT_URI]), "Grok Custom Connector (Toyota Dashboard read-only)", JSON.stringify({ operatorManaged: true, provider: "grok", resource: RESOURCE })],
          );
          await db.query(
            `insert into "oauthClientResource" ("id", "clientId", "resourceId", "createdAt")
             select gen_random_uuid()::text, $1, $2, now()
             where not exists (select 1 from "oauthClientResource" where "clientId" = $1 and "resourceId" = $2)`,
            [CLIENT_ID, RESOURCE],
          );
          await db.query("commit");
          return Response.json({ ...clientRows.rows[0], resource: RESOURCE });
        } catch {
          await db.query("rollback").catch(() => undefined);
          return new Response(null, { status: 500 });
        } finally {
          db.release();
          await pool.end();
        }
      },
    },
  },
});
