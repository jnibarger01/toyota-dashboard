import { createFileRoute } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusChip } from "@/components/status-chip";
import { hasOpenAlert, sortVehicles } from "@/lib/fleet-kpis";
import { fuelLabel, miles, pct, vehicleTitle } from "@/lib/fleet-format";
import { driverOf, useFleetStore } from "@/lib/fleet-store";
import { CLASS_LABELS, STATUS_LABELS, VEHICLE_STATUSES, type VehicleFilter } from "@/lib/fleet-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/fleet/vehicles")({ component: VehiclesPage });

function VehiclesPage() {
  const vehicles = useFleetStore((s) => s.vehicles);
  const drivers = useFleetStore((s) => s.drivers);
  const alerts = useFleetStore((s) => s.alerts);
  const query = useFleetStore((s) => s.vehicleQuery);
  const filter = useFleetStore((s) => s.vehicleFilter);
  const setQuery = useFleetStore((s) => s.setQuery);
  const setFilter = useFleetStore((s) => s.setFilter);
  const select = useFleetStore((s) => s.select);

  const q = query.trim().toLowerCase();
  const rows = sortVehicles(vehicles, alerts).filter((v) => {
    if (filter === "alerted" && !hasOpenAlert(alerts, v.id)) return false;
    if (filter !== "all" && filter !== "alerted" && v.status !== filter) return false;
    if (!q) return true;
    const d = driverOf(drivers, v.driverId);
    const blob = `${v.unit} ${v.name} ${vehicleTitle(v)} ${v.plate} ${v.vin} ${d?.name ?? ""}`.toLowerCase();
    return blob.includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Vehicles</h1>
          <p className="text-sm text-muted">{rows.length} of {vehicles.length} units</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search unit, VIN, driver"
            className="w-full sm:w-56"
          />
          <NativeSelect
            className="h-9 bg-elevated"
            value={filter}
            onChange={(e) => setFilter(e.target.value as VehicleFilter)}
          >
            <option value="all">All statuses</option>
            <option value="alerted">Open alerts</option>
            {VEHICLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-elevated shadow-[var(--shadow-border)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">Unit</th>
                <th className="px-4 py-2.5 font-medium">Vehicle</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Driver</th>
                <th className="px-4 py-2.5 font-medium">Fuel</th>
                <th className="px-4 py-2.5 font-medium">Odo</th>
                <th className="px-4 py-2.5 font-medium">Use</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const d = driverOf(drivers, v.driverId);
                const alerted = hasOpenAlert(alerts, v.id);
                return (
                  <tr
                    key={v.id}
                    className={cn(
                      "cursor-pointer border-b border-border last:border-0 hover:bg-ink/4",
                      alerted && "shadow-[inset_3px_0_0_var(--color-danger)]",
                    )}
                    onClick={() => select(v.id)}
                  >
                    <td className="px-4 py-2.5 font-mono">{v.unit}</td>
                    <td className="px-4 py-2.5">
                      <div>{vehicleTitle(v)}</div>
                      <div className="text-xs text-muted">{CLASS_LABELS[v.class]} · {v.plate}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusChip status={v.status} />
                    </td>
                    <td className="px-4 py-2.5 text-muted">{d?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">{fuelLabel(v.fuelPct)}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">{miles(v.odometer)}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">{pct(v.utilization7d)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">No units match that filter.</p>
        ) : null}
      </div>
    </div>
  );
}
