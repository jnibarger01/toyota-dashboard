import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { FollowUpRepository } from "@/lib/follow-up-repository.server";
import { maskCustomerName, vehicleSummary } from "../privacy";
import { summarizeBlocker } from "../shape";
import { SCOPES } from "../scopes";
import { checkScope, errorResult, requireUserId, safeToolCall, textResult } from "../tool-helpers";
import { LANE_UI_URI } from "../ui";

const inputShape = {
  ro_id: z.string().trim().min(1).max(120).describe("The RO's internal id or its human RO number (e.g. \"10482\")."),
};

export function registerGetRepairOrder(server: McpServer): void {
  server.registerTool(
    "get_repair_order",
    {
      title: "Get repair order",
      description:
        "Operational summary for a single repair order: vehicle, status, timestamps, open blockers, recommendations, communication state, and follow-up state. Never returns full customer PII. `version` is included so it can be passed as `expected_version` to the write tools.",
      inputSchema: inputShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: LANE_UI_URI }, "openai/widgetAccessible": true },
    },
    (args, extra) => {
      const scopeError = checkScope(extra, SCOPES.READ);
      if (scopeError) return scopeError;
      return safeToolCall("get_repair_order", async () => {
        const userId = requireUserId(extra);
        const repository = await RepairOrderRepository.connect();
        // `ro_id` may be the internal id or the human RO number — both are
        // safe to try as parameterized lookups regardless of which was sent.
        const record = (await repository.getById(userId, args.ro_id)) ?? (await repository.getByNumber(userId, args.ro_id));
        if (!record) return errorResult("Repair order not found");

        const [recommendations, history, followUps] = await Promise.all([
          repository.listRecommendations(userId, record.id),
          repository.getOperationalHistory(userId, record.id),
          (await FollowUpRepository.connect()).list(userId),
        ]);

        const openBlockers = history.blockers.filter((blocker) => !blocker.resolvedAt).map(summarizeBlocker);
        // Communication *state* only — method/timing/outcome, never message bodies.
        const externalContacts = history.communications.filter((item) => item.direction !== "internal");
        const lastContact = externalContacts[0]
          ? { method: externalContacts[0].method, occurredAt: externalContacts[0].occurredAt, outcome: externalContacts[0].outcome, sent: externalContacts[0].sent }
          : null;

        const roFollowUps = followUps.filter((followUp) => followUp.roId === record.id);
        const openFollowUps = roFollowUps.filter((followUp) => followUp.outcome === "open");
        const nextFollowUpDue = openFollowUps.reduce<string | null>((earliest, followUp) => {
          if (!followUp.callbackAt) return earliest;
          if (!earliest || Date.parse(followUp.callbackAt) < Date.parse(earliest)) return followUp.callbackAt;
          return earliest;
        }, null);

        return textResult({
          roId: record.id,
          roNumber: record.roNumber,
          version: record.version,
          customer: maskCustomerName(record.customerName),
          vehicle: vehicleSummary(record.vehicle),
          status: {
            state: record.state,
            previousState: record.previousState,
            stateEnteredAt: record.stateEnteredAt,
            appointmentAt: record.appointmentAt,
            promiseAt: record.promiseAt,
            waitingCustomer: record.waitingCustomer,
            transportation: record.transportation,
          },
          operational: {
            technicianName: record.technicianName,
            concern: record.concern,
            diagnosis: record.diagnosis,
            technicianFindings: record.technicianFindings,
            partsStatus: record.partsStatus,
            partsEtaAt: record.partsEtaAt,
          },
          financial: { recommendedTotal: record.recommendedTotal, approvedTotal: record.approvedTotal, declinedTotal: record.declinedTotal },
          blockers: openBlockers,
          recommendations: recommendations.map((rec) => ({ id: rec.id, description: rec.description, amount: rec.amount, laborHours: rec.laborHours, state: rec.state, createdAt: rec.createdAt, decidedAt: rec.decidedAt })),
          communication: { lastContact, totalContacts: externalContacts.length },
          followUps: { openCount: openFollowUps.length, nextDueAt: nextFollowUpDue },
        });
      });
    },
  );
}
