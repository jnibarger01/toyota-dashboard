import type { LaneKpis } from "@/lib/kpis";
import { usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import type { BoardFilter } from "@/lib/types";

const CARDS: {
  key: keyof LaneKpis;
  label: string;
  filter?: BoardFilter;
  money?: boolean;
  warn?: (k: LaneKpis) => boolean;
}[] = [
  { key: "active", label: "Active ROs" },
  { key: "waitingCustomer", label: "Waiting for Customer", filter: "waiting_customers", warn: (k) => k.waitingCustomer > 0 },
  { key: "waitingTech", label: "Waiting for Technician" },
  { key: "waitingParts", label: "Waiting for Parts", filter: "parts_pending" },
  { key: "ready", label: "Ready for Pickup", filter: "ready" },
  { key: "updatesDue", label: "Updates Due", filter: "updates_overdue", warn: (k) => k.updatesDue > 0 },
  { key: "recommended", label: "Open Recommended", money: true },
  { key: "approved", label: "Approved Work", money: true },
];

export function SummaryCards({ kpis }: { kpis: LaneKpis }) {
  const filter = useAppStore((s) => s.boardFilter);
  const setBoardFilter = useAppStore((s) => s.setBoardFilter);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      {CARDS.map((c) => {
        const warn = c.warn?.(kpis) ?? false;
        const active = c.filter && filter === c.filter;
        const value = kpis[c.key];
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => c.filter && setBoardFilter(filter === c.filter ? "all" : c.filter)}
            className={cn(
              "rounded-xl bg-elevated px-3 py-3 text-left shadow-[var(--shadow-border)]",
              warn && "urgency-critical",
              active && "ring-1 ring-ink/20",
              c.filter && "hover:shadow-[var(--shadow-border-hover)]",
            )}
          >
            <div className="text-xs text-muted">{c.label}</div>
            <div className="mt-1 font-mono text-xl font-medium tabular-nums tracking-tight">
              {c.money ? usd(Number(value)) : value}
            </div>
          </button>
        );
      })}
    </div>
  );
}
