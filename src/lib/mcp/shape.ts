import type { BlockerRecord, RepairOrderRecord } from "@/lib/ro-repository.server";
import { maskCustomerName, vehicleSummary } from "./privacy";

/** Compact, PII-minimized operational summary shared by list/search tools. */
export function summarizeRepairOrder(record: RepairOrderRecord) {
  return {
    roId: record.id,
    roNumber: record.roNumber,
    customer: maskCustomerName(record.customerName),
    vehicle: vehicleSummary(record.vehicle),
    state: record.state,
    waitingCustomer: record.waitingCustomer,
    transportation: record.transportation,
    promiseAt: record.promiseAt,
    nextUpdateDueAt: record.nextUpdateDueAt,
    partsStatus: record.partsStatus,
  };
}

export function summarizeBlocker(blocker: BlockerRecord) {
  return { type: blocker.type, description: blocker.description, severity: blocker.severity, owner: blocker.owner, createdAt: blocker.createdAt };
}
