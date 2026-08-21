import type { McpServer } from "@modelcontextprotocol/server";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { FollowUpRepository } from "@/lib/follow-up-repository.server";
import { projectRepairOrder } from "@/lib/ro-projection";
import { computePriority } from "@/lib/priority";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type { WorkflowState } from "@/lib/ro-domain";
import { vehicleSummary } from "../privacy";
import { SCOPES } from "../scopes";
import { checkScope, requireUserId, safeToolCall, textResult } from "../tool-helpers";
import { LANE_UI_URI } from "../ui";

const STATE_BUCKET: Record<WorkflowState, "waiting" | "in_progress" | "awaiting_approval" | "ready"> = {
  scheduled: "waiting",
  arrived: "waiting",
  written: "waiting",
  dispatched: "in_progress",
  diagnosing: "in_progress",
  estimate_ready: "awaiting_approval",
  awaiting_approval: "awaiting_approval",
  approved: "in_progress",
  repairing: "in_progress",
  qc: "in_progress",
  ready: "ready",
  delivered: "ready",
};

export function registerGetLaneSummary(server: McpServer): void {
  server.registerTool(
    "get_lane_summary",
    {
      title: "Get lane summary",
      description:
        "Current service-lane operational picture for the authenticated advisor: active RO counts by stage, blocked count, overdue follow-up count, the oldest waiting RO, and the ROs most needing immediate attention. Compact and operational — no customer PII.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: LANE_UI_URI }, "openai/outputTemplate": LANE_UI_URI, "openai/widgetAccessible": true },
    },
    (extra) => {
      const scopeError = checkScope(extra, SCOPES.READ);
      if (scopeError) return scopeError;
      return safeToolCall("get_lane_summary", async () => {
        const userId = requireUserId(extra);
        const repository = await RepairOrderRepository.connect();
        const lane = await repository.listForLane(userId);
        const now = Date.now();

        const active = lane.filter((item) => item.record.state !== "delivered");
        const counts = { waiting: 0, in_progress: 0, awaiting_approval: 0, ready: 0 };
        for (const item of active) counts[STATE_BUCKET[item.record.state]] += 1;

        const blockedCount = active.filter((item) => item.blockers.length > 0).length;

        let oldestWaiting: { roNumber: string; vehicle: string; waitingMinutes: number } | null = null;
        for (const item of active) {
          const enteredAt = Date.parse(item.record.stateEnteredAt);
          if (Number.isNaN(enteredAt)) continue;
          const waitingMinutes = Math.floor((now - enteredAt) / 60_000);
          if (!oldestWaiting || waitingMinutes > oldestWaiting.waitingMinutes) {
            oldestWaiting = { roNumber: item.record.roNumber, vehicle: vehicleSummary(item.record.vehicle), waitingMinutes };
          }
        }

        const followUpRepository = await FollowUpRepository.connect();
        const followUps = await followUpRepository.list(userId);
        const overdueFollowUpCount = followUps.filter(
          (followUp) => followUp.outcome === "open" && followUp.callbackAt && Date.parse(followUp.callbackAt) <= now,
        ).length;

        // DEFAULT_SETTINGS deliberately, not AdvisorSettingsRepository.get() —
        // that method inserts a default settings row on first read, and a
        // read-only MCP tool must never have a write side effect.
        const needsAttention = active
          .map((item) => {
            const projected = projectRepairOrder(item.record, item.recommendations, item.blockers);
            return {
              roNumber: item.record.roNumber,
              vehicle: vehicleSummary(item.record.vehicle),
              priority: computePriority(projected, now, DEFAULT_SETTINGS),
            };
          })
          .filter((entry) => entry.priority.urgency === "critical" || entry.priority.urgency === "warn")
          .sort((a, b) => b.priority.score - a.priority.score)
          .slice(0, 5)
          .map((entry) => ({ roNumber: entry.roNumber, vehicle: entry.vehicle, urgency: entry.priority.urgency, action: entry.priority.action }));

        return textResult({
          activeCount: active.length,
          counts,
          blockedCount,
          overdueFollowUpCount,
          oldestWaiting,
          needsAttention,
        });
      });
    },
  );
}
