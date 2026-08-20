import assert from "node:assert/strict";
import test from "node:test";
import { projectRepairOrder } from "../src/lib/ro-projection.ts";

test("normalized lane projection preserves authoritative workflow and recommendation state", () => {
  const projected = projectRepairOrder({
    id: "ro-1", roNumber: "1001", customerName: "Taylor", preferredName: null, phone: null, email: "taylor@example.test", preferredContactMethod: "email", communicationConsent: "granted",
    vehicle: { vin: null, year: 2024, make: "Toyota", model: "Camry", trim: "XSE", mileage: 1200, licensePlate: null },
    state: "awaiting_approval", previousState: null, stateEnteredAt: "2026-08-20T12:00:00.000Z", appointmentAt: null,
    promiseAt: null, technicianName: null, waitingCustomer: true, carryover: true, comeback: true, transportation: "unknown",
    concern: null, technicianFindings: null, diagnosis: null, partsStatus: "unknown", partsEtaAt: null,
    recommendedTotal: 300, approvedTotal: 0, declinedTotal: 0, lastCustomerContactAt: null, nextUpdateDueAt: null, version: 1, syncStatus: "local-only",
  }, [{ id: "rec-1", description: "Brake service", amount: 300, laborHours: 1, state: "recommended", createdAt: "2026-08-20T12:00:00.000Z", decidedAt: null }], [{ id: "blocker-1", type: "warranty", description: "Awaiting authorization", severity: "high", owner: "Warranty", createdAt: "2026-08-20T12:00:00.000Z", resolvedAt: null }]);
  assert.equal(projected.status, "waiting_approval");
  assert.equal(projected.transportation, "dropoff");
  assert.equal(projected.carryover, true);
  assert.equal(projected.comeback, true);
  assert.equal(projected.contactPref, "email");
  assert.deepEqual(projected.lines, [{ id: "rec-1", description: "Brake service", amount: 300, hours: 1, state: "recommended" }]);
  assert.deepEqual(projected.blockers, ["warranty"]);
});

test("manual intake renders the authoritative written state and server-calculated update due time immediately", () => {
  const projected = projectRepairOrder({
    id: "ro-intake", roNumber: "1002", customerName: "Jamie", preferredName: null, phone: null, email: null, preferredContactMethod: "phone", communicationConsent: "unknown",
    vehicle: { vin: null, year: 2025, make: "Toyota", model: "RAV4", trim: null, mileage: 10, licensePlate: null },
    state: "written", previousState: null, stateEnteredAt: "2026-08-20T18:00:00.000Z", appointmentAt: "2026-08-20T18:00:00.000Z",
    promiseAt: "2026-08-20T20:00:00.000Z", technicianName: null, waitingCustomer: true, carryover: false, comeback: false, transportation: "waiting",
    concern: "Oil change", technicianFindings: null, diagnosis: null, partsStatus: "unknown", partsEtaAt: null,
    recommendedTotal: 0, approvedTotal: 0, declinedTotal: 0, lastCustomerContactAt: null, nextUpdateDueAt: "2026-08-20T18:25:00.000Z", updateIntervalMinutes: 25, version: 1, syncStatus: "local-only",
  }, []);
  assert.equal(projected.status, "waiting_technician");
  assert.equal(projected.nextUpdateDue, "2026-08-20T18:25:00.000Z");
  assert.equal(projected.transportation, "waiting");
});
