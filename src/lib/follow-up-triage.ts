import { computePriority } from "./priority.ts";
import { DEFAULT_SETTINGS, type AppSettings, type FollowUp, type RepairOrder } from "./types.ts";

export const FOLLOW_UP_TRIAGE_GROUPS = ["overdue", "due", "open", "completed"] as const;
export type FollowUpTriageGroup = (typeof FOLLOW_UP_TRIAGE_GROUPS)[number];

export type FollowUpTriageItem = {
  followUp: FollowUp;
  ro: RepairOrder;
  priority: number;
};

export type FollowUpTriageGroupResult = {
  key: FollowUpTriageGroup;
  label: string;
  items: FollowUpTriageItem[];
};

const LABELS: Record<FollowUpTriageGroup, string> = {
  overdue: "Overdue",
  due: "Due today",
  open: "Open",
  completed: "Completed",
};

const endOfDay = (now: number): number => {
  const date = new Date(now);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

export function buildFollowUpTriage(
  followUps: FollowUp[],
  ros: RepairOrder[],
  now: number,
  settings?: AppSettings,
): FollowUpTriageGroupResult[] {
  const roById = new Map(ros.map((ro) => [ro.id, ro]));
  const groups = new Map<FollowUpTriageGroup, FollowUpTriageItem[]>(FOLLOW_UP_TRIAGE_GROUPS.map((key) => [key, []]));
  const todayEnd = endOfDay(now);

  for (const followUp of followUps) {
    const ro = roById.get(followUp.roId);
    if (!ro) continue;
    const priority = followUp.outcome === "completed" ? 0 : computePriority(ro, now, settings ?? DEFAULT_SETTINGS).score;
    const dueAt = followUp.callbackAt ? Date.parse(followUp.callbackAt) : Number.NaN;
    const group: FollowUpTriageGroup = followUp.outcome === "completed"
      ? "completed"
      : Number.isFinite(dueAt) && dueAt <= now
        ? "overdue"
        : Number.isFinite(dueAt) && dueAt <= todayEnd
          ? "due"
          : "open";
    groups.get(group)!.push({ followUp, ro, priority });
  }

  return FOLLOW_UP_TRIAGE_GROUPS.map((key) => ({
    key,
    label: LABELS[key],
    items: groups.get(key)!.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      const aDue = a.followUp.callbackAt ? Date.parse(a.followUp.callbackAt) : Number.POSITIVE_INFINITY;
      const bDue = b.followUp.callbackAt ? Date.parse(b.followUp.callbackAt) : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      const created = a.followUp.createdAt.localeCompare(b.followUp.createdAt);
      return created || a.followUp.id.localeCompare(b.followUp.id);
    }),
  }));
}
