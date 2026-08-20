import type { BlockerRecord, RecommendationRecord, RepairOrderRecord } from "@/lib/ro-repository.server";
import type { ContactPref, RepairOrder, RoStatus, TransportType } from "@/lib/types";

const legacyStatus: Record<RepairOrderRecord["state"], RoStatus> = {
  scheduled: "checked_in", arrived: "checked_in", written: "waiting_technician", dispatched: "waiting_technician",
  diagnosing: "diagnosing", estimate_ready: "recommendations_ready", awaiting_approval: "waiting_approval",
  approved: "approved", repairing: "repair_in_progress", qc: "quality_check", ready: "ready_for_pickup", delivered: "completed",
};

const transportTypes = new Set<TransportType>(["waiting", "shuttle", "rental", "loaner", "dropoff"]);

/** A read-only compatibility projection for existing lane components. */
export function projectRepairOrder(record: RepairOrderRecord, recommendations: RecommendationRecord[], blockers: BlockerRecord[] = []): RepairOrder {
  const vehicle = [record.vehicle.make, record.vehicle.model, record.vehicle.trim].filter(Boolean).join(" ") || "Vehicle";
  const transport = transportTypes.has(record.transportation as TransportType) ? record.transportation as TransportType : "dropoff";
  const contactPref: ContactPref = record.preferredContactMethod === "sms" ? "text" : record.preferredContactMethod === "email" ? "email" : "call";
  const lines = recommendations.map((item) => ({ id: item.id, description: item.description, amount: item.amount, hours: item.laborHours ?? 0, state: item.state }));
  return {
    id: record.id,
    roNumber: record.roNumber,
    customerName: record.customerName,
    customerPhone: record.phone ?? "",
    vehicle,
    year: record.vehicle.year ?? 0,
    mileage: record.vehicle.mileage ?? 0,
    vin: record.vehicle.vin ?? "",
    technician: record.technicianName ?? "Unassigned",
    advisor: "Service Advisor",
    appointmentTime: record.appointmentAt ?? record.stateEnteredAt,
    status: legacyStatus[record.state],
    statusChangedAt: record.stateEnteredAt,
    concern: record.concern ?? "",
    diagnosis: record.diagnosis ?? "",
    lines,
    contactPref,
    lastCustomerUpdate: record.lastCustomerContactAt,
    nextUpdateDue: record.nextUpdateDueAt,
    notes: "",
    transportation: transport,
    promiseTime: record.promiseAt ?? record.stateEnteredAt,
    timeline: [],
    createdAt: record.appointmentAt ?? record.stateEnteredAt,
    techNotes: record.technicianFindings ?? "",
    carryover: record.carryover,
    comeback: record.comeback,
    blockers: blockers.map((blocker) => blocker.type),
  };
}
