import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ago } from "@/lib/fleet-format";
import { useNow } from "@/components/now";
import { ALERT_KIND_LABELS } from "@/lib/fleet-types";
import { useFleetStore, vehicleOf } from "@/lib/fleet-store";

export const Route = createFileRoute("/_app/fleet/alerts")({ component: AlertsPage });

export function AlertsPage() {
  const alerts = useFleetStore((s) => s.alerts);
  const vehicles = useFleetStore((s) => s.vehicles);
  const ackAlert = useFleetStore((s) => s.ackAlert);
  const ackAll = useFleetStore((s) => s.ackAll);
  const select = useFleetStore((s) => s.select);
  const now = useNow();
  const open = alerts.filter((a) => !a.acknowledged);
  const closed = alerts.filter((a) => a.acknowledged);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Alerts</h1>
          <p className="text-sm text-muted">{open.length} open · {closed.length} acknowledged</p>
        </div>
        {open.length > 0 ? (
          <Button type="button" size="sm" variant="secondary" onClick={ackAll}>
            Acknowledge all
          </Button>
        ) : null}
      </div>

      <ul className="space-y-2">
        {alerts.map((a) => {
          const v = vehicleOf(vehicles, a.vehicleId);
          return (
            <li
              key={a.id}
              className="flex flex-wrap items-start gap-3 rounded-xl bg-elevated px-4 py-3 shadow-[var(--shadow-border)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="font-mono text-sm hover:underline" onClick={() => select(a.vehicleId)}>
                    {v?.unit ?? a.vehicleId}
                  </button>
                  <Badge tone={a.severity === "critical" ? "danger" : a.severity === "warn" ? "warn" : "info"}>
                    {ALERT_KIND_LABELS[a.kind]}
                  </Badge>
                  {a.acknowledged ? <Badge tone="ok">Ack</Badge> : null}
                </div>
                <div className="text-sm font-medium">{a.title}</div>
                <p className="text-sm text-muted">{a.detail}</p>
                <div className="mt-1 text-xs text-subtle">{ago(a.at, now)}</div>
              </div>
              {!a.acknowledged ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => ackAlert(a.id)}>
                  Acknowledge
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
