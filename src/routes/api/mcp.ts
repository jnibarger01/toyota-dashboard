import { createFileRoute } from "@tanstack/react-router";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMcpRequest, McpHttpError } from "@/lib/mcp/auth";
import { createMcpServer } from "@/lib/mcp/server";

/**
 * Remote MCP endpoint — `/api/mcp`. Read-only Toyota service-lane tools over
 * the Streamable HTTP transport (stateless: no session id, one JSON response
 * per request, no server-held connection state between requests — the right
 * shape for a serverless/Fluid Compute deployment). See docs/mcp.md.
 *
 * Auth runs BEFORE any MCP protocol/server work: an invalid or missing
 * bearer token never reaches tool listing or the database.
 */
async function handleMcpRequest(request: Request): Promise<Response> {
  try {
    const auth = await authenticateMcpRequest(request);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true, // single JSON response, no SSE stream to keep open
    });
    const server = createMcpServer();
    await server.connect(transport);

    // One request id per HTTP request (not the client-supplied JSON-RPC id,
    // which isn't guaranteed unique/trustworthy) — propagated to every write
    // tool's audit entry.
    const requestId = crypto.randomUUID();
    return await transport.handleRequest(request, {
      authInfo: {
        token: "redacted",
        clientId: auth.userId,
        scopes: auth.scopes,
        extra: { userId: auth.userId, tokenId: auth.tokenId, requestId },
      },
    });
  } catch (err) {
    if (err instanceof McpHttpError) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (err.status === 401) headers["www-authenticate"] = 'Bearer realm="toyota-dashboard-mcp"';
      return new Response(JSON.stringify({ error: err.message }), { status: err.status, headers });
    }
    // Never let a raw driver/stack-trace message reach the client.
    console.error("[mcp] unhandled request error", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { "content-type": "application/json" } });
  }
}

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      GET: ({ request }) => handleMcpRequest(request),
      POST: ({ request }) => handleMcpRequest(request),
      DELETE: ({ request }) => handleMcpRequest(request),
    },
  },
});
