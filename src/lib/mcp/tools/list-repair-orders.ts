import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { WORKFLOW_STATES } from "@/lib/ro-domain";
import { summarizeRepairOrder } from "../shape";
import { SCOPES } from "../scopes";
import { checkScope, clampLimit, requireUserId, safeToolCall, textResult } from "../tool-helpers";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export const inputShape = {
  status: z.enum(WORKFLOW_STATES).optional().describe("Filter to one workflow state; omit for all active (non-delivered) ROs."),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Max rows to return (default ${DEFAULT_LIMIT}, hard max ${MAX_LIMIT}).`),
};

export function registerListRepairOrders(server: McpServer): void {
  server.registerTool(
    "list_repair_orders",
    {
      title: "List repair orders",
      description: "Lists the authenticated advisor's active repair orders, optionally filtered to one workflow state. Bounded, deterministically ordered, and PII-minimized.",
      inputSchema: inputShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args, extra) => {
      const scopeError = checkScope(extra, SCOPES.READ);
      if (scopeError) return scopeError;
      return safeToolCall("list_repair_orders", async () => {
        const userId = requireUserId(extra);
        const repository = await RepairOrderRepository.connect();
        const active = await repository.listActive(userId);
        const filtered = args.status ? active.filter((record) => record.state === args.status) : active;
        const limit = clampLimit(args.limit, DEFAULT_LIMIT, MAX_LIMIT);
        return textResult({ total: filtered.length, returned: Math.min(limit, filtered.length), repairOrders: filtered.slice(0, limit).map(summarizeRepairOrder) });
      });
    },
  );
}
