import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { FollowUpRepository } from "@/lib/follow-up-repository.server";
import { vehicleSummary } from "../privacy";
import { FOLLOW_UP_OUTCOMES } from "../domain-constants";
import { SCOPES } from "../scopes";
import { checkScope, clampLimit, requireUserId, safeToolCall, textResult } from "../tool-helpers";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const NOTE_MAX_CHARS = 300;

const inputShape = {
  due_before: z.string().datetime().optional().describe("ISO 8601 timestamp; only follow-ups due at or before this time."),
  status: z.enum(FOLLOW_UP_OUTCOMES).optional().describe("Filter to one outcome; omit for all."),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Max rows to return (default ${DEFAULT_LIMIT}, hard max ${MAX_LIMIT}).`),
};

export function registerListFollowUps(server: McpServer): void {
  server.registerTool(
    "list_follow_ups",
    {
      title: "List follow-ups",
      description: "Lists the advisor's follow-ups, optionally filtered by due date and/or outcome — answers \"who needs a follow-up today?\".",
      inputSchema: inputShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args, extra) => {
      const scopeError = checkScope(extra, SCOPES.READ);
      if (scopeError) return scopeError;
      return safeToolCall("list_follow_ups", async () => {
        const userId = requireUserId(extra);
        const [repository, followUpRepository] = await Promise.all([RepairOrderRepository.connect(), FollowUpRepository.connect()]);
        const [lane, followUps] = await Promise.all([repository.listForLane(userId), followUpRepository.list(userId)]);
        const roById = new Map(lane.map((item) => [item.record.id, item.record]));

        const dueBeforeMs = args.due_before ? Date.parse(args.due_before) : null;
        const filtered = followUps.filter((followUp) => {
          if (args.status && followUp.outcome !== args.status) return false;
          if (dueBeforeMs !== null && (!followUp.callbackAt || Date.parse(followUp.callbackAt) > dueBeforeMs)) return false;
          return true;
        });

        const limit = clampLimit(args.limit, DEFAULT_LIMIT, MAX_LIMIT);
        return textResult({
          total: filtered.length,
          returned: Math.min(limit, filtered.length),
          followUps: filtered.slice(0, limit).map((followUp) => {
            const ro = roById.get(followUp.roId);
            return {
              id: followUp.id,
              roNumber: ro?.roNumber ?? null,
              vehicle: ro ? vehicleSummary(ro.vehicle) : null,
              reason: followUp.reason,
              label: followUp.label,
              outcome: followUp.outcome,
              dueAt: followUp.callbackAt,
              estimatedOpportunity: followUp.estimatedOpportunity,
              note: followUp.note.length > NOTE_MAX_CHARS ? `${followUp.note.slice(0, NOTE_MAX_CHARS)}…` : followUp.note,
            };
          }),
        });
      });
    },
  );
}
