import { lineTotals } from "./format";
import type { AppSettings, RepairOrder } from "./types";

export type Urgency = "critical" | "warn" | "watch" | "ok";

export type PriorityResult = {
  score: number;
  urgency: Urgency;
  action: string;
  stalled: boolean;
  updateOverdue: boolean;
  promiseSoon: boolean;
};

export function isUpdateOverdue(ro: RepairOrder, now: number): boolean {
  if (ro.status === "completed") return false;
  if (!ro.nextUpdateDue) return false;
  return new Date(ro.nextUpdateDue).getTime() <= now;
}

export function promiseApproaching(ro: RepairOrder, now: number): boolean {
  if (ro.status === "completed" || ro.status === "ready_for_pickup") return false;
  const p = new Date(ro.promiseTime).getTime();
  return p - now <= 30 * 60_000 && p >= now - 10 * 60_000;
}

export function minutesInStatus(ro: RepairOrder, now: number): number {
  return (now - new Date(ro.statusChangedAt).getTime()) / 60_000;
}

export function isStalled(ro: RepairOrder, now: number, settings: AppSettings): boolean {
  if (ro.status === "completed") return false;
  const limit = settings.stallMinutes[ro.status] ?? 90;
  return minutesInStatus(ro, now) >= limit;
}

export function getRecommendedAction(ro: RepairOrder): string {
  switch (ro.status) {
    case "checked_in":
      return "Assign a technician and dispatch";
    case "waiting_technician":
      return "Find an open tech — this RO is in queue";
    case "diagnosing":
      return "Check with the technician for a time to finish";
    case "waiting_video":
      return "Ask the tech for the inspection video";
    case "recommendations_ready":
      return "Call the customer with the estimate";
    case "waiting_approval":
      return ro.transportation === "waiting"
        ? "Customer is in the lobby — present the estimate now"
        : "Follow up for authorization";
    case "approved":
      return "Release the work to the technician";
    case "waiting_parts":
      return "Check parts ETA and update the customer";
    case "repair_in_progress":
      return "Confirm the tech still has a finish time";
    case "quality_check":
      return "Close QC and set ready";
    case "ready_for_pickup":
      return "Notify the customer — vehicle is ready";
    case "completed":
      return "Closed";
  }
}

export function computePriority(ro: RepairOrder, now: number, settings: AppSettings): PriorityResult {
  if (ro.status === "completed") {
    return { score: 0, urgency: "ok", action: "Closed", stalled: false, updateOverdue: false, promiseSoon: false };
  }
  let score = 0;
  const updateOverdue = isUpdateOverdue(ro, now);
  const stalled = isStalled(ro, now, settings);
  const promiseSoon = promiseApproaching(ro, now);
  const totals = lineTotals(ro);
  const waitingCustomer = ro.status === "waiting_approval" || ro.status === "recommendations_ready";

  if (updateOverdue) score += 22;
  if (promiseSoon) score += 16;
  if (ro.transportation === "waiting") score += 14;
  if (waitingCustomer) score += 12;
  if (stalled) score += 10;
  if (ro.status === "waiting_parts") score += 8;
  if (ro.status === "ready_for_pickup") score += 9;
  if (totals.recommended >= settings.highDollarThreshold) score += 8;
  if (ro.status === "waiting_technician") score += 6;
  if (!ro.technician || ro.technician === "Unassigned") score += 5;
  const idle = minutesInStatus(ro, now);
  if (idle > 120) score += 6;

  const urgency: Urgency =
    score >= 40 || (updateOverdue && ro.transportation === "waiting")
      ? "critical"
      : score >= 24
        ? "warn"
        : score >= 12
          ? "watch"
          : "ok";

  return {
    score: Math.min(100, score),
    urgency,
    action: getRecommendedAction(ro),
    stalled,
    updateOverdue,
    promiseSoon,
  };
}
