import { computeKpis } from "@/lib/kpis";
import { computePriority, minutesInStatus } from "@/lib/priority";
import { useNow } from "@/components/now";
import { useAppStore } from "@/lib/store";
import { clock, vehicleLabel } from "@/lib/format";
import type { RepairOrder } from "@/lib/types";
import type { ReactNode } from "react";

/** A compact, deterministic start-of-day view; it never asks AI to rank work. */
export function MorningBriefing() {
  const ros = useAppStore((s) => s.ros);
  const settings = useAppStore((s) => s.settings);
  const selectRo = useAppStore((s) => s.selectRo);
  const now = useNow();
  const kpis = computeKpis(ros, settings, now);
  const active = ros.filter((ro) => ro.status !== "completed");
  const prioritized = active.map((ro) => ({ ro, priority: computePriority(ro, now, settings) })).sort((a, b) => b.priority.score - a.priority.score);
  const waiting = active.filter((ro) => ro.transportation === "waiting").sort((a, b) => new Date(a.appointmentTime).getTime() - new Date(b.appointmentTime).getTime());
  const carryovers = prioritized.filter(({ ro }) => ro.carryover);
  const parts = prioritized.filter(({ ro }) => ro.status === "waiting_parts" || ro.blockers?.includes("parts"));
  const approvals = prioritized.filter(({ ro }) => ro.status === "waiting_approval" || ro.status === "recommendations_ready" || ro.blockers?.includes("customer_approval"));
  const promiseRisk = prioritized.filter(({ priority }) => priority.promiseRisk === "high" || priority.promiseRisk === "critical");
  const overdueUpdates = prioritized.filter(({ priority }) => priority.updateOverdue);
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const appointments = active.filter((ro) => { const time = new Date(ro.appointmentTime).getTime(); return time >= todayStart.getTime() && time < tomorrowStart.getTime(); });
  const earliestArrival = appointments.slice().sort((a, b) => new Date(a.appointmentTime).getTime() - new Date(b.appointmentTime).getTime())[0];

  return <section className="rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]" aria-labelledby="morning-briefing-title">
    <div className="flex items-baseline justify-between gap-2"><h2 id="morning-briefing-title" className="text-sm font-semibold">Morning briefing</h2><span className="font-mono text-xs text-muted">{appointments.length} appointments</span></div>
    <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><Stat label="Open" value={kpis.active} /><Stat label="Updates due" value={kpis.updatesDue} /><Stat label="Waiting" value={waiting.length} /><Stat label="Carryovers" value={carryovers.length} /><Stat label="Parts" value={parts.length} /><Stat label="Approval" value={approvals.length} /></div>
    <BriefingSection title="Today’s appointments" empty="No remaining appointments today.">{earliestArrival ? <button type="button" onClick={() => selectRo(earliestArrival.id)} className="text-left text-xs hover:underline">Earliest: RO {earliestArrival.roNumber} · {clock(earliestArrival.appointmentTime)} · {earliestArrival.customerName}</button> : null}{waiting[0] ? <button type="button" onClick={() => selectRo(waiting[0].id)} className="mt-1 block text-left text-xs text-muted hover:underline">Longest waiting: {waiting[0].customerName} · {Math.round(minutesInStatus(waiting[0], now))}m in lane</button> : null}</BriefingSection>
    <BriefingSection title="Carryovers" empty="No carryovers.">{carryovers.slice(0, 2).map(({ ro, priority }) => <BriefingRow key={ro.id} ro={ro} detail={`${Math.round(minutesInStatus(ro, now))}m in state · ${priority.promiseRisk.toUpperCase()} RISK`} onOpen={selectRo} />)}</BriefingSection>
    <BriefingSection title="Parts and authorization" empty="No open parts or approval holds.">{[...parts, ...approvals].slice(0, 3).map(({ ro, priority }) => <BriefingRow key={ro.id} ro={ro} detail={priority.signals[0]?.label ?? priority.action} onOpen={selectRo} />)}</BriefingSection>
    <BriefingSection title="Risk" empty="No promises or customer updates at high risk.">{prioritized.filter(({ priority }) => priority.promiseRisk === "high" || priority.promiseRisk === "critical" || priority.updateOverdue).slice(0, 3).map(({ ro, priority }) => <BriefingRow key={ro.id} ro={ro} detail={priority.signals[0]?.label ?? priority.action} onOpen={selectRo} />)}</BriefingSection>
    <div className="mt-4 rounded-lg bg-bg p-3"><span className="text-xs font-medium text-muted">YOUR FIRST PRIORITIES</span>{prioritized.slice(0, 3).map(({ ro, priority }, index) => <button type="button" key={ro.id} onClick={() => selectRo(ro.id)} className="mt-2 block w-full text-left text-xs hover:underline"><span className="font-mono text-muted">{index + 1}.</span> <span className="font-medium">RO {ro.roNumber} — {ro.customerName}</span><span className="block pl-3.5 text-muted">{priority.signals[0]?.label ?? priority.action}</span></button>)}</div>
    <p className="mt-3 text-[11px] text-subtle">{promiseRisk.length} promise risks · {overdueUpdates.length} overdue customer updates · rankings use explicit lane rules.</p>
  </section>;
}

function BriefingSection({ title, empty, children }: { title: string; empty: string; children: ReactNode }) { const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : []; return <div className="mt-4"><div className="text-xs font-medium text-muted">{title}</div>{items.length ? <div className="mt-1 space-y-1">{items}</div> : <p className="mt-1 text-xs text-subtle">{empty}</p>}</div>; }
function BriefingRow({ ro, detail, onOpen }: { ro: RepairOrder; detail: string; onOpen: (id: string) => void }) { return <button type="button" onClick={() => onOpen(ro.id)} className="block w-full text-left text-xs hover:underline"><span className="font-medium">RO {ro.roNumber} · {ro.customerName}</span><span className="block text-muted">{vehicleLabel(ro)} · {detail}</span></button>; }
function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-md bg-bg px-2 py-2"><div className="font-mono text-sm">{value}</div><div className="text-muted">{label}</div></div>; }
