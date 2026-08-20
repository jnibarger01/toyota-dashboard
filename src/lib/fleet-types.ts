export type Coord = { lat: number; lng: number };

export const VEHICLE_STATUSES = [
  "moving",
  "idle",
  "on_lot",
  "in_shop",
  "offline",
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const STATUS_LABELS: Record<VehicleStatus, string> = {
  moving: "En route",
  idle: "Idle",
  on_lot: "On lot",
  in_shop: "In shop",
  offline: "Offline",
};

export const VEHICLE_CLASSES = ["van", "box", "pickup", "utility", "shuttle"] as const;
export type VehicleClass = (typeof VEHICLE_CLASSES)[number];

export const CLASS_LABELS: Record<VehicleClass, string> = {
  van: "Cargo van",
  box: "Box truck",
  pickup: "Pickup",
  utility: "Utility",
  shuttle: "Shuttle",
};

export type Vehicle = {
  id: string;
  unit: string;
  name: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  plate: string;
  class: VehicleClass;
  status: VehicleStatus;
  lat: number;
  lng: number;
  heading: number;
  speedMph: number;
  odometer: number;
  fuelPct: number;
  driverId: string | null;
  lastPingAt: string;
  idleMinutes: number;
  route: Coord[];
  routeT: number;
  faultCode: string | null;
  geofenceId: string | null;
  utilization7d: number;
  mpg: number;
  nextPmMiles: number;
  assignedSince: string | null;
};

export type DriverStatus = "driving" | "on_shift" | "break" | "off";

export type Driver = {
  id: string;
  name: string;
  role: string;
  phone: string;
  safetyScore: number;
  hoursToday: number;
  hoursWeek: number;
  vehicleId: string | null;
  status: DriverStatus;
  hireYear: number;
  speeding30d: number;
  idleEvents30d: number;
  harsh30d: number;
};

export const ALERT_KINDS = [
  "speeding",
  "geofence",
  "idle",
  "fuel",
  "fault",
  "pm",
  "harsh",
  "offline",
  "inspection",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export type AlertSeverity = "critical" | "warn" | "info";

export type FleetAlert = {
  id: string;
  vehicleId: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  at: string;
  acknowledged: boolean;
};

export const JOB_STATUSES = ["overdue", "due", "scheduled", "in_progress", "done"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type MaintenanceJob = {
  id: string;
  vehicleId: string;
  title: string;
  shop: string;
  dueAt: string;
  status: JobStatus;
  milesDue: number | null;
  cost: number;
};

export type FuelDay = {
  day: string;
  gallons: number;
  cost: number;
  idleGal: number;
  miles: number;
};

export type Geofence = {
  id: string;
  name: string;
  kind: "yard" | "warehouse" | "airport" | "downtown";
  polygon: Coord[];
};

export type OrgSettings = {
  orgName: string;
  yardName: string;
  speedingMph: number;
  idleWarnMin: number;
};

export type FleetSnapshot = {
  vehicles: Vehicle[];
  drivers: Driver[];
  alerts: FleetAlert[];
  jobs: MaintenanceJob[];
  fuel: FuelDay[];
  geofences: Geofence[];
  settings: OrgSettings;
};

export type VehicleFilter = "all" | VehicleStatus | "alerted";

export const DEFAULT_SETTINGS: OrgSettings = {
  orgName: "Cinderwell Mobility",
  yardName: "Lenexa yard",
  speedingMph: 70,
  idleWarnMin: 15,
};

export const EMPTY_FLEET_SNAPSHOT: FleetSnapshot = {
  vehicles: [],
  drivers: [],
  alerts: [],
  jobs: [],
  fuel: [],
  geofences: [],
  settings: { ...DEFAULT_SETTINGS },
};

export const ALERT_KIND_LABELS: Record<AlertKind, string> = {
  speeding: "Speeding",
  geofence: "Geofence",
  idle: "Idle",
  fuel: "Fuel",
  fault: "Fault code",
  pm: "Maintenance",
  harsh: "Harsh event",
  offline: "Offline",
  inspection: "Inspection",
};
