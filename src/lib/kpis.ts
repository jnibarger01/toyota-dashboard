import { lineTotals } from "./format";
import { computePriority, isUpdateOverdue } from "./priority";
import type { AppSettings, RepairOrder } from "./types";

export type LaneKpis = {
  active: number;
  waitingCustomer: number;
  waitingTech: number;
  waitingParts: number;
  ready: number;
  updatesDue: number;
  recommended: number;
  approved: number;
  stalled: number;
  approvalPending: number;
};

export function computeKpis(ros: RepairOrder[], settings: AppSettings, now: number): LaneKpis {
  const open = ros.filter((r) => r.status !== "completed");
  let recommended = 0;
  let approved = 0;
  let updatesDue = 0;
  let stalled = 0;
  for (const ro of open) {
    const t = lineTotals(ro);
    recommended += t.recommended;
    approved += t.approved;
    const pri = computePriority(ro, now, settings);
    if (pri.updateOverdue) updatesDue += 1;
    if (pri.stalled) stalled += 1;
  }
  return {
    active: open.length,
    waitingCustomer: open.filter((r) => r.status === "waiting_approval" || r.status === "recommendations_ready").length,
    waitingTech: open.filter((r) => r.status === "waiting_technician" || r.status === "checked_in").length,
    waitingParts: open.filter((r) => r.status === "waiting_parts").length,
    ready: open.filter((r) => r.status === "ready_for_pickup").length,
    updatesDue,
    recommended,
    approved,
    stalled,
    approvalPending: open.filter((r) => r.status === "waiting_approval").length,
  };
}

export function isWaitingCustomer(ro: RepairOrder): boolean {
  return ro.status === "waiting_approval" || ro.status === "recommendations_ready" || ro.transportation === "waiting";
}

export { isUpdateOverdue };
