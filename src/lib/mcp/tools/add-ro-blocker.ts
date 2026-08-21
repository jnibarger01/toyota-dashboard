import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { BLOCKER_TYPES } from "@/lib/ro-domain";
import { SCOPES } from "../scopes";
import { recordMcpAudit } from "../audit";
import { checkScope, domainErrorResult, requireWriteContext, safeToolCall, textResult } from "../tool-helpers";

const inputShape = {
  repair_order_id: z.string().uuid(),
  expected_version: z.number().int().positive().describe("The RO's current `version` (from get_repair_order) — prevents overwriting a concurrent change."),
  type: z.enum(BLOCKER_TYPES),
  description: z.string().trim().min(1).max(2000),
  severity: z.enum(["low", "medium", "high", "critical"]),
  owner: z.string().trim().min(1).max(120).optional(),
};

export function registerAddRoBlocker(server: McpServer): void {
  server.registerTool(
    "add_ro_blocker",
    {
      title: "Add repair order blocker",
      description: "Adds a blocker to an owned, active repair order using the existing blocker type/severity model.",
      inputSchema: z.strictObject(inputShape),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args, extra) => {
      const scopeError = checkScope(extra, SCOPES.RO_WRITE);
      if (scopeError) return scopeError;
      return safeToolCall("add_ro_blocker", async () => {
        const { userId, tokenId, requestId } = requireWriteContext(extra);
        const { getSql } = await import("../../db.ts");
        const sql = await getSql();
        const repository = new RepairOrderRepository(sql);

        try {
          const updated = await repository.addBlocker({
            userId,
            roId: args.repair_order_id,
            actorId: userId,
            type: args.type,
            description: args.description,
            severity: args.severity,
            owner: args.owner,
            expectedVersion: args.expected_version,
            source: "mcp",
          });

          // addBlocker returns the updated RO, not the generated blocker row;
          // this is the newest still-open blocker on it, i.e. the one just added.
          const [newest] = await sql.query<{ id: string }>(
            "select id from ro_blockers where ro_id = $1 and resolved_at is null order by created_at desc, id desc limit 1",
            [args.repair_order_id],
          );

          await recordMcpAudit(sql, {
            userId,
            tokenId,
            requestId,
            toolName: "add_ro_blocker",
            entityType: "ro_blocker",
            entityId: newest?.id ?? args.repair_order_id,
            previousValue: null,
            newValue: { type: args.type, severity: args.severity, description: args.description.slice(0, 300), owner: args.owner ?? null },
          });

          return textResult({
            roId: updated.id,
            roNumber: updated.roNumber,
            version: updated.version,
            blocker: { id: newest?.id ?? null, type: args.type, severity: args.severity, description: args.description, owner: args.owner ?? null },
          });
        } catch (err) {
          return domainErrorResult(err, ["Repair order not found", "Repair order changed elsewhere; refresh before adding a blocker"]);
        }
      });
    },
  );
}
