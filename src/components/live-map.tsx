import { DISTRICTS, HIGHWAYS, MAP_H, MAP_W, pointsToPath, polygonToPath, project, RIVER } from "@/lib/geo";
import { vehicleAlertSeverity } from "@/lib/fleet-kpis";
import { driverOf, useFleetStore } from "@/lib/fleet-store";
import type { Vehicle, VehicleStatus } from "@/lib/fleet-types";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

const FILL: Record<VehicleStatus, string> = {
  moving: "var(--color-ok)",
  idle: "var(--color-warn)",
  on_lot: "var(--color-accent)",
  in_shop: "var(--color-info)",
  offline: "var(--color-danger)",
};

function Marker({
  v,
  selected,
  alerted,
  onSelect,
}: {
  v: Vehicle;
  selected: boolean;
  alerted: boolean;
  onSelect: (id: string) => void;
}) {
  const { x, y } = project(v.lat, v.lng);
  const fill = FILL[v.status];
  return (
    <g
      transform={`translate(${x} ${y})`}
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(v.id);
      }}
    >
      {v.status === "moving" ? (
        <circle r="14" fill={fill} className="live-pulse origin-center" />
      ) : null}
      {alerted ? <circle r="11" fill="none" stroke="var(--color-danger)" strokeWidth="1.6" /> : null}
      <g transform={`rotate(${v.heading})`}>
        <polygon points="0,-8 6,7 -6,7" fill={fill} stroke="var(--color-bg)" strokeWidth="1.2" />
      </g>
      <text
        y={selected ? 22 : 18}
        textAnchor="middle"
        className="pointer-events-none"
        fill={selected ? "var(--color-ink)" : "var(--color-muted)"}
        stroke="var(--color-bg)"
        strokeWidth="3"
        paintOrder="stroke"
        fontSize={selected ? 11 : 9}
        fontFamily="IBM Plex Sans, sans-serif"
        fontWeight={500}
      >
        {v.unit}
      </text>
    </g>
  );
}

export function LiveMap() {
  const vehicles = useFleetStore((s) => s.vehicles);
  const geofences = useFleetStore((s) => s.geofences);
  const alerts = useFleetStore((s) => s.alerts);
  const selectedId = useFleetStore((s) => s.selectedId);
  const select = useFleetStore((s) => s.select);
  const drivers = useFleetStore((s) => s.drivers);

  const selected = vehicles.find((v) => v.id === selectedId);
  const driver = selected ? driverOf(drivers, selected.driverId) : null;

  const river = useMemo(() => pointsToPath(RIVER), []);

  return (
    <div className="relative overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Kansas City metro fleet map"
        onClick={() => select(null)}
      >
        <image
          href="/maps/kc-night.jpg"
          x="0"
          y="0"
          width={MAP_W}
          height={MAP_H}
          preserveAspectRatio="xMidYMid slice"
          opacity="0.55"
        />
        <rect width={MAP_W} height={MAP_H} fill="var(--color-bg)" opacity="0.28" />
        <path d={river} fill="none" stroke="var(--color-info)" strokeOpacity="0.28" strokeWidth="10" />
        {geofences.map((g) => (
          <path
            key={g.id}
            d={polygonToPath(g.polygon)}
            fill="var(--color-accent)"
            fillOpacity="0.06"
            stroke="var(--color-accent)"
            strokeOpacity="0.35"
            strokeWidth="1.2"
            strokeDasharray="5 4"
          />
        ))}
        {HIGHWAYS.map((h) => (
          <path
            key={h.id}
            d={pointsToPath(h.path)}
            fill="none"
            stroke="var(--color-ink)"
            strokeOpacity="0.18"
            strokeWidth="2.4"
          />
        ))}
        {DISTRICTS.map((d) => {
          const p = project(d.lat, d.lng);
          return (
            <text
              key={d.name}
              x={p.x}
              y={p.y}
              fill="var(--color-subtle)"
              fontSize="11"
              fontFamily="IBM Plex Sans, sans-serif"
              letterSpacing="0.08em"
            >
              {d.name.toUpperCase()}
            </text>
          );
        })}
        {geofences.map((g) => {
          const lat = g.polygon.reduce((s, p) => s + p.lat, 0) / g.polygon.length;
          const lng = g.polygon.reduce((s, p) => s + p.lng, 0) / g.polygon.length;
          const p = project(lat, lng);
          return (
            <text
              key={`${g.id}-label`}
              x={p.x}
              y={p.y - 6}
              textAnchor="middle"
              fill="var(--color-accent)"
              fontSize="10"
              fontFamily="IBM Plex Sans, sans-serif"
            >
              {g.name}
            </text>
          );
        })}
        {vehicles.map((v) => (
          <Marker
            key={v.id}
            v={v}
            selected={v.id === selectedId}
            alerted={vehicleAlertSeverity(alerts, v.id) !== null}
            onSelect={select}
          />
        ))}
      </svg>

      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3">
        <div className="pointer-events-auto rounded-lg bg-bg/80 px-3 py-2 shadow-[var(--shadow-border)] backdrop-blur-sm">
          <div className="text-xs font-medium tracking-wide text-muted">Kansas City metro</div>
          <div className="font-mono text-xs text-ink tabular-nums">
            {vehicles.filter((v) => v.status === "moving").length} moving ·{" "}
            {vehicles.filter((v) => v.status === "idle").length} idle
          </div>
        </div>
        <ul className="pointer-events-none hidden gap-2 rounded-lg bg-bg/80 px-3 py-2 text-xs text-muted shadow-[var(--shadow-border)] backdrop-blur-sm sm:flex">
          {(
            [
              ["moving", "En route"],
              ["idle", "Idle"],
              ["on_lot", "On lot"],
              ["in_shop", "Shop"],
              ["offline", "Offline"],
            ] as const
          ).map(([k, label]) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: FILL[k] }} />
              {label}
            </li>
          ))}
        </ul>
      </div>

      {selected ? (
        <button
          type="button"
          onClick={() => select(selected.id)}
          className={cn(
            "absolute inset-x-3 bottom-3 rounded-lg bg-bg/90 px-3 py-2.5 text-left shadow-[var(--shadow-border)] backdrop-blur-sm sm:inset-x-auto sm:right-3 sm:w-72",
          )}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-sm">{selected.unit}</span>
            <span className="text-xs text-muted">{Math.round(selected.speedMph)} mph</span>
          </div>
          <div className="text-xs text-muted">
            {selected.year} {selected.make} {selected.model}
            {driver ? ` · ${driver.name}` : " · Unassigned"}
          </div>
        </button>
      ) : null}
    </div>
  );
}
