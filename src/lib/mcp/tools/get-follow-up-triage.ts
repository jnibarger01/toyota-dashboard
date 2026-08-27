import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { FollowUpRepository } from "@/lib/follow-up-repository.server";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { projectRepairOrder } from "@/lib/ro-projection";
import { buildFollowUpTriage } from "@/lib/follow-up-triage";
import { maskCustomerName } from "../privacy";
import { checkScope, requireUserId, safeToolCall, textResult } from "../tool-helpers";
import { SCOPES } from "../scopes";

const inputSchema = z.strictObject({});

export function registerGetFollowUpTriage(server: McpServer): void {
  server.registerTool("get_follow_up_triage", {
    title: "Get follow-up triage board",
    description: "Returns the authenticated advisor's follow-ups grouped as overdue, due today, open, and completed, with deterministic priority ordering.",
    inputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (_args, extra) => {
    const scopeError = checkScope(extra, SCOPES.READ);
    if (scopeError) return scopeError;
    return safeToolCall("get_follow_up_triage", async () => {
      const userId = requireUserId(extra);
      const [ros, followUps] = await Promise.all([(await RepairOrderRepository.connect()).listForLane(userId), (await FollowUpRepository.connect()).list(userId)]);
      const board = buildFollowUpTriage(followUps, ros.map((item) => projectRepairOrder(item.record, item.recommendations, item.blockers)), Date.now());
      return textResult({ groups: board.map((group) => ({ key: group.key, label: group.label, count: group.items.length, items: group.items.map(({ followUp, ro, priority }) => ({ id: followUp.id, roId: ro.id, roNumber: ro.roNumber, customer: maskCustomerName(ro.customerName), label: followUp.label, outcome: followUp.outcome, dueAt: followUp.callbackAt, priority })) })) });
    });
  });
}
