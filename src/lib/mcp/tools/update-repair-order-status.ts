import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { WORKFLOW_STATES } from "@/lib/ro-domain";
import { SCOPES } from "../scopes";
import { recordMcpAudit } from "../audit";
import { checkScope, domainErrorResult, requireWriteContext, safeToolCall, textResult } from "../tool-helpers";

const inputShape = {
  repair_order_id: z.string().uuid(),
  status: z.enum(WORKFLOW_STATES),
  expected_version: z.number().int().positive(),
  reason: z.string().trim().min(1).max(600).optional(),
};

export function registerUpdateRepairOrderStatus(server: McpServer): void {
  server.registerTool(
    "update_repair_order_status",
    {
      title: "Update repair order status",
      description:
        "Moves an owned repair order to a new workflow status. Only legal transitions (the same state machine the dashboard enforces — see ro-domain.ts) are accepted; there is no override/bypass exposed here, unlike the dashboard's advisor-correction path.",
      inputSchema: z.strictObject(inputShape),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args, extra) => {
      const scopeError = checkScope(extra, SCOPES.RO_WRITE);
      if (scopeError) return scopeError;
      return safeToolCall("update_repair_order_status", async () => {
        const { userId, tokenId, requestId } = requireWriteContext(extra);
        const { getSql } = await import("../../db.ts");
        const sql = await getSql();
        const repository = new RepairOrderRepository(sql);

        try {
          const updated = await repository.transition({
            userId,
            roId: args.repair_order_id,
            to: args.status,
            expectedVersion: args.expected_version,
            actorId: userId,
            source: "mcp",
            reason: args.reason,
          });

          await recordMcpAudit(sql, {
            userId,
            tokenId,
            requestId,
            toolName: "update_repair_order_status",
            entityType: "repair_order",
            entityId: updated.id,
            previousValue: { state: updated.previousState },
            newValue: { state: updated.state },
          });

          return textResult({ roId: updated.id, roNumber: updated.roNumber, previousState: updated.previousState, status: updated.state, version: updated.version });
        } catch (err) {
          return domainErrorResult(err, [
            "Repair order not found",
            "Repair order changed elsewhere; refresh before trying again",
            /^Invalid repair-order transition: /,
          ]);
        }
      });
    },
  );
}
