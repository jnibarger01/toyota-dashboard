import { createFileRoute } from "@tanstack/react-router";
import { Panel } from "@/components/panel";
import { computeKpis } from "@/lib/fleet-kpis";
import { gallons, usd, usdFine } from "@/lib/fleet-format";
import { useFleetStore } from "@/lib/fleet-store";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_app/fleet/fuel")({ component: FuelPage });

export function FuelPage() {
  const fuel = useFleetStore((s) => s.fuel);
  const vehicles = useFleetStore((s) => s.vehicles);
  const drivers = useFleetStore((s) => s.drivers);
  const alerts = useFleetStore((s) => s.alerts);
  const jobs = useFleetStore((s) => s.jobs);
  const geofences = useFleetStore((s) => s.geofences);
  const settings = useFleetStore((s) => s.settings);
  const kpis = computeKpis({ vehicles, drivers, alerts, jobs, fuel, geofences, settings });
  const periodGal = fuel.reduce((s, d) => s + d.gallons, 0);
  const periodCost = fuel.reduce((s, d) => s + d.cost, 0);
  const periodIdle = fuel.reduce((s, d) => s + d.idleGal, 0);
  const chart = fuel.map((d) => ({
    ...d,
    label: d.day.slice(5),
  }));

  const thirsty = [...vehicles].sort((a, b) => a.mpg - b.mpg).slice(0, 5);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Fuel</h1>
        <p className="text-sm text-muted">Fourteen-day burn, idle waste, and thirsty units.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <Stat label="Today" value={usd(kpis.fuelCostToday)} hint={gallons(kpis.fuelBurnToday)} />
        <Stat label="14-day cost" value={usd(periodCost)} hint={gallons(periodGal)} />
        <Stat label="Idle gallons" value={gallons(periodIdle)} hint={`${((periodIdle / periodGal) * 100).toFixed(0)}% of burn`} />
        <Stat label="Idle $ today" value={usdFine(kpis.idleGalToday * 3.62)} hint={gallons(kpis.idleGalToday)} />
      </div>

      <Panel title="Daily gallons">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={36} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-elevated)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  color: "var(--color-ink)",
                }}
              />
              <Area type="monotone" dataKey="gallons" stroke="var(--color-accent)" fill="var(--color-accent)" fillOpacity={0.22} name="Gallons" />
              <Area type="monotone" dataKey="idleGal" stroke="var(--color-warn)" fill="var(--color-warn)" fillOpacity={0.28} name="Idle gal" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Lowest MPG">
        <ul className="divide-y divide-border">
          {thirsty.map((v) => (
            <li key={v.id} className="flex items-center justify-between py-2 text-sm first:pt-0 last:pb-0">
              <span className="font-mono">{v.unit}</span>
              <span className="text-muted">
                {v.year} {v.make} {v.model}
              </span>
              <span className="font-mono tabular-nums">{v.mpg.toFixed(1)} mpg</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-elevated px-3 py-3 shadow-[var(--shadow-border)]">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-mono text-lg tabular-nums">{value}</div>
      <div className="text-xs text-subtle">{hint}</div>
    </div>
  );
}
