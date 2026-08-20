import { computePriority, isUpdateOverdue } from "./priority";
import { vehicleLabel } from "./format";
import type { AppSettings, FollowUp, RepairOrder } from "./types";

export type DerivedFollowUp = {
  key: string;
  ro: RepairOrder;
  reason: FollowUp["reason"];
  label: string;
  score: number;
};

const REASON_RANK: Record<FollowUp["reason"], number> = {
  authorization: 0,
  ready: 1,
  diagnosis_done: 2,
  parts_eta: 3,
  update_overdue: 4,
  declined: 5,
  manual: 6,
};

export function deriveFollowUps(
  ros: RepairOrder[],
  followUps: FollowUp[],
  settings: AppSettings,
  now: number,
): DerivedFollowUp[] {
  const dismissed = new Set(
    followUps.filter((f) => f.outcome === "completed" || f.outcome === "later").map((f) => `${f.roId}:${f.reason}`),
  );
  const out: DerivedFollowUp[] = [];

  for (const ro of ros) {
    if (ro.status === "completed") continue;
    const pri = computePriority(ro, now, settings);
    const candidates: { reason: FollowUp["reason"]; label: string }[] = [];

    if (ro.status === "waiting_approval" || ro.status === "recommendations_ready") {
      candidates.push({ reason: "authorization", label: "Needs approval" });
    }
    if (ro.status === "ready_for_pickup") {
      candidates.push({ reason: "ready", label: "Ready — notify customer" });
    }
    if (ro.status === "waiting_parts") {
      candidates.push({ reason: "parts_eta", label: "Parts ETA update" });
    }
    if (ro.status === "diagnosing" || ro.status === "waiting_video") {
      /* tech-side, not a customer follow-up unless overdue */
    }
    if (ro.lines.some((l) => l.state === "declined") && ro.status !== "ready_for_pickup") {
      candidates.push({ reason: "declined", label: "Declined work on file" });
    }

    const hasPrimary = candidates.length > 0;
    if (isUpdateOverdue(ro, now) && !hasPrimary) {
      candidates.push({ reason: "update_overdue", label: "Update overdue" });
    }

    for (const c of candidates) {
      const key = `${ro.id}:${c.reason}`;
      if (dismissed.has(key)) continue;
      out.push({
        key,
        ro,
        reason: c.reason,
        label: `${c.label} · ${vehicleLabel(ro)}`,
        score: pri.score,
      });
    }
  }

  for (const f of followUps) {
    if (f.outcome !== "open" && f.outcome !== "later") continue;
    if (f.reason !== "manual") continue;
    const ro = ros.find((r) => r.id === f.roId);
    if (!ro) continue;
    out.push({
      key: f.id,
      ro,
      reason: "manual",
      label: f.label || f.note || "Manual follow-up",
      score: 18,
    });
  }

  return out.sort((a, b) => {
    const rr = REASON_RANK[a.reason] - REASON_RANK[b.reason];
    if (rr !== 0) return rr;
    return b.score - a.score;
  });
}
