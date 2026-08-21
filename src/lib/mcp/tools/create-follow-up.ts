import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { FollowUpRepository } from "@/lib/follow-up-repository.server";
import { vehicleSummary } from "../privacy";
import { FOLLOW_UP_REASONS } from "../domain-constants";
import { SCOPES } from "../scopes";
import { recordMcpAudit } from "../audit";
import { checkScope, domainErrorResult, errorResult, requireWriteContext, safeToolCall, textResult } from "../tool-helpers";

const inputShape = {
  repair_order_id: z.string().uuid().describe("The RO's internal id (from get_repair_order/list_repair_orders' `roId`)."),
  reason: z.enum(FOLLOW_UP_REASONS),
  label: z.string().trim().min(1).max(200).describe("Short display label, e.g. \"Call after parts arrive\"."),
  due_at: z.string().datetime().optional().describe("ISO 8601 timestamp this follow-up is due."),
  note: z.string().trim().max(4000).optional(),
};

export function registerCreateFollowUp(server: McpServer): void {
  server.registerTool(
    "create_follow_up",
    {
      title: "Create follow-up",
      description: "Creates a service follow-up for a repair order owned by the authenticated advisor.",
      inputSchema: z.strictObject(inputShape),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args, extra) => {
      const scopeError = checkScope(extra, SCOPES.FOLLOWUP_WRITE);
      if (scopeError) return scopeError;
      return safeToolCall("create_follow_up", async () => {
        const { userId, tokenId, requestId } = requireWriteContext(extra);
        const { getSql } = await import("../../db.ts");
        const sql = await getSql();
        const repository = new RepairOrderRepository(sql);
        const followUpRepository = new FollowUpRepository(sql);

        const record = await repository.getById(userId, args.repair_order_id);
        if (!record) return errorResult("Repair order not found");

        try {
          const created = await followUpRepository.create({
            userId,
            roId: args.repair_order_id,
            reason: args.reason,
            label: args.label,
            callbackAt: args.due_at ?? null,
            note: args.note ?? "",
            createdManually: true,
            source: "mcp",
          });

          await recordMcpAudit(sql, {
            userId,
            tokenId,
            requestId,
            toolName: "create_follow_up",
            entityType: "follow_up",
            entityId: created.id,
            previousValue: null,
            newValue: { reason: created.reason, label: created.label, outcome: created.outcome, dueAt: created.callbackAt },
          });

          return textResult({
            followUpId: created.id,
            roNumber: record.roNumber,
            vehicle: vehicleSummary(record.vehicle),
            reason: created.reason,
            label: created.label,
            outcome: created.outcome,
            dueAt: created.callbackAt,
          });
        } catch (err) {
          return domainErrorResult(err, ["Repair order not found"]);
        }
      });
    },
  );
}
