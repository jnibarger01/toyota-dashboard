import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { phonePretty, scoreTone } from "@/lib/fleet-format";
import { useFleetStore, vehicleOf } from "@/lib/fleet-store";
import type { DriverStatus } from "@/lib/fleet-types";

export const Route = createFileRoute("/_app/fleet/drivers")({ component: DriversPage });

const STATUS: Record<DriverStatus, string> = {
  driving: "Driving",
  on_shift: "On shift",
  break: "Break",
  off: "Off",
};

export function DriversPage() {
  const drivers = useFleetStore((s) => s.drivers);
  const vehicles = useFleetStore((s) => s.vehicles);
  const select = useFleetStore((s) => s.select);
  const ranked = [...drivers].sort((a, b) => a.safetyScore - b.safetyScore);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Drivers</h1>
        <p className="text-sm text-muted">Safety score, hours, and assigned unit. Lowest score first.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {ranked.map((d) => {
          const v = vehicleOf(vehicles, d.vehicleId);
          const tone = scoreTone(d.safetyScore);
          return (
            <article key={d.id} className="rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium">{d.name}</h2>
                  <p className="text-xs text-muted">
                    {d.role} · hired {d.hireYear} · {phonePretty(d.phone)}
                  </p>
                </div>
                <Badge tone={tone === "accent" ? "danger" : tone}>{d.safetyScore}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-surface px-2 py-2">
                  <dt className="text-xs text-muted">Today</dt>
                  <dd className="font-mono text-sm tabular-nums">{d.hoursToday.toFixed(1)}h</dd>
                </div>
                <div className="rounded-lg bg-surface px-2 py-2">
                  <dt className="text-xs text-muted">Week</dt>
                  <dd className="font-mono text-sm tabular-nums">{d.hoursWeek.toFixed(1)}h</dd>
                </div>
                <div className="rounded-lg bg-surface px-2 py-2">
                  <dt className="text-xs text-muted">Status</dt>
                  <dd className="text-sm">{STATUS[d.status]}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                <span>{d.speeding30d} speed</span>
                <span>·</span>
                <span>{d.harsh30d} harsh</span>
                <span>·</span>
                <span>{d.idleEvents30d} idle</span>
              </div>
              {v ? (
                <button
                  type="button"
                  onClick={() => select(v.id)}
                  className="mt-3 text-sm font-medium text-accent hover:underline"
                >
                  {v.unit} · {v.year} {v.make} {v.model}
                </button>
              ) : (
                <p className="mt-3 text-sm text-muted">No unit assigned</p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
