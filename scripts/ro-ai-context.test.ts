import assert from "node:assert/strict";
import test from "node:test";
import { buildVerifiedRoFacts } from "../src/lib/ro-ai-context.ts";

test("verified AI context omits missing facts instead of manufacturing customer-facing detail", () => {
  const facts = buildVerifiedRoFacts({
    customerName: "Taylor", preferredName: null,
    vehicle: { year: 2025, make: "Toyota", model: "Camry", trim: null },
    state: "awaiting_approval", technicianFindings: null, diagnosis: null,
    partsStatus: "unknown", partsEtaAt: null, promiseAt: null,
    approvedTotal: 0, declinedTotal: 0, lastCustomerContactAt: null, transportation: "unknown",
  } as never);
  assert.deepEqual(facts, { customerName: "Taylor", vehicle: "2025 Toyota Camry", state: "awaiting approval" });
  assert.equal("partsEta" in facts, false);
  assert.equal("approvedTotal" in facts, false);
  assert.equal("promiseTime" in facts, false);
});

test("verified AI context passes through only explicitly stored facts", () => {
  const facts = buildVerifiedRoFacts({
    customerName: "Taylor", preferredName: "Tay",
    vehicle: { year: 2025, make: "Toyota", model: "Camry", trim: "XSE" },
    state: "repairing", technicianFindings: "Brake pads measure 2 mm", diagnosis: "Pads worn",
    partsStatus: "ordered", partsEtaAt: "2026-08-20T20:00:00.000Z", promiseAt: "2026-08-20T21:00:00.000Z",
    approvedTotal: 450, declinedTotal: 80, lastCustomerContactAt: "2026-08-20T18:00:00.000Z", transportation: "loaner",
  } as never);
  assert.equal(facts.customerName, "Tay");
  assert.equal(facts.technicianFindings, "Brake pads measure 2 mm");
  assert.equal(facts.approvedTotal, 450);
  assert.equal(facts.transportation, "loaner");
  assert.equal("warranty" in facts, false);
  assert.equal("discount" in facts, false);
  assert.equal("safetyConsequence" in facts, false);
});
