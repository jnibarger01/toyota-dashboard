import type { McpServer } from "@modelcontextprotocol/server";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { FollowUpRepository } from "@/lib/follow-up-repository.server";
import { vehicleSummary } from "../privacy";
import { SCOPES } from "../scopes";
import { checkScope, clampLimit, requireUserId, safeToolCall, textResult } from "../tool-helpers";
import { listFollowUpsInputSchema, paginateFollowUps, FOLLOW_UP_PAGE_DEFAULT_LIMIT, FOLLOW_UP_PAGE_MAX_LIMIT } from "../follow-up-pagination";
const NOTE_MAX_CHARS = 300;
export { listFollowUpsInputSchema, paginateFollowUps } from "../follow-up-pagination";

export function registerListFollowUps(server: McpServer): void {
  server.registerTool(
    "list_follow_ups",
    {
      title: "List follow-ups",
      description: "Lists the advisor's follow-ups, optionally filtered by due date and/or outcome — answers \"who needs a follow-up today?\".",
      inputSchema: listFollowUpsInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args, extra) => {
      const scopeError = checkScope(extra, SCOPES.READ);
      if (scopeError) return scopeError;
      return safeToolCall("list_follow_ups", async () => {
        const input = args;
        const userId = requireUserId(extra);
        const [repository, followUpRepository] = await Promise.all([RepairOrderRepository.connect(), FollowUpRepository.connect()]);
        const [lane, followUps] = await Promise.all([repository.listForLane(userId), followUpRepository.list(userId)]);
        const roById = new Map(lane.map((item) => [item.record.id, item.record]));

        const dueBeforeMs = input.due_before ? Date.parse(input.due_before) : null;
        const filtered = followUps.filter((followUp) => {
          if (input.status && followUp.outcome !== input.status) return false;
          if (dueBeforeMs !== null && (!followUp.callbackAt || Date.parse(followUp.callbackAt) > dueBeforeMs)) return false;
          return true;
        });

        const limit = clampLimit(input.limit, FOLLOW_UP_PAGE_DEFAULT_LIMIT, FOLLOW_UP_PAGE_MAX_LIMIT);
        const offset = input.offset ?? 0;
        const page = paginateFollowUps(filtered, offset, limit);
        return textResult({
          total: page.total,
          returned: page.returned,
          hasMore: page.hasMore,
          nextOffset: page.nextOffset,
          followUps: page.page.map((followUp) => {
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
