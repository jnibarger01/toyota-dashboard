import { lineTotals } from "./format.ts";
import { assessPromiseRisk, rankPriority, type PromiseRiskLevel, type PrioritySignal } from "./ro-domain.ts";
import type { AppSettings, RepairOrder } from "./types.ts";

export type Urgency = "critical" | "warn" | "watch" | "ok";

export type PriorityResult = {
  score: number;
  urgency: Urgency;
  action: string;
  stalled: boolean;
  updateOverdue: boolean;
  promiseSoon: boolean;
  promiseRisk: PromiseRiskLevel;
  reasons: string[];
  signals: PrioritySignal[];
};

const WORKFLOW_BY_LEGACY_STATUS = {
  checked_in: "arrived", waiting_technician: "written", diagnosing: "diagnosing", waiting_video: "diagnosing",
  recommendations_ready: "estimate_ready", waiting_approval: "awaiting_approval", approved: "approved",
  waiting_parts: "repairing", repair_in_progress: "repairing", quality_check: "qc", ready_for_pickup: "ready", completed: "delivered",
} as const;

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
    return { score: 0, urgency: "ok", action: "Closed", stalled: false, updateOverdue: false, promiseSoon: false, promiseRisk: "low", reasons: [], signals: [] };
  }
  const updateOverdue = isUpdateOverdue(ro, now);
  const stalled = isStalled(ro, now, settings);
  const promiseSoon = promiseApproaching(ro, now);
  const totals = lineTotals(ro);
  const waitingCustomer = ro.status === "waiting_approval" || ro.status === "recommendations_ready";
  const promise = assessPromiseRisk({
    promiseAt: new Date(ro.promiseTime), now: new Date(now), state: WORKFLOW_BY_LEGACY_STATUS[ro.status],
    technicianAssigned: Boolean(ro.technician && ro.technician !== "Unassigned"), hasPartsBlocker: ro.status === "waiting_parts" || Boolean(ro.blockers?.includes("parts")),
    hasApprovalBlocker: ro.status === "waiting_approval" || Boolean(ro.blockers?.includes("customer_approval")), requiresQc: true,
  });
  const signals: PrioritySignal[] = [];
  if (updateOverdue) signals.push({ code: "customer_update_overdue", label: `Customer update overdue by ${Math.ceil((now - new Date(ro.nextUpdateDue!).getTime()) / 60_000)}m`, points: 30, action: "Generate and confirm an update" });
  if (promise.level === "critical") signals.push({ code: "promise_critical", label: "Promise time is missed or critically at risk", points: 34, action: "Review promise and recover the plan" });
  else if (promise.level === "high") signals.push({ code: "promise_high", label: "Promise time is at risk", points: 22, action: "Confirm a realistic completion time" });
  else if (promiseSoon) signals.push({ code: "promise_approaching", label: "Promise time is approaching", points: 12, action: "Confirm next milestone" });
  if (ro.transportation === "waiting") signals.push({ code: "waiting_customer", label: "Customer is waiting", points: 20, action: "Address the customer now" });
  if (waitingCustomer) signals.push({ code: "approval_waiting", label: "Estimate needs customer approval", points: 18, action: "Review estimate and contact customer" });
  if (stalled) signals.push({ code: "stalled", label: "No progress beyond the configured state threshold", points: 14, action: getRecommendedAction(ro) });
  if (ro.status === "waiting_parts") signals.push({ code: "parts_hold", label: "Parts are holding work", points: 14, action: "Check parts ETA and update customer" });
  for (const blocker of ro.blockers ?? []) {
    if (blocker === "parts" || blocker === "customer_approval") continue;
    signals.push({ code: `blocker_${blocker}`, label: `${blocker.replaceAll("_", " ")} blocker is unresolved`, points: 12, action: "Resolve the blocker or update its owner" });
  }
  if (ro.status === "ready_for_pickup") signals.push({ code: "ready_unclaimed", label: "Vehicle is ready for customer", points: 15, action: "Notify customer and arrange pickup" });
  if (totals.recommended >= settings.highDollarThreshold) signals.push({ code: "high_dollar", label: "High-dollar recommendation needs follow-up", points: 8, action: "Review the recommendation" });
  if (ro.status === "waiting_technician" || ro.status === "checked_in") signals.push({ code: "tech_assignment", label: "RO needs technician attention", points: 10, action: getRecommendedAction(ro) });
  if (!ro.technician || ro.technician === "Unassigned") signals.push({ code: "unassigned_tech", label: "No technician assigned", points: 10, action: "Assign a technician" });
  if (minutesInStatus(ro, now) > 120) signals.push({ code: "long_state", label: "RO has been in its current state more than two hours", points: 8, action: getRecommendedAction(ro) });

  const ranked = rankPriority(signals);
  const urgency: Urgency = ranked.level === "critical" ? "critical" : ranked.level === "high" ? "warn" : ranked.level === "medium" ? "watch" : "ok";

  return {
    score: ranked.score,
    urgency,
    action: getRecommendedAction(ro),
    stalled,
    updateOverdue,
    promiseSoon,
    promiseRisk: promise.level,
    reasons: [...promise.reasons, ...ranked.signals.map((signal) => signal.label)],
    signals: ranked.signals,
  };
}
