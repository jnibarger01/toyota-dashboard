import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { FollowUpRepository } from "@/lib/follow-up-repository.server";
import { SCOPES } from "../scopes";
import { recordMcpAudit } from "../audit";
import { checkScope, domainErrorResult, errorResult, requireWriteContext, safeToolCall, textResult } from "../tool-helpers";

const inputShape = {
  follow_up_id: z.string().uuid(),
};

export function registerCompleteFollowUp(server: McpServer): void {
  server.registerTool(
    "complete_follow_up",
    {
      title: "Complete follow-up",
      description: "Marks an owned follow-up as completed. Rejects (does not silently no-op) if it is already completed.",
      inputSchema: z.strictObject(inputShape),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args, extra) => {
      const scopeError = checkScope(extra, SCOPES.FOLLOWUP_WRITE);
      if (scopeError) return scopeError;
      return safeToolCall("complete_follow_up", async () => {
        const { userId, tokenId, requestId } = requireWriteContext(extra);
        const { getSql } = await import("../../db.ts");
        const sql = await getSql();
        const repository = new FollowUpRepository(sql);

        const current = await repository.getById(userId, args.follow_up_id);
        if (!current) return errorResult("Follow-up not found");
        if (current.outcome === "completed") return errorResult("Follow-up is already completed");

        try {
          const updated = await repository.setOutcome(userId, args.follow_up_id, "completed", "mcp");

          await recordMcpAudit(sql, {
            userId,
            tokenId,
            requestId,
            toolName: "complete_follow_up",
            entityType: "follow_up",
            entityId: updated.id,
            previousValue: { outcome: current.outcome },
            newValue: { outcome: updated.outcome },
          });

          return textResult({ followUpId: updated.id, roId: updated.roId, outcome: updated.outcome });
        } catch (err) {
          return domainErrorResult(err, ["Follow-up not found"]);
        }
      });
    },
  );
}
