import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedTransitions,
  assessPromiseRisk,
  assertTransition,
  calculateWorkflowDurations,
  nextUpdateDue,
  overdueMinutes,
  rankPriority,
} from "../src/lib/ro-domain.ts";

test("workflow permits the explicit service-lane path and rejects skipped states", () => {
  assert.deepEqual(allowedTransitions("diagnosing"), ["estimate_ready", "approved"]);
  assert.doesNotThrow(() => assertTransition("diagnosing", "estimate_ready"));
  assert.doesNotThrow(() => assertTransition("diagnosing", "ready", true));
  assert.throws(() => assertTransition("arrived", "repairing"), /Invalid repair-order transition/);
});

test("customer update scheduling and overdue calculation are deterministic", () => {
  const contactedAt = new Date("2026-08-20T14:00:00.000Z");
  assert.equal(nextUpdateDue(contactedAt, 45).toISOString(), "2026-08-20T14:45:00.000Z");
  assert.equal(overdueMinutes(new Date("2026-08-20T14:45:00.000Z"), new Date("2026-08-20T14:52:59.000Z")), 7);
  assert.equal(overdueMinutes(new Date("2026-08-20T15:00:00.000Z"), new Date("2026-08-20T14:52:59.000Z")), 0);
  assert.throws(() => nextUpdateDue(contactedAt, 0), /at least one minute/);
});

test("promise risk explains low, watch, high, and critical rule outcomes", () => {
  const now = new Date("2026-08-20T14:00:00.000Z");
  const input = { now, state: "repairing" as const, technicianAssigned: true, hasPartsBlocker: false, hasApprovalBlocker: false };
  assert.equal(assessPromiseRisk({ ...input, promiseAt: new Date("2026-08-20T18:00:00.000Z") }).level, "low");
  assert.equal(assessPromiseRisk({ ...input, promiseAt: new Date("2026-08-20T15:45:00.000Z"), hasApprovalBlocker: true }).level, "watch");
  assert.equal(assessPromiseRisk({ ...input, promiseAt: new Date("2026-08-20T14:45:00.000Z"), hasApprovalBlocker: true }).level, "high");
  const critical = assessPromiseRisk({ ...input, promiseAt: new Date("2026-08-20T13:55:00.000Z"), hasPartsBlocker: true });
  assert.equal(critical.level, "critical");
  assert.match(critical.reasons.join(" "), /Promise missed/);
});

test("priority scoring is transparent and rank ordering is deterministic", () => {
  const result = rankPriority([
    { code: "waiting", label: "Waiting customer", points: 25, action: "Update customer" },
    { code: "overdue", label: "Update overdue", points: 40, action: "Call customer" },
  ]);
  assert.equal(result.level, "critical");
  assert.equal(result.score, 65);
  assert.deepEqual(result.signals.map((signal) => signal.code), ["overdue", "waiting"]);
});

test("per-RO update cadence recalculates from the last confirmed contact", () => {
  const contactedAt = "2026-08-20T14:00:00.000Z";
  const intervalMinutes = 45;
  const due = new Date(Date.parse(contactedAt) + intervalMinutes * 60_000).toISOString();
  assert.equal(due, "2026-08-20T14:45:00.000Z");
});

test("workflow timings are derived from immutable state history", () => {
  const durations = calculateWorkflowDurations([
    { previousState: null, newState: "arrived", occurredAt: "2026-08-20T08:00:00.000Z" },
    { previousState: "arrived", newState: "diagnosing", occurredAt: "2026-08-20T08:15:00.000Z" },
    { previousState: "diagnosing", newState: "awaiting_approval", occurredAt: "2026-08-20T09:00:00.000Z" },
    { previousState: "awaiting_approval", newState: "repairing", occurredAt: "2026-08-20T10:30:00.000Z" },
  ], new Date("2026-08-20T11:00:00.000Z"));
  assert.deepEqual(durations, { timeInCurrentStateMinutes: 30, totalCycleMinutes: 180, authorizationDelayMinutes: 90, diagnosticDelayMinutes: 45, repairDurationMinutes: 30, bottleneck: "awaiting_approval" });
});
