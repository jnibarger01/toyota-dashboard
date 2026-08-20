import { TransportChip } from "@/components/transport-chip";
import { useNow } from "@/components/now";
import { ago, clock, elapsedInStatus, lineTotals, usd, vehicleLabel } from "@/lib/format";
import { isUpdateOverdue, isWaitingCustomer } from "@/lib/kpis";
import { computePriority } from "@/lib/priority";
import { useAppStore } from "@/lib/store";
import { type RepairOrder } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useState } from "react";

type SortKey = "priority" | "ro" | "customer" | "tech" | "promise" | "risk" | "update" | "approved";

export function useVisibleRos(): RepairOrder[] {
  const ros = useAppStore((s) => s.ros);
  const query = useAppStore((s) => s.query);
  const boardFilter = useAppStore((s) => s.boardFilter);
  const includeCompleted = useAppStore((s) => s.includeCompleted);
  const settings = useAppStore((s) => s.settings);
  const now = useNow();
  const q = query.trim().toLowerCase();

  return ros
    .filter((ro) => {
      if (!includeCompleted && ro.status === "completed" && boardFilter !== "delivered") return false;
      if (q) {
        const blob = `${ro.roNumber} ${ro.customerName} ${vehicleLabel(ro)} ${ro.vin} ${ro.technician} ${ro.concern} ${ro.status.replaceAll("_", " ")} ${ro.transportation} ${(ro.blockers ?? []).map((blocker) => blocker.replaceAll("_", " ")).join(" ")}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      const pri = computePriority(ro, now, settings);
      const totals = lineTotals(ro);
      switch (boardFilter) {
        case "waiting_customers":
          return isWaitingCustomer(ro);
        case "waiting_technician":
          return ro.status === "waiting_technician" || ro.technician === "Unassigned";
        case "updates_overdue":
          return isUpdateOverdue(ro, now);
        case "approval_pending":
          return ro.status === "waiting_approval" || ro.status === "recommendations_ready";
        case "parts_pending":
          return ro.status === "waiting_parts";
        case "blockers":
          return Boolean(ro.blockers?.length);
        case "ready":
          return ro.status === "ready_for_pickup";
        case "promise_risk":
          return pri.promiseRisk === "high" || pri.promiseRisk === "critical";
        case "high_dollar":
          return totals.recommended + totals.approved >= settings.highDollarThreshold;
        case "declined_work":
          return totals.declined > 0;
        case "carryovers":
          return Boolean(ro.carryover);
        case "comebacks":
          return Boolean(ro.comeback);
        case "delivered":
          return ro.status === "completed";
        case "stalled":
          return pri.stalled;
        default:
          return true;
      }
    })
    .sort((a, b) => computePriority(b, now, settings).score - computePriority(a, now, settings).score);
}

export function RoTable({ onOpen }: { onOpen: (id: string) => void }) {
  const rows = useVisibleRos();
  const settings = useAppStore((s) => s.settings);
  const now = useNow();
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "priority", direction: "desc" });
  const sortedRows = [...rows].sort((left, right) => {
    const leftPriority = computePriority(left, now, settings);
    const rightPriority = computePriority(right, now, settings);
    const riskValue = { low: 0, watch: 1, high: 2, critical: 3 } as const;
    const values: Record<SortKey, [string | number, string | number]> = {
      priority: [leftPriority.score, rightPriority.score], ro: [left.roNumber, right.roNumber], customer: [left.customerName, right.customerName], tech: [left.technician, right.technician],
      promise: [new Date(left.promiseTime).getTime(), new Date(right.promiseTime).getTime()], risk: [riskValue[leftPriority.promiseRisk], riskValue[rightPriority.promiseRisk]],
      update: [left.lastCustomerUpdate ? new Date(left.lastCustomerUpdate).getTime() : 0, right.lastCustomerUpdate ? new Date(right.lastCustomerUpdate).getTime() : 0],
      approved: [lineTotals(left).approved, lineTotals(right).approved],
    };
    const [a, b] = values[sort.key];
    const compare = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
    return sort.direction === "asc" ? compare : -compare;
  });
  const toggleSort = (key: SortKey) => setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "ro" || key === "customer" || key === "tech" ? "asc" : "desc" });
  const SortHeader = ({ label, sortKey }: { label: string; sortKey?: SortKey }) => <th className="px-3 py-2.5 font-medium" aria-sort={sortKey && sort.key === sortKey ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>{sortKey ? <button type="button" onClick={() => toggleSort(sortKey)} className="font-medium hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{label}{sort.key === sortKey ? (sort.direction === "asc" ? " ↑" : " ↓") : null}</button> : label}</th>;

  return (
    <div className="overflow-hidden rounded-xl bg-elevated shadow-[var(--shadow-border)]">
      <div className="space-y-2 p-2 md:hidden" aria-label="Repair orders">
        {sortedRows.map((ro) => {
          const pri = computePriority(ro, now, settings);
          const totals = lineTotals(ro);
          return <button key={ro.id} type="button" className={cn("w-full rounded-lg border border-border bg-surface p-3 text-left shadow-sm transition hover:bg-elevated focus-visible:outline-offset-2", pri.urgency === "critical" && "urgency-critical", pri.urgency === "warn" && "urgency-warn", pri.urgency === "watch" && "urgency-watch")} onClick={() => onOpen(ro.id)} aria-label={`Open repair order ${ro.roNumber} for ${ro.customerName}`}>
            <div className="flex items-start justify-between gap-3"><span className="font-mono text-sm">RO {ro.roNumber}</span><span className="text-xs font-medium text-muted">{ro.status.replaceAll("_", " ")}</span></div>
            <div className="mt-1 font-medium">{ro.customerName}</div>
            <div className="text-sm text-muted">{vehicleLabel(ro)} · {ro.technician}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs"><span><span className="block text-muted">Promise</span><span className="font-mono">{clock(ro.promiseTime)}</span></span><span><span className="block text-muted">Estimate</span><span className="font-mono">{usd(totals.open)}</span></span><span><span className="block text-muted">Next action</span><span>{pri.action}</span></span></div>
            <div className="mt-2"><TransportChip type={ro.transportation} /></div>
          </button>;
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <SortHeader label="Priority" sortKey="priority" />
              <SortHeader label="RO" sortKey="ro" />
              <SortHeader label="Customer" sortKey="customer" />
              <th className="px-3 py-2.5 font-medium">Vehicle</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <SortHeader label="Tech" sortKey="tech" />
              <th className="px-3 py-2.5 font-medium">Blocker</th>
              <SortHeader label="Promise" sortKey="promise" />
              <SortHeader label="Risk" sortKey="risk" />
              <SortHeader label="Last update" sortKey="update" />
              <th className="px-3 py-2.5 font-medium">In status</th>
              <th className="px-3 py-2.5 font-medium">Est.</th>
              <SortHeader label="Approved" sortKey="approved" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((ro) => {
              const pri = computePriority(ro, now, settings);
              const totals = lineTotals(ro);
              return (
                <tr
                  key={ro.id}
                  className={cn(
                    "ro-row cursor-pointer border-b border-border last:border-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink",
                    pri.urgency === "critical" && "urgency-critical",
                    pri.urgency === "warn" && "urgency-warn",
                    pri.urgency === "watch" && "urgency-watch",
                  )}
                  onClick={() => onOpen(ro.id)}
                  tabIndex={0}
                  aria-label={`Open repair order ${ro.roNumber} for ${ro.customerName}`}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpen(ro.id);
                    }
                  }}
                >
                  <td className="px-3 py-2"><span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", pri.urgency === "critical" ? "bg-accent/15 text-accent" : pri.urgency === "warn" ? "bg-warn/15 text-warn" : "bg-bg text-muted")}>{pri.urgency.toUpperCase()}</span></td>
                  <td className="px-3 py-2 font-mono">{ro.roNumber}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{ro.customerName}</div>
                    <div className="text-xs text-muted">{pri.action}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{vehicleLabel(ro)}</div>
                    <TransportChip type={ro.transportation} />
                  </td>
                  <td className="px-3 py-2"><span className="text-xs text-muted">{ro.status.replaceAll("_", " ")}</span></td>
                  <td className="px-3 py-2 text-muted">{ro.technician}</td>
                  <td className="px-3 py-2 text-xs text-muted">{ro.blockers?.length ? ro.blockers.map((blocker) => blocker.replaceAll("_", " ")).join(", ") : "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums">{clock(ro.promiseTime)}</td>
                  <td className="px-3 py-2"><span className={cn("text-xs font-medium", pri.promiseRisk === "critical" ? "text-accent" : pri.promiseRisk === "high" ? "text-warn" : "text-muted")}>{pri.promiseRisk.toUpperCase()}</span></td>
                  <td className="px-3 py-2 text-xs text-muted">{ro.lastCustomerUpdate ? ago(ro.lastCustomerUpdate, now) : "No contact"}</td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums">{elapsedInStatus(ro, now)}</td>
                  <td className="px-3 py-2 font-mono tabular-nums">{usd(totals.open)}</td>
                  <td className="px-3 py-2 font-mono tabular-nums">{usd(totals.approved)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">No repair orders in this view.</p>
      ) : null}
    </div>
  );
}
