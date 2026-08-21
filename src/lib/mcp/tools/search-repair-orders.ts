import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { escapeLikePattern } from "../privacy";
import { summarizeRepairOrder } from "../shape";
import { SCOPES } from "../scopes";
import { checkScope, clampLimit, requireUserId, safeToolCall, textResult } from "../tool-helpers";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

export const inputShape = {
  query: z.string().trim().min(1).max(100).describe("Matches against RO number, customer name, or vehicle make/model. No wildcard or SQL syntax."),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Max rows to return (default ${DEFAULT_LIMIT}, hard max ${MAX_LIMIT}).`),
};

export function registerSearchRepairOrders(server: McpServer): void {
  server.registerTool(
    "search_repair_orders",
    {
      title: "Search repair orders",
      description: "Searches the advisor's repair orders by RO number, customer name, or vehicle make/model — a plain substring match over approved fields only, never arbitrary query syntax.",
      inputSchema: inputShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args, extra) => {
      const scopeError = checkScope(extra, SCOPES.READ);
      if (scopeError) return scopeError;
      return safeToolCall("search_repair_orders", async () => {
        const userId = requireUserId(extra);
        const repository = await RepairOrderRepository.connect();
        const limit = clampLimit(args.limit, DEFAULT_LIMIT, MAX_LIMIT);
        const pattern = `%${escapeLikePattern(args.query)}%`;
        const results = await repository.search(userId, pattern, limit);
        return textResult({ returned: results.length, repairOrders: results.map(summarizeRepairOrder) });
      });
    },
  );
}
