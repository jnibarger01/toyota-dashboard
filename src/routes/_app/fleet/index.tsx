import { createFileRoute, Link } from "@tanstack/react-router";
import { BriefingCard } from "@/components/briefing-card";
import { KpiStrip } from "@/components/kpi-strip";
import { LiveMap } from "@/components/live-map";
import { Panel } from "@/components/panel";
import { StatusChip } from "@/components/status-chip";
import { useNow } from "@/components/now";
import { ago } from "@/lib/fleet-format";
import { computeKpis, sortVehicles } from "@/lib/fleet-kpis";
import { driverOf, useFleetStore } from "@/lib/fleet-store";

export const Route = createFileRoute("/_app/fleet/")({ component: LiveBoard });

function LiveBoard() {
  const vehicles = useFleetStore((s) => s.vehicles);
  const drivers = useFleetStore((s) => s.drivers);
  const alerts = useFleetStore((s) => s.alerts);
  const jobs = useFleetStore((s) => s.jobs);
  const fuel = useFleetStore((s) => s.fuel);
  const geofences = useFleetStore((s) => s.geofences);
  const settings = useFleetStore((s) => s.settings);
  const select = useFleetStore((s) => s.select);
  const now = useNow();
  const kpis = computeKpis({ vehicles, drivers, alerts, jobs, fuel, geofences, settings });
  const open = alerts.filter((a) => !a.acknowledged).slice(0, 5);
  const watch = sortVehicles(vehicles, alerts).slice(0, 6);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium">Live</h2>
        <p className="text-sm text-muted">
          {kpis.total} units · {kpis.moving} rolling · {kpis.openAlerts} alerts open
        </p>
      </div>

      <KpiStrip kpis={kpis} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <LiveMap />
        <div className="space-y-3">
          <Panel
            title="Needs attention"
            action={
              <Link to="/fleet/alerts" className="text-xs font-medium text-muted hover:text-ink">
                All alerts
              </Link>
            }
          >
            {open.length === 0 ? (
              <p className="text-sm text-muted">Nothing waiting on dispatch.</p>
            ) : (
              <ul className="space-y-2">
                {open.map((item) => {
                  const v = vehicles.find((x) => x.id === item.vehicleId);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => select(item.vehicleId)}
                        className="w-full rounded-lg bg-surface px-2.5 py-2 text-left hover:bg-ink/6"
                      >
                        <div className="text-sm font-medium">{item.title}</div>
                        <div className="text-xs text-muted">
                          {v?.unit} · {ago(item.at, now)}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Watch list" padded={false}>
            <ul>
              {watch.map((v) => {
                const d = driverOf(drivers, v.driverId);
                return (
                  <li key={v.id} className="border-t border-border first:border-t-0">
                    <button
                      type="button"
                      onClick={() => select(v.id)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ink/4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{v.unit}</span>
                          <StatusChip status={v.status} />
                        </div>
                        <div className="truncate text-xs text-muted">
                          {d?.name ?? "Unassigned"} · {Math.round(v.speedMph)} mph
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>

      <BriefingCard />
    </div>
  );
}
