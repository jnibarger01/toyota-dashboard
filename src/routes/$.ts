import { createFileRoute } from "@tanstack/react-router";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { auth, authIssuerURL, mcpResourceURL } from "@/lib/auth/server";
import { SCOPES } from "@/lib/mcp/scopes";

const resourceClient = oauthProviderResourceClient(auth);
const protectedResourcePath = "/.well-known/oauth-protected-resource/api/mcp";

export const Route = createFileRoute("/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.pathname !== protectedResourcePath) return new Response("Not found", { status: 404 });
        const metadata = await resourceClient.getActions().getProtectedResourceMetadata({
          resource: mcpResourceURL,
          authorization_servers: [authIssuerURL],
          scopes_supported: [
            SCOPES.READ,
            SCOPES.RO_WRITE,
            SCOPES.COMMUNICATION_WRITE,
            SCOPES.FOLLOWUP_WRITE,
            SCOPES.RECOMMENDATION_WRITE,
          ],
        });
        return new Response(JSON.stringify(metadata), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "public, max-age=300",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});
