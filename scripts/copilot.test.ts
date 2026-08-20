import assert from "node:assert/strict";
import test from "node:test";
import { queryAdvisorLane, summarizeRecentChanges } from "../src/lib/copilot.ts";
import { DEFAULT_SETTINGS, type RepairOrder } from "../src/lib/types.ts";

const now = Date.parse("2026-08-20T18:00:00.000Z");
const base: RepairOrder = {
  id: "ro-1", roNumber: "45281", customerName: "Taylor", customerPhone: "", vehicle: "2024 Camry", year: 2024, mileage: 1200, vin: "", technician: "Avery", advisor: "Advisor", appointmentTime: new Date(now).toISOString(), status: "waiting_approval", statusChangedAt: new Date(now - 80 * 60_000).toISOString(), concern: "Brake concern", diagnosis: "", lines: [], contactPref: "call", lastCustomerUpdate: new Date(now - 100 * 60_000).toISOString(), nextUpdateDue: new Date(now - 10 * 60_000).toISOString(), notes: "", transportation: "dropoff", promiseTime: new Date(now + 30 * 60_000).toISOString(), timeline: [], createdAt: new Date(now).toISOString(), techNotes: "",
};

function lane(...patches: Array<Partial<RepairOrder>>): RepairOrder[] {
  return patches.map((patch, index) => ({ ...base, id: `ro-${index + 1}`, roNumber: String(45281 + index), ...patch }));
}

test("copilot queries use bounded, deterministic filters for operational questions", () => {
  const ros = lane(
    { carryover: true, lines: [{ id: "declined", description: "Brake service", amount: 1800, hours: 1, state: "declined" }] },
    { status: "waiting_technician", technician: "Unassigned", customerName: "Jordan" },
    { status: "ready_for_pickup", lastCustomerUpdate: new Date(now - 40 * 60_000).toISOString(), customerName: "Morgan" },
  );
  assert.deepEqual(queryAdvisorLane("Show my carryovers", ros, DEFAULT_SETTINGS, now).roIds, ["ro-1"]);
  assert.deepEqual(queryAdvisorLane("Show high-dollar declined work", ros, DEFAULT_SETTINGS, now).roIds, ["ro-1"]);
  assert.deepEqual(queryAdvisorLane("Which ROs are waiting on technicians?", ros, DEFAULT_SETTINGS, now).roIds, ["ro-2"]);
  assert.deepEqual(queryAdvisorLane("Which repairs are finished but customers have not been contacted?", ros, DEFAULT_SETTINGS, now).roIds, ["ro-3"]);
});

test("copilot supports time-bounded promise and contact-gap queries", () => {
  const ros = lane(
    { promiseTime: "2026-08-20T19:30:00.000Z", status: "waiting_parts", customerName: "Risky" },
    { promiseTime: "2026-08-20T22:00:00.000Z", status: "waiting_parts", customerName: "Later" },
    { status: "diagnosing", lastCustomerUpdate: "2026-08-20T12:30:00.000Z", nextUpdateDue: "2026-08-20T16:00:00.000Z", customerName: "No contact" },
  );
  assert.deepEqual(queryAdvisorLane("Show anything promised before 3 PM that's at risk", ros, DEFAULT_SETTINGS, now).roIds, ["ro-1"]);
  assert.deepEqual(queryAdvisorLane("Who have I not contacted in more than an hour?", ros, DEFAULT_SETTINGS, now).roIds.toSorted(), ["ro-1", "ro-2", "ro-3"]);
});

test("what changed digest is chronological and never returns the entire audit log", () => {
  const answer = summarizeRecentChanges([
    { roId: "later", roNumber: "45283", customerName: "Later", type: "status_changed", occurredAt: "2026-08-20T18:03:00.000Z" },
    { roId: "first", roNumber: "45281", customerName: "First", type: "customer_contacted", occurredAt: "2026-08-20T18:01:00.000Z" },
    { roId: "second", roNumber: "45282", customerName: "Second", type: "blocker_added", occurredAt: "2026-08-20T18:02:00.000Z" },
    { roId: "fourth", roNumber: "45284", customerName: "Fourth", type: "ro_created", occurredAt: "2026-08-20T18:04:00.000Z" },
    { roId: "fifth", roNumber: "45285", customerName: "Fifth", type: "recommendation_added", occurredAt: "2026-08-20T18:05:00.000Z" },
    { roId: "sixth", roNumber: "45286", customerName: "Sixth", type: "parts_updated", occurredAt: "2026-08-20T18:06:00.000Z" },
  ]);
  assert.deepEqual(answer.roIds, ["first", "second", "later", "fourth", "fifth"]);
  assert.match(answer.summary, /^RO 45281/);
  assert.doesNotMatch(answer.summary, /45286/);
});
