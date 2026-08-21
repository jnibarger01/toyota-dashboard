import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { SCOPES } from "../scopes";
import { recordMcpAudit } from "../audit";
import { checkScope, domainErrorResult, requireWriteContext, safeToolCall, textResult } from "../tool-helpers";

const inputShape = {
  repair_order_id: z.string().uuid(),
  blocker_id: z.string().uuid(),
  expected_version: z.number().int().positive(),
};

export function registerResolveRoBlocker(server: McpServer): void {
  server.registerTool(
    "resolve_ro_blocker",
    {
      title: "Resolve repair order blocker",
      description: "Resolves an unresolved blocker on an owned repair order. The blocker row is preserved (resolved_at is set, not deleted) — its history remains visible via get_repair_order's operational history.",
      inputSchema: z.strictObject(inputShape),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args, extra) => {
      const scopeError = checkScope(extra, SCOPES.RO_WRITE);
      if (scopeError) return scopeError;
      return safeToolCall("resolve_ro_blocker", async () => {
        const { userId, tokenId, requestId } = requireWriteContext(extra);
        const { getSql } = await import("../../db.ts");
        const sql = await getSql();
        const repository = new RepairOrderRepository(sql);

        try {
          const updated = await repository.resolveBlocker({
            userId,
            roId: args.repair_order_id,
            blockerId: args.blocker_id,
            expectedVersion: args.expected_version,
            actorId: userId,
            source: "mcp",
          });

          await recordMcpAudit(sql, {
            userId,
            tokenId,
            requestId,
            toolName: "resolve_ro_blocker",
            entityType: "ro_blocker",
            entityId: args.blocker_id,
            previousValue: { resolved: false },
            newValue: { resolved: true },
          });

          return textResult({ roId: updated.id, roNumber: updated.roNumber, version: updated.version, blockerId: args.blocker_id, resolved: true });
        } catch (err) {
          return domainErrorResult(err, [
            "Repair order not found",
            "Repair order changed elsewhere; refresh before resolving the blocker",
            "Active blocker not found",
          ]);
        }
      });
    },
  );
}
