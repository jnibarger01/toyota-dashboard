import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { SCOPES } from "../scopes";
import { recordMcpAudit } from "../audit";
import { checkScope, domainErrorResult, errorResult, requireWriteContext, safeToolCall, textResult } from "../tool-helpers";

// The actual schema (ro_recommendations.state) only has these three values —
// "recommended" is the pending/default state. No "deferred"/"pending" exist
// as distinct states; per the existing domain model, "recommended" IS pending.
const RECOMMENDATION_STATES = ["recommended", "approved", "declined"] as const;

const inputShape = {
  repair_order_id: z.string().uuid(),
  recommendation_id: z.string().uuid(),
  status: z.enum(RECOMMENDATION_STATES),
  expected_version: z.number().int().positive().describe("The RO's current `version` — recommendation decisions are locked under the RO's own optimistic version."),
};

export function registerUpdateRecommendationStatus(server: McpServer): void {
  server.registerTool(
    "update_recommendation_status",
    {
      title: "Update recommendation status",
      description: "Sets a recommendation's approval state (recommended | approved | declined) on an owned repair order. Uses the existing recommendation schema — no additional states are invented.",
      inputSchema: z.strictObject(inputShape),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args, extra) => {
      const scopeError = checkScope(extra, SCOPES.RECOMMENDATION_WRITE);
      if (scopeError) return scopeError;
      return safeToolCall("update_recommendation_status", async () => {
        const { userId, tokenId, requestId } = requireWriteContext(extra);
        const { getSql } = await import("../../db.ts");
        const sql = await getSql();
        const repository = new RepairOrderRepository(sql);

        let existing;
        try {
          existing = await repository.listRecommendations(userId, args.repair_order_id);
        } catch (err) {
          return domainErrorResult(err, ["Repair order not found"]);
        }
        const before = existing.find((rec) => rec.id === args.recommendation_id);
        if (!before) return errorResult("Recommendation not found");

        try {
          const updated = await repository.decideRecommendation({
            userId,
            roId: args.repair_order_id,
            id: args.recommendation_id,
            state: args.status,
            expectedVersion: args.expected_version,
            actorId: userId,
            source: "mcp",
          });

          await recordMcpAudit(sql, {
            userId,
            tokenId,
            requestId,
            toolName: "update_recommendation_status",
            entityType: "recommendation",
            entityId: args.recommendation_id,
            previousValue: { state: before.state },
            newValue: { state: args.status },
          });

          return textResult({ roId: updated.id, roNumber: updated.roNumber, version: updated.version, recommendationId: args.recommendation_id, status: args.status });
        } catch (err) {
          return domainErrorResult(err, ["Recommendation changed elsewhere; refresh before trying again"]);
        }
      });
    },
  );
}
