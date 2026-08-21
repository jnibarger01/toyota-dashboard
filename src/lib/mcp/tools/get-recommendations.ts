import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { SCOPES } from "../scopes";
import { checkScope, errorResult, requireUserId, safeToolCall, textResult } from "../tool-helpers";

const inputShape = {
  ro_id: z.string().trim().min(1).max(120).describe("The RO's internal id or its human RO number (e.g. \"10482\")."),
};

export function registerGetRecommendations(server: McpServer): void {
  server.registerTool(
    "get_recommendations",
    {
      title: "Get recommendations",
      description: "Recommended/approved/declined line items for a repair order, with amount and approval state.",
      inputSchema: inputShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args, extra) => {
      const scopeError = checkScope(extra, SCOPES.READ);
      if (scopeError) return scopeError;
      return safeToolCall("get_recommendations", async () => {
        const userId = requireUserId(extra);
        const repository = await RepairOrderRepository.connect();
        const record = (await repository.getById(userId, args.ro_id)) ?? (await repository.getByNumber(userId, args.ro_id));
        if (!record) return errorResult("Repair order not found");

        const recommendations = await repository.listRecommendations(userId, record.id);
        return textResult({
          roId: record.id,
          roNumber: record.roNumber,
          recommendations: recommendations.map((rec) => ({ id: rec.id, description: rec.description, amount: rec.amount, laborHours: rec.laborHours, state: rec.state, createdAt: rec.createdAt, decidedAt: rec.decidedAt })),
        });
      });
    },
  );
}
