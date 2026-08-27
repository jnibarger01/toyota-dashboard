import assert from "node:assert/strict";
import test from "node:test";
import { buildFollowUpTriage } from "../src/lib/follow-up-triage.ts";
import type { FollowUp, RepairOrder } from "../src/lib/types.ts";

const ro = (id: string): RepairOrder => ({
  id, roNumber: id, customerName: id, customerPhone: "", vehicle: "Toyota Camry", year: 2024, mileage: 1,
  vin: "", technician: "Tech", advisor: "Advisor", appointmentTime: "2026-08-26T08:00:00.000Z",
  status: "waiting_approval", statusChangedAt: "2026-08-26T08:00:00.000Z", concern: "", diagnosis: "", lines: [],
  contactPref: "call", lastCustomerUpdate: null, nextUpdateDue: null, notes: "", transportation: "dropoff",
  promiseTime: "2026-08-27T15:00:00.000Z", timeline: [], createdAt: "2026-08-26T08:00:00.000Z", techNotes: "",
});

const followUp = (id: string, roId: string, outcome: FollowUp["outcome"], callbackAt: string | null, createdAt = "2026-08-26T08:00:00.000Z"): FollowUp => ({
  id, roId, reason: "customer_callback", label: id, outcome, callbackAt, createdAt, note: "", estimatedOpportunity: 0,
});

test("buildFollowUpTriage groups records and orders each group by priority then stable tie-breakers", () => {
  const records = [
    followUp("open", "ro-open", "open", null),
    followUp("completed", "ro-completed", "completed", "2026-08-20T10:00:00.000Z"),
    followUp("due-late", "ro-due", "later", "2026-08-26T15:00:00.000Z", "2026-08-26T09:00:00.000Z"),
    followUp("overdue", "ro-overdue", "open", "2026-08-25T15:00:00.000Z"),
    followUp("due-early", "ro-due", "open", "2026-08-26T09:00:00.000Z"),
  ];
  const result = buildFollowUpTriage(records, [ro("ro-open"), ro("ro-completed"), ro("ro-due"), ro("ro-overdue")], Date.parse("2026-08-26T08:00:00.000Z"));
  assert.deepEqual(result.map((group) => group.key), ["overdue", "due", "open", "completed"]);
  assert.deepEqual(result.map((group) => group.items.map((item) => item.followUp.id)), [
    ["overdue"], ["due-early", "due-late"], ["open"], ["completed"],
  ]);
  assert.ok((result[0]?.items[0]?.priority ?? 0) > 0);
});

test("buildFollowUpTriage is user-data agnostic and does not invent rows for missing repair orders", () => {
  const result = buildFollowUpTriage([followUp("orphan", "missing", "open", null)], [], Date.parse("2026-08-26T12:00:00.000Z"));
  assert.deepEqual(result.map((group) => group.items), [[], [], [], []]);
});
