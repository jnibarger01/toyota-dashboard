import type { FleetAlert, FleetSnapshot, Vehicle } from "./fleet-types";

export type FleetKpis = {
  total: number;
  moving: number;
  idle: number;
  onLot: number;
  inShop: number;
  offline: number;
  openAlerts: number;
  criticalAlerts: number;
  utilization: number;
  fuelBurnToday: number;
  fuelCostToday: number;
  idleGalToday: number;
  pmOverdue: number;
  unassigned: number;
};

export function computeKpis(snap: FleetSnapshot): FleetKpis {
  const v = snap.vehicles;
  const today = snap.fuel[snap.fuel.length - 1];
  const open = snap.alerts.filter((a) => !a.acknowledged);
  return {
    total: v.length,
    moving: v.filter((x) => x.status === "moving").length,
    idle: v.filter((x) => x.status === "idle").length,
    onLot: v.filter((x) => x.status === "on_lot").length,
    inShop: v.filter((x) => x.status === "in_shop").length,
    offline: v.filter((x) => x.status === "offline").length,
    openAlerts: open.length,
    criticalAlerts: open.filter((a) => a.severity === "critical").length,
    utilization: v.length ? v.reduce((s, x) => s + x.utilization7d, 0) / v.length : 0,
    fuelBurnToday: today?.gallons ?? 0,
    fuelCostToday: today?.cost ?? 0,
    idleGalToday: today?.idleGal ?? 0,
    pmOverdue: snap.jobs.filter((j) => j.status === "overdue").length,
    unassigned: v.filter((x) => !x.driverId && x.status !== "in_shop" && x.status !== "on_lot").length,
  };
}

export function alertsForVehicle(alerts: FleetAlert[], vehicleId: string): FleetAlert[] {
  return alerts.filter((a) => a.vehicleId === vehicleId && !a.acknowledged);
}

export function hasOpenAlert(alerts: FleetAlert[], vehicleId: string): boolean {
  return alerts.some((a) => a.vehicleId === vehicleId && !a.acknowledged);
}

export function vehicleAlertSeverity(
  alerts: FleetAlert[],
  vehicleId: string,
): FleetAlert["severity"] | null {
  const open = alertsForVehicle(alerts, vehicleId);
  if (open.some((a) => a.severity === "critical")) return "critical";
  if (open.some((a) => a.severity === "warn")) return "warn";
  if (open.length) return "info";
  return null;
}

export function sortVehicles(list: Vehicle[], alerts: FleetAlert[]): Vehicle[] {
  const rank: Record<string, number> = {
    moving: 1,
    idle: 2,
    in_shop: 3,
    on_lot: 4,
    offline: 5,
  };
  return [...list].sort((a, b) => {
    const sa = vehicleAlertSeverity(alerts, a.id);
    const sb = vehicleAlertSeverity(alerts, b.id);
    const ra = sa === "critical" ? 0 : sa === "warn" ? 1 : sa ? 2 : 3;
    const rb = sb === "critical" ? 0 : sb === "warn" ? 1 : sb ? 2 : 3;
    if (ra !== rb) return ra - rb;
    return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.unit.localeCompare(b.unit);
  });
}
