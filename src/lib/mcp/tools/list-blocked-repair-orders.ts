import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { summarizeBlocker, summarizeRepairOrder } from "../shape";
import { SCOPES } from "../scopes";
import { checkScope, clampLimit, requireUserId, safeToolCall, textResult } from "../tool-helpers";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const inputShape = {
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Max rows to return (default ${DEFAULT_LIMIT}, hard max ${MAX_LIMIT}).`),
};

export function registerListBlockedRepairOrders(server: McpServer): void {
  server.registerTool(
    "list_blocked_repair_orders",
    {
      title: "List blocked repair orders",
      description: "Active repair orders with one or more unresolved blockers, and why — answers \"which cars are stuck and why?\".",
      inputSchema: inputShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args, extra) => {
      const scopeError = checkScope(extra, SCOPES.READ);
      if (scopeError) return scopeError;
      return safeToolCall("list_blocked_repair_orders", async () => {
        const userId = requireUserId(extra);
        const repository = await RepairOrderRepository.connect();
        const lane = await repository.listForLane(userId);
        const blocked = lane.filter((item) => item.record.state !== "delivered" && item.blockers.length > 0);
        const limit = clampLimit(args.limit, DEFAULT_LIMIT, MAX_LIMIT);
        return textResult({
          total: blocked.length,
          returned: Math.min(limit, blocked.length),
          repairOrders: blocked.slice(0, limit).map((item) => ({ ...summarizeRepairOrder(item.record), blockers: item.blockers.map(summarizeBlocker) })),
        });
      });
    },
  );
}
