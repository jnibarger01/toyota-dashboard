import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusChip } from "@/components/status-chip";
import { Badge } from "@/components/ui/badge";
import { alertsForVehicle } from "@/lib/fleet-kpis";
import { ago, fuelLabel, miles, pct, phonePretty, vehicleTitle } from "@/lib/fleet-format";
import { driverOf, useFleetStore } from "@/lib/fleet-store";
import { CLASS_LABELS } from "@/lib/fleet-types";
import { useNow } from "./now";

export function VehicleDrawer() {
  const selectedId = useFleetStore((s) => s.selectedId);
  const select = useFleetStore((s) => s.select);
  const vehicles = useFleetStore((s) => s.vehicles);
  const drivers = useFleetStore((s) => s.drivers);
  const alerts = useFleetStore((s) => s.alerts);
  const jobs = useFleetStore((s) => s.jobs);
  const geofences = useFleetStore((s) => s.geofences);
  const ackAlert = useFleetStore((s) => s.ackAlert);
  const assignDriver = useFleetStore((s) => s.assignDriver);
  const completeJob = useFleetStore((s) => s.completeJob);
  const now = useNow();

  const v = vehicles.find((x) => x.id === selectedId) ?? null;
  const driver = v ? driverOf(drivers, v.driverId) : null;
  const open = v ? alertsForVehicle(alerts, v.id) : [];
  const unitJobs = v ? jobs.filter((j) => j.vehicleId === v.id) : [];
  const fence = v ? geofences.find((g) => g.id === v.geofenceId) : null;

  return (
    <Sheet open={!!v} onOpenChange={(o) => !o && select(null)}>
      <SheetContent title={v ? v.unit : "Vehicle"} className="max-w-md bg-elevated">
        {v ? (
          <div className="flex h-full flex-col overflow-y-auto p-5 pr-12">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-xs text-muted">{v.unit}</div>
                <h3 className="text-lg font-semibold tracking-tight">{vehicleTitle(v)}</h3>
                <p className="text-xs text-muted">
                  {CLASS_LABELS[v.class]} · {v.plate} · {v.vin.slice(-8)}
                </p>
              </div>
              <StatusChip status={v.status} />
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <Stat label="Speed" value={`${Math.round(v.speedMph)} mph`} />
              <Stat label="Fuel" value={fuelLabel(v.fuelPct)} />
              <Stat label="Odometer" value={miles(v.odometer)} />
              <Stat label="Next PM" value={v.nextPmMiles < 0 ? `${miles(-v.nextPmMiles)} overdue` : miles(v.nextPmMiles)} />
              <Stat label="7-day use" value={pct(v.utilization7d)} />
              <Stat label="MPG" value={v.mpg.toFixed(1)} />
              <Stat label="Last ping" value={ago(v.lastPingAt, now)} />
              <Stat label="Fence" value={fence?.name ?? "Open road"} />
            </dl>

            {v.faultCode ? (
              <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                Active fault {v.faultCode}
              </p>
            ) : null}

            <div className="mt-5">
              <div className="mb-2 text-xs font-medium text-muted">Driver</div>
              <NativeSelect
                className="h-9 w-full bg-surface text-sm"
                value={v.driverId ?? ""}
                onChange={(e) => assignDriver(v.id, e.target.value || null)}
              >
                <option value="">Unassigned</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.vehicleId && d.vehicleId !== v.id ? " (other unit)" : ""}
                  </option>
                ))}
              </NativeSelect>
              {driver ? (
                <p className="mt-2 text-xs text-muted">
                  Safety {driver.safetyScore} · {phonePretty(driver.phone)} · {driver.hoursToday.toFixed(1)}h today
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted">No driver on this unit.</p>
              )}
            </div>

            <div className="mt-6">
              <div className="mb-2 text-xs font-medium text-muted">Open alerts</div>
              {open.length === 0 ? (
                <p className="text-sm text-muted">Quiet.</p>
              ) : (
                <ul className="space-y-2">
                  {open.map((a) => (
                    <li key={a.id} className="rounded-lg bg-surface px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{a.title}</span>
                        <Badge tone={a.severity === "critical" ? "accent" : a.severity === "warn" ? "warn" : "info"}>
                          {a.kind}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted">{a.detail}</p>
                      <Button type="button" size="sm" variant="ghost" className="mt-2 h-8 px-0" onClick={() => ackAlert(a.id)}>
                        Acknowledge
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-6">
              <div className="mb-2 text-xs font-medium text-muted">Maintenance</div>
              {unitJobs.length === 0 ? (
                <p className="text-sm text-muted">No open jobs.</p>
              ) : (
                <ul className="space-y-2">
                  {unitJobs.map((j) => (
                    <li key={j.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                      <div>
                        <div className="text-sm">{j.title}</div>
                        <div className="text-xs text-muted">
                          {j.shop} · {j.status.replace("_", " ")}
                        </div>
                      </div>
                      {j.status !== "done" ? (
                        <Button type="button" size="sm" variant="secondary" onClick={() => completeJob(j.id)}>
                          Done
                        </Button>
                      ) : (
                        <Badge tone="ok">Done</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}
