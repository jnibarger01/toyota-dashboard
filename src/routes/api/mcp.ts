import { createFileRoute } from "@tanstack/react-router";
import { requireMcpAuth } from "@better-auth/mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { authenticateMcpRequest, McpHttpError, type McpAuthContext } from "@/lib/mcp/auth";
import { authenticateOAuthClaims } from "@/lib/mcp/oauth";
import { createMcpServer } from "@/lib/mcp/server";
import { auth, authIssuerURL, mcpResourceURL } from "@/lib/auth/server";

function hasStaticBearer(request: Request): boolean {
  return /^Bearer\s+toyota_mcp_/i.test(request.headers.get("authorization")?.trim() ?? "");
}

async function handleAuthenticatedMcpRequest(request: Request, authContext: McpAuthContext): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMcpServer();
  await server.connect(transport);
  const requestId = crypto.randomUUID();
  return transport.handleRequest(request, {
    authInfo: {
      token: "redacted",
      clientId: authContext.userId,
      scopes: authContext.scopes,
      extra: { userId: authContext.userId, tokenId: authContext.tokenId, requestId },
    },
  });
}

const oauthMcpHandler = requireMcpAuth(
  auth,
  async (request, claims) => {
    const sql = await (await import("@/lib/db")).getSql();
    const authContext = await authenticateOAuthClaims(claims as Record<string, unknown>, sql, mcpResourceURL);
    return handleAuthenticatedMcpRequest(request, authContext);
  },
  {
    resource: mcpResourceURL,
    issuer: authIssuerURL,
    jwksUrl: `${authIssuerURL.replace(/\/$/, "")}/jwks`,
  },
);

async function handleMcpRequest(request: Request): Promise<Response> {
  try {
    if (hasStaticBearer(request)) {
      const authContext = await authenticateMcpRequest(request);
      return await handleAuthenticatedMcpRequest(request, authContext);
    }
    return await oauthMcpHandler(request);
  } catch (err) {
    if (err instanceof McpHttpError) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (err.status === 401) headers["www-authenticate"] = 'Bearer realm="toyota-dashboard-mcp"';
      return new Response(JSON.stringify({ error: err.message }), { status: err.status, headers });
    }
    console.error("[mcp] unhandled request error", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { "content-type": "application/json" } });
  }
}

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      POST: ({ request }) => handleMcpRequest(request),
    },
  },
});
