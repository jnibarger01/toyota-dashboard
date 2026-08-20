import type { RepairOrderRecord } from "@/lib/ro-repository.server";

/** A deliberately allowlisted fact set. Missing information remains missing. */
export type VerifiedRoFacts = {
  customerName: string;
  vehicle: string;
  state: string;
  technicianFindings?: string;
  diagnosis?: string;
  partsStatus?: string;
  partsEta?: string;
  estimatedCompletion?: string;
  promiseTime?: string;
  approvedTotal?: number;
  declinedTotal?: number;
  lastCustomerContact?: string;
  transportation?: string;
};

export function buildVerifiedRoFacts(ro: RepairOrderRecord): VerifiedRoFacts {
  const vehicle = [ro.vehicle.year, ro.vehicle.make, ro.vehicle.model, ro.vehicle.trim].filter(Boolean).join(" ");
  return {
    customerName: ro.preferredName || ro.customerName,
    vehicle: vehicle || "your vehicle",
    state: ro.state.replaceAll("_", " "),
    ...(ro.technicianFindings ? { technicianFindings: ro.technicianFindings } : {}),
    ...(ro.diagnosis ? { diagnosis: ro.diagnosis } : {}),
    ...(ro.partsStatus !== "unknown" ? { partsStatus: ro.partsStatus } : {}),
    ...(ro.partsEtaAt ? { partsEta: ro.partsEtaAt } : {}),
    ...(ro.promiseAt ? { promiseTime: ro.promiseAt } : {}),
    ...(ro.approvedTotal > 0 ? { approvedTotal: ro.approvedTotal } : {}),
    ...(ro.declinedTotal > 0 ? { declinedTotal: ro.declinedTotal } : {}),
    ...(ro.lastCustomerContactAt ? { lastCustomerContact: ro.lastCustomerContactAt } : {}),
    ...(ro.transportation !== "unknown" ? { transportation: ro.transportation } : {}),
  };
}
