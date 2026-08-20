/**
 * Canonical repair-order workflow. Exception conditions are deliberately
 * separate from the primary state so an RO can be "Repairing + Parts hold"
 * without creating ambiguous, mutually-exclusive statuses.
 */
export const WORKFLOW_STATES = [
  "scheduled",
  "arrived",
  "written",
  "dispatched",
  "diagnosing",
  "estimate_ready",
  "awaiting_approval",
  "approved",
  "repairing",
  "qc",
  "ready",
  "delivered",
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];
export type WorkflowTransition = { previousState: WorkflowState | null; newState: WorkflowState; occurredAt: string };

export const BLOCKER_TYPES = [
  "customer_approval",
  "technician",
  "parts",
  "warranty",
  "advisor",
  "shop_capacity",
  "sublet",
  "transportation",
  "unknown",
] as const;

export type BlockerType = (typeof BLOCKER_TYPES)[number];
export type PriorityLevel = "critical" | "high" | "medium" | "low";
export type PromiseRiskLevel = "low" | "watch" | "high" | "critical";

const TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = {
  scheduled: ["arrived"],
  arrived: ["written"],
  written: ["dispatched"],
  dispatched: ["diagnosing"],
  diagnosing: ["estimate_ready", "approved"],
  estimate_ready: ["awaiting_approval", "approved"],
  awaiting_approval: ["approved"],
  approved: ["repairing"],
  repairing: ["qc"],
  qc: ["ready", "repairing"],
  ready: ["delivered"],
  delivered: [],
};

export function canTransition(from: WorkflowState, to: WorkflowState, override = false): boolean {
  return from === to || override || TRANSITIONS[from].includes(to);
}

/** Returns the explicit next states a normal advisor action may select. */
export function allowedTransitions(from: WorkflowState): readonly WorkflowState[] {
  return TRANSITIONS[from];
}

export function assertTransition(from: WorkflowState, to: WorkflowState, override = false): void {
  if (!canTransition(from, to, override)) {
    throw new Error(`Invalid repair-order transition: ${from} -> ${to}`);
  }
}

export function nextUpdateDue(contactedAt: Date, intervalMinutes: number): Date {
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1) {
    throw new Error("Customer update interval must be at least one minute");
  }
  return new Date(contactedAt.getTime() + intervalMinutes * 60_000);
}

export function overdueMinutes(dueAt: Date | null, now: Date): number {
  if (!dueAt) return 0;
  return Math.max(0, Math.floor((now.getTime() - dueAt.getTime()) / 60_000));
}

/** Explainable timings derived only from immutable state-history timestamps. */
export function calculateWorkflowDurations(history: WorkflowTransition[], now: Date): {
  timeInCurrentStateMinutes: number;
  totalCycleMinutes: number;
  authorizationDelayMinutes: number;
  diagnosticDelayMinutes: number;
  repairDurationMinutes: number;
  bottleneck: WorkflowState | null;
} {
  const ordered = [...history].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  if (!ordered.length) return { timeInCurrentStateMinutes: 0, totalCycleMinutes: 0, authorizationDelayMinutes: 0, diagnosticDelayMinutes: 0, repairDurationMinutes: 0, bottleneck: null };
  const durations = new Map<WorkflowState, number>();
  for (let index = 0; index < ordered.length; index += 1) {
    const entry = ordered[index];
    const end = index + 1 < ordered.length ? Date.parse(ordered[index + 1].occurredAt) : now.getTime();
    const minutes = Math.max(0, Math.floor((end - Date.parse(entry.occurredAt)) / 60_000));
    durations.set(entry.newState, (durations.get(entry.newState) ?? 0) + minutes);
  }
  const current = ordered.at(-1)!;
  const bottleneck = [...durations.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    timeInCurrentStateMinutes: Math.max(0, Math.floor((now.getTime() - Date.parse(current.occurredAt)) / 60_000)),
    totalCycleMinutes: Math.max(0, Math.floor((now.getTime() - Date.parse(ordered[0].occurredAt)) / 60_000)),
    authorizationDelayMinutes: durations.get("awaiting_approval") ?? 0,
    diagnosticDelayMinutes: durations.get("diagnosing") ?? 0,
    repairDurationMinutes: durations.get("repairing") ?? 0,
    bottleneck,
  };
}

export type PromiseRiskInput = {
  promiseAt: Date;
  now: Date;
  state: WorkflowState;
  technicianAssigned: boolean;
  hasPartsBlocker: boolean;
  hasApprovalBlocker: boolean;
  estimatedMinutesRemaining?: number | null;
  requiresQc?: boolean;
};

export type PromiseRisk = { level: PromiseRiskLevel; reasons: string[]; heuristic: boolean };

/**
 * Conservative, explainable rules used until the dealership supplies reliable
 * historical duration data. It intentionally returns reasons instead of a
 * black-box score so an advisor can challenge the classification.
 */
export function assessPromiseRisk(input: PromiseRiskInput): PromiseRisk {
  const minutesToPromise = Math.floor((input.promiseAt.getTime() - input.now.getTime()) / 60_000);
  const reasons: string[] = [];
  if (minutesToPromise < 0) reasons.push(`Promise missed by ${Math.abs(minutesToPromise)}m`);
  if (input.hasPartsBlocker) reasons.push("Parts blocker is unresolved");
  if (input.hasApprovalBlocker) reasons.push("Customer approval is unresolved");
  if (!input.technicianAssigned && !["ready", "delivered"].includes(input.state)) reasons.push("No technician assigned");
  if (input.estimatedMinutesRemaining != null && input.estimatedMinutesRemaining > minutesToPromise) {
    reasons.push(`${input.estimatedMinutesRemaining}m estimated remaining`);
  }
  if (input.requiresQc && ["repairing", "approved"].includes(input.state) && minutesToPromise <= 45) {
    reasons.push("QC still remains before delivery");
  }

  let level: PromiseRiskLevel = "low";
  if (minutesToPromise < 0 || (input.hasPartsBlocker && minutesToPromise <= 120) || reasons.length >= 3) level = "critical";
  else if (minutesToPromise <= 60 && reasons.length >= 1) level = "high";
  else if (minutesToPromise <= 120 && reasons.length >= 1) level = "watch";
  return { level, reasons, heuristic: true };
}

export type PrioritySignal = {
  code: string;
  label: string;
  points: number;
  action: string;
};

export function rankPriority(signals: PrioritySignal[]): { level: PriorityLevel; score: number; signals: PrioritySignal[] } {
  const ordered = [...signals].sort((a, b) => b.points - a.points || a.code.localeCompare(b.code));
  const score = Math.min(100, ordered.reduce((sum, signal) => sum + signal.points, 0));
  const level: PriorityLevel = score >= 55 ? "critical" : score >= 35 ? "high" : score >= 15 ? "medium" : "low";
  return { level, score, signals: ordered };
}
