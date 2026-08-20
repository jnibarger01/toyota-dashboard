import { create } from "zustand";
import { interpolateRoute, pointInPolygon } from "./geo";
import { createSeedData } from "./fleet-seed";
import type {
  Driver,
  FleetAlert,
  FleetSnapshot,
  Geofence,
  MaintenanceJob,
  OrgSettings,
  Vehicle,
  VehicleFilter,
} from "./fleet-types";
import { EMPTY_FLEET_SNAPSHOT } from "./fleet-types";

const IS_STATIC_DEMO = import.meta.env.VITE_DEPLOY_TARGET === "pages" || import.meta.env.VITE_AUTH_ENABLED === "false";

type FleetState = FleetSnapshot & {
  hydrated: boolean;
  selectedId: string | null;
  vehicleQuery: string;
  vehicleFilter: VehicleFilter;
  persist: boolean;
  hydrate: (snap: FleetSnapshot, persist: boolean) => void;
  tick: (now: number, dtSec: number) => void;
  select: (id: string | null) => void;
  setQuery: (q: string) => void;
  setFilter: (f: VehicleFilter) => void;
  ackAlert: (id: string) => void;
  ackAll: () => void;
  completeJob: (id: string) => void;
  assignDriver: (vehicleId: string, driverId: string | null) => void;
  setSettings: (patch: Partial<OrgSettings>) => void;
};

function locateVehicle(v: Vehicle, geofences: Geofence[]): Vehicle {
  if (v.status === "moving" && v.route.length > 1) {
    const pos = interpolateRoute(v.route, v.routeT);
    const geofenceId = geofences.find((g) => pointInPolygon(pos, g.polygon))?.id ?? null;
    return { ...v, lat: pos.lat, lng: pos.lng, heading: pos.heading, geofenceId };
  }
  const geofenceId = geofences.find((g) => pointInPolygon(v, g.polygon))?.id ?? v.geofenceId;
  return { ...v, geofenceId };
}

function advance(v: Vehicle, dtSec: number, nowIso: string): Vehicle {
  if (v.status !== "moving" || v.route.length < 2) {
    return {
      ...v,
      lastPingAt: v.status === "offline" ? v.lastPingAt : nowIso,
      idleMinutes: v.status === "idle" ? v.idleMinutes + dtSec / 60 : v.idleMinutes,
    };
  }
  const milesPerSec = v.speedMph / 3600;
  const length = Math.max(
    0.5,
    v.route.reduce((s, p, i) => {
      if (i === 0) return 0;
      const a = v.route[i - 1];
      const dlat = p.lat - a.lat;
      const dlng = p.lng - a.lng;
      return s + Math.sqrt(dlat * dlat + dlng * dlng) * 69;
    }, 0),
  );
  let t = v.routeT + (milesPerSec * dtSec) / length;
  if (t >= 1) t = t - Math.floor(t);
  return { ...v, routeT: t, lastPingAt: nowIso, idleMinutes: 0 };
}

export const useFleetStore = create<FleetState>((set, get) => ({
  ...(IS_STATIC_DEMO ? createSeedData() : EMPTY_FLEET_SNAPSHOT),
  hydrated: false,
  selectedId: null,
  vehicleQuery: "",
  vehicleFilter: "all",
  persist: false,
  hydrate: (snap, persist) =>
    set({
      ...snap,
      vehicles: snap.vehicles.map((v) => locateVehicle(v, snap.geofences)),
      hydrated: true,
      persist,
    }),
  tick: (now, dtSec) => {
    const nowIso = new Date(now).toISOString();
    const geofences = get().geofences;
    set({
      vehicles: get().vehicles.map((v) => locateVehicle(advance(v, dtSec, nowIso), geofences)),
    });
  },
  select: (id) => set({ selectedId: id }),
  setQuery: (vehicleQuery) => set({ vehicleQuery }),
  setFilter: (vehicleFilter) => set({ vehicleFilter }),
  ackAlert: (id) =>
    set({ alerts: get().alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)) }),
  ackAll: () => set({ alerts: get().alerts.map((a) => ({ ...a, acknowledged: true })) }),
  completeJob: (id) =>
    set({
      jobs: get().jobs.map((j) => (j.id === id ? { ...j, status: "done" } : j)),
    }),
  assignDriver: (vehicleId, driverId) => {
    const nowIso = new Date().toISOString();
    const vehicles = get().vehicles.map((v) => {
      if (v.id === vehicleId) return { ...v, driverId, assignedSince: driverId ? nowIso : null };
      if (driverId && v.driverId === driverId) return { ...v, driverId: null, assignedSince: null };
      return v;
    });
    const drivers = get().drivers.map((d) => {
      if (d.id === driverId) return { ...d, vehicleId, status: d.status === "off" ? "on_shift" : d.status };
      if (d.vehicleId === vehicleId) return { ...d, vehicleId: null, status: d.status === "driving" ? "on_shift" : d.status };
      return d;
    });
    set({ vehicles, drivers });
  },
  setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
}));

export function snapshotFromStore(): FleetSnapshot {
  const s = useFleetStore.getState();
  return {
    vehicles: s.vehicles,
    drivers: s.drivers,
    alerts: s.alerts,
    jobs: s.jobs,
    fuel: s.fuel,
    geofences: s.geofences,
    settings: s.settings,
  };
}

export function driverOf(drivers: Driver[], id: string | null): Driver | null {
  if (!id) return null;
  return drivers.find((d) => d.id === id) ?? null;
}

export function vehicleOf(vehicles: Vehicle[], id: string | null): Vehicle | null {
  if (!id) return null;
  return vehicles.find((v) => v.id === id) ?? null;
}

export function openAlerts(alerts: FleetAlert[]): FleetAlert[] {
  return alerts.filter((a) => !a.acknowledged);
}

export function jobsOpen(jobs: MaintenanceJob[]): MaintenanceJob[] {
  return jobs.filter((j) => j.status !== "done");
}
