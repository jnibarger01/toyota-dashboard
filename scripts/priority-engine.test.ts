import assert from "node:assert/strict";
import test from "node:test";
import { computePriority } from "../src/lib/priority.ts";
import { DEFAULT_SETTINGS, type RepairOrder } from "../src/lib/types.ts";

const now = Date.parse("2026-08-20T18:00:00.000Z");
const base: RepairOrder = {
  id: "ro-1", roNumber: "1001", customerName: "Taylor", customerPhone: "", vehicle: "2025 Camry", year: 2025, mileage: 1000, vin: "", technician: "Avery", advisor: "Advisor", appointmentTime: new Date(now).toISOString(), status: "diagnosing", statusChangedAt: new Date(now - 20 * 60_000).toISOString(), concern: "Concern", diagnosis: "", lines: [], contactPref: "call", lastCustomerUpdate: new Date(now - 20 * 60_000).toISOString(), nextUpdateDue: new Date(now + 70 * 60_000).toISOString(), notes: "", transportation: "dropoff", promiseTime: new Date(now + 5 * 60 * 60_000).toISOString(), timeline: [], createdAt: new Date(now).toISOString(), techNotes: "",
};

function result(patch: Partial<RepairOrder>) {
  return computePriority({ ...base, ...patch }, now, DEFAULT_SETTINGS);
}

test("priority engine flags each advisor exception with an explainable signal", () => {
  assert.ok(result({ nextUpdateDue: new Date(now - 1).toISOString() }).signals.some((signal) => signal.code === "customer_update_overdue"));
  assert.ok(result({ status: "waiting_approval" }).signals.some((signal) => signal.code === "approval_waiting"));
  assert.ok(result({ transportation: "waiting" }).signals.some((signal) => signal.code === "waiting_customer"));
  assert.ok(result({ statusChangedAt: new Date(now - 3 * 60 * 60_000).toISOString() }).signals.some((signal) => signal.code === "stalled"));
  assert.ok(result({ status: "waiting_parts" }).signals.some((signal) => signal.code === "parts_hold"));
  assert.ok(result({ status: "waiting_parts", promiseTime: new Date(now - 1).toISOString() }).signals.some((signal) => signal.code === "promise_critical"));
});

test("priority ordering favors compounding customer and promise risk over a single low-value signal", () => {
  const low = result({ lines: [{ id: "rec", description: "Filter", amount: DEFAULT_SETTINGS.highDollarThreshold, hours: 0, state: "recommended" }] });
  const urgent = result({ status: "waiting_approval", transportation: "waiting", nextUpdateDue: new Date(now - 10 * 60_000).toISOString(), promiseTime: new Date(now - 1).toISOString() });
  assert.ok(urgent.score > low.score);
  assert.equal(urgent.urgency, "critical");
  assert.equal(urgent.signals[0]?.code, "promise_critical");
});
