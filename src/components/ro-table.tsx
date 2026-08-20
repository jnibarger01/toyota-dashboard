import { TransportChip } from "@/components/transport-chip";
import { NativeSelect } from "@/components/ui/native-select";
import { useNow } from "@/components/now";
import { clock, elapsedInStatus, lineTotals, usd, vehicleLabel } from "@/lib/format";
import { isUpdateOverdue, isWaitingCustomer } from "@/lib/kpis";
import { computePriority } from "@/lib/priority";
import { useAppStore } from "@/lib/store";
import { RO_STATUSES, STATUS_LABELS, type RepairOrder, type RoStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

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
      if (!includeCompleted && ro.status === "completed") return false;
      if (q) {
        const blob = `${ro.roNumber} ${ro.customerName} ${vehicleLabel(ro)} ${ro.vin} ${ro.technician} ${ro.concern}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      const pri = computePriority(ro, now, settings);
      const totals = lineTotals(ro);
      switch (boardFilter) {
        case "waiting_customers":
          return isWaitingCustomer(ro);
        case "updates_overdue":
          return isUpdateOverdue(ro, now);
        case "approval_pending":
          return ro.status === "waiting_approval" || ro.status === "recommendations_ready";
        case "parts_pending":
          return ro.status === "waiting_parts";
        case "ready":
          return ro.status === "ready_for_pickup";
        case "high_dollar":
          return totals.recommended + totals.approved >= settings.highDollarThreshold;
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
  const updateRoStatus = useAppStore((s) => s.updateRoStatus);
  const now = useNow();

  return (
    <div className="overflow-hidden rounded-xl bg-elevated shadow-[var(--shadow-border)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th className="px-3 py-2.5 font-medium">RO</th>
              <th className="px-3 py-2.5 font-medium">Customer</th>
              <th className="px-3 py-2.5 font-medium">Vehicle</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Tech</th>
              <th className="px-3 py-2.5 font-medium">Promise</th>
              <th className="px-3 py-2.5 font-medium">In status</th>
              <th className="px-3 py-2.5 font-medium">Est.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((ro) => {
              const pri = computePriority(ro, now, settings);
              const totals = lineTotals(ro);
              return (
                <tr
                  key={ro.id}
                  className={cn(
                    "ro-row cursor-pointer border-b border-border last:border-0",
                    pri.urgency === "critical" && "urgency-critical",
                    pri.urgency === "warn" && "urgency-warn",
                    pri.urgency === "watch" && "urgency-watch",
                  )}
                  onClick={() => onOpen(ro.id)}
                >
                  <td className="px-3 py-2 font-mono">{ro.roNumber}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{ro.customerName}</div>
                    <div className="text-xs text-muted">{pri.action}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{vehicleLabel(ro)}</div>
                    <TransportChip type={ro.transportation} />
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <NativeSelect
                      className="h-8 max-w-44 bg-surface"
                      value={ro.status}
                      onChange={(e) => updateRoStatus(ro.id, e.target.value as RoStatus, now)}
                    >
                      {RO_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </NativeSelect>
                  </td>
                  <td className="px-3 py-2 text-muted">{ro.technician}</td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums">{clock(ro.promiseTime)}</td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums">{elapsedInStatus(ro, now)}</td>
                  <td className="px-3 py-2 font-mono tabular-nums">{usd(totals.open)}</td>
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
