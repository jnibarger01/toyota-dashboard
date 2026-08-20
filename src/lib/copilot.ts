import { computePriority } from "./priority.ts";
import { vehicleLabel } from "./format.ts";
import type { AppSettings, RepairOrder } from "./types.ts";

export type CopilotAnswer = { heading: string; summary: string; roIds: string[]; action: string };
export type RecentLaneChange = { roId: string; roNumber: string; customerName: string; type: string; occurredAt: string };

function declinedTotal(ro: RepairOrder): number {
  return ro.lines.filter((line) => line.state === "declined").reduce((total, line) => total + line.amount, 0);
}

function parseCutoff(question: string, now: number): number | null {
  const match = question.match(/(?:before|by)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.replaceAll(".", "").toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!Number.isInteger(hour) || hour > 23 || minute > 59) return null;
  const cutoff = new Date(now);
  cutoff.setHours(hour, minute, 0, 0);
  return cutoff.getTime();
}

function ageMinutes(iso: string | null, now: number): number {
  return iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000)) : Number.POSITIVE_INFINITY;
}

/** Formats a bounded audit result; events stay chronological and actionable. */
export function summarizeRecentChanges(changes: RecentLaneChange[]): CopilotAnswer {
  const ordered = [...changes].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)).slice(0, 5);
  return {
    heading: "What changed recently",
    summary: ordered.length
      ? ordered.map((change) => `RO ${change.roNumber} — ${change.customerName}: ${change.type.replaceAll("_", " ")}`).join("\n")
      : "No recorded lane changes in this time window.",
    roIds: [...new Set(ordered.map((change) => change.roId))],
    action: ordered.length ? "Open the affected repair order to review the full audit trail" : "Keep monitoring the lane",
  };
}

/** Deterministic structured lane queries; an LLM may format these results but never decides urgency. */
export function queryAdvisorLane(question: string, ros: RepairOrder[], settings: AppSettings, now: number): CopilotAnswer {
  const q = question.toLowerCase();
  if (/\b(?:changed|change|lunch)\b/.test(q)) {
    const since = now - 4 * 60 * 60_000;
    return summarizeRecentChanges(ros.flatMap((ro) => ro.timeline.filter((event) => Date.parse(event.at) >= since).map((event) => ({ roId: ro.id, roNumber: ro.roNumber, customerName: ro.customerName, type: event.label, occurredAt: event.at }))));
  }
  const ranked = ros.filter((ro) => ro.status !== "completed").map((ro) => ({ ro, p: computePriority(ro, now, settings) })).sort((a, b) => b.p.score - a.p.score);
  let matches = ranked;
  let heading = "What to work on next";
  if (/carryover/.test(q)) { matches = ranked.filter(({ ro }) => ro.carryover); heading = "Carryover repair orders"; }
  else if (/comeback/.test(q)) { matches = ranked.filter(({ ro }) => ro.comeback); heading = "Comeback repair orders"; }
  else if (/declined|unsold/.test(q)) { matches = ranked.filter(({ ro }) => declinedTotal(ro) > 0).sort((a, b) => declinedTotal(b.ro) - declinedTotal(a.ro)); heading = "Declined work requiring follow-up"; }
  else if (/high[- ]?dollar|biggest.*(?:approved|ticket)|largest.*(?:approved|ticket)/.test(q)) { matches = ranked.filter(({ ro }) => ro.lines.filter((line) => line.state === "approved").reduce((total, line) => total + line.amount, 0) >= settings.highDollarThreshold).sort((a, b) => b.ro.lines.filter((line) => line.state === "approved").reduce((total, line) => total + line.amount, 0) - a.ro.lines.filter((line) => line.state === "approved").reduce((total, line) => total + line.amount, 0)); heading = "High-dollar approved work"; }
  else if (/waiting\s+(?:on\s+)?(?:tech|technician)|tech.*waiting/.test(q)) { matches = ranked.filter(({ ro }) => ro.status === "waiting_technician" || !ro.technician || ro.technician === "Unassigned"); heading = "Repair orders waiting on a technician"; }
  else if (/waiting customer|lobby/.test(q)) { matches = ranked.filter(({ ro }) => ro.transportation === "waiting"); heading = "Waiting customers"; }
  else if (/finished|ready.*(?:contact|notify)|(?:contact|notify).*ready/.test(q)) { matches = ranked.filter(({ ro }) => ro.status === "ready_for_pickup" && ageMinutes(ro.lastCustomerUpdate, now) >= settings.waitingUpdateIntervalMin); heading = "Ready vehicles awaiting customer contact"; }
  else if (/update|contact/.test(q)) {
    const hours = q.match(/(?:more than|over)\s+(\d+)\s+hours?/);
    matches = hours ? ranked.filter(({ ro }) => ageMinutes(ro.lastCustomerUpdate, now) >= Number(hours[1]) * 60) : ranked.filter(({ p }) => p.updateOverdue);
    heading = hours ? `Customers without contact in ${hours[1]}+ hours` : "Customers needing an update";
  }
  else if (/holding|blocker|parts/.test(q)) { matches = ranked.filter(({ ro }) => ro.status === "waiting_parts" || ro.status === "waiting_technician" || ro.status === "waiting_approval" || ro.status === "waiting_video"); heading = "What is holding up the lane"; }
  else if (/approval|estimate/.test(q)) { matches = ranked.filter(({ ro }) => ro.status === "waiting_approval" || ro.status === "recommendations_ready"); heading = "Estimates awaiting action"; }
  else if (/promise|risk/.test(q)) {
    const cutoff = parseCutoff(q, now);
    matches = ranked.filter(({ ro, p }) => (p.promiseRisk === "high" || p.promiseRisk === "critical") && (cutoff == null || new Date(ro.promiseTime).getTime() <= cutoff));
    heading = cutoff == null ? "Promises at risk" : `Promises at risk before ${new Date(cutoff).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  const top = matches.slice(0, 3);
  const summary = top.length ? top.map(({ ro, p }) => `RO ${ro.roNumber} — ${ro.customerName} — ${vehicleLabel(ro)}: ${p.signals[0]?.label ?? p.action}`).join("\n") : "No repair orders match that operational question right now.";
  return { heading, summary, roIds: top.map(({ ro }) => ro.id), action: top[0]?.p.action ?? "Keep monitoring the lane" };
}
