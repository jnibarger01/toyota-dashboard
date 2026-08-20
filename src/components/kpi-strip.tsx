import type { FleetKpis } from "@/lib/fleet-kpis";
import { pct, usd } from "@/lib/fleet-format";
import { cn } from "@/lib/utils";

const ITEMS: {
  key: keyof FleetKpis;
  label: string;
  format: (k: FleetKpis) => string;
  warn?: (k: FleetKpis) => boolean;
}[] = [
  { key: "moving", label: "En route", format: (k) => String(k.moving) },
  { key: "idle", label: "Idle", format: (k) => String(k.idle), warn: (k) => k.idle >= 3 },
  { key: "onLot", label: "On lot", format: (k) => String(k.onLot) },
  { key: "inShop", label: "In shop", format: (k) => String(k.inShop) },
  {
    key: "openAlerts",
    label: "Open alerts",
    format: (k) => String(k.openAlerts),
    warn: (k) => k.openAlerts > 0,
  },
  {
    key: "utilization",
    label: "7-day use",
    format: (k) => pct(k.utilization),
  },
  {
    key: "fuelCostToday",
    label: "Fuel today",
    format: (k) => usd(k.fuelCostToday),
  },
  {
    key: "pmOverdue",
    label: "PM overdue",
    format: (k) => String(k.pmOverdue),
    warn: (k) => k.pmOverdue > 0,
  },
];

export function KpiStrip({ kpis }: { kpis: FleetKpis }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      {ITEMS.map((item) => {
        const warn = item.warn?.(kpis) ?? false;
        return (
          <div
            key={item.key}
            className={cn(
              "rounded-xl bg-elevated px-3 py-3 shadow-[var(--shadow-border)]",
              warn && "shadow-[inset_3px_0_0_var(--color-danger)]",
            )}
          >
            <div className="text-xs text-muted">{item.label}</div>
            <div className="mt-1 font-mono text-xl font-medium tabular-nums tracking-tight">
              {item.format(kpis)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
