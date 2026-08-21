import { McpServer } from "@modelcontextprotocol/server";
import { registerGetLaneSummary } from "./tools/get-lane-summary";
import { registerListRepairOrders } from "./tools/list-repair-orders";
import { registerGetRepairOrder } from "./tools/get-repair-order";
import { registerListBlockedRepairOrders } from "./tools/list-blocked-repair-orders";
import { registerListFollowUps } from "./tools/list-follow-ups";
import { registerGetRecommendations } from "./tools/get-recommendations";
import { registerSearchRepairOrders } from "./tools/search-repair-orders";
import { registerCreateFollowUp } from "./tools/create-follow-up";
import { registerCompleteFollowUp } from "./tools/complete-follow-up";
import { registerAddRoBlocker } from "./tools/add-ro-blocker";
import { registerResolveRoBlocker } from "./tools/resolve-ro-blocker";
import { registerAddRoCommunication } from "./tools/add-ro-communication";
import { registerUpdateRecommendationStatus } from "./tools/update-recommendation-status";
import { registerUpdateRepairOrderStatus } from "./tools/update-repair-order-status";
import { registerCreateRepairOrder } from "./tools/create-repair-order";
import { registerUpdateRepairOrder } from "./tools/update-repair-order";
import { registerUpdateRepairOrderNotes } from "./tools/update-repair-order-notes";
import { registerCloseRepairOrder } from "./tools/close-repair-order";
import { registerAssignRepairOrder } from "./tools/assign-repair-order";
import { registerAddRecommendation } from "./tools/add-recommendation";
import { registerUpdateRecommendation } from "./tools/update-recommendation";
import { LANE_UI_URI, laneUiHtml } from "./ui";

/**
 * Builds a fresh MCP server for a single request.
 *
 * MUST be a new instance per request, not a module-level singleton: the SDK's
 * `Protocol.connect()` binds one transport at a time, and Vercel Fluid
 * Compute can serve concurrent requests on the same warm instance — sharing
 * one `McpServer` across concurrent `connect()` calls would let one
 * in-flight request's transport get silently replaced by another's. Tool
 * registration is cheap, so paying it per request is the safe default.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "toyota-dashboard", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.registerResource("toyota-service-lane", LANE_UI_URI, { mimeType: "text/html;profile=mcp-app" }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "text/html;profile=mcp-app", text: laneUiHtml, _meta: { ui: { prefersBorder: true } } }],
  }));

  // v0.1 — READ / OBSERVE
  registerGetLaneSummary(server);
  registerListRepairOrders(server);
  registerGetRepairOrder(server);
  registerListBlockedRepairOrders(server);
  registerListFollowUps(server);
  registerGetRecommendations(server);
  registerSearchRepairOrders(server);

  // v0.2 — WRITE / OPERATE
  registerCreateFollowUp(server);
  registerCompleteFollowUp(server);
  registerAddRoBlocker(server);
  registerResolveRoBlocker(server);
  registerAddRoCommunication(server);
  registerUpdateRecommendationStatus(server);
  registerUpdateRepairOrderStatus(server);
  registerCreateRepairOrder(server);
  registerUpdateRepairOrder(server);
  registerUpdateRepairOrderNotes(server);
  registerCloseRepairOrder(server);
  registerAssignRepairOrder(server);
  registerAddRecommendation(server);
  registerUpdateRecommendation(server);

  return server;
}
