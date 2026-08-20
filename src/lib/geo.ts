import type { Coord, Geofence } from "./fleet-types";

/** Kansas City metro bounds used by the live map. */
export const WEST = -94.86;
export const EAST = -94.32;
export const NORTH = 39.34;
export const SOUTH = 38.84;
export const MAP_W = 1000;
export const MAP_H = 640;

export function project(lat: number, lng: number): { x: number; y: number } {
  return {
    x: ((lng - WEST) / (EAST - WEST)) * MAP_W,
    y: ((NORTH - lat) / (NORTH - SOUTH)) * MAP_H,
  };
}

export function pointsToPath(coords: Coord[]): string {
  return coords
    .map((c, i) => {
      const { x, y } = project(c.lat, c.lng);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function polygonToPath(coords: Coord[]): string {
  return `${pointsToPath(coords)} Z`;
}

export function haversineMiles(a: Coord, b: Coord): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function routeLengthMiles(route: Coord[]): number {
  let n = 0;
  for (let i = 1; i < route.length; i++) n += haversineMiles(route[i - 1], route[i]);
  return n;
}

export function interpolateRoute(route: Coord[], t: number): Coord & { heading: number } {
  if (route.length === 0) return { lat: 39.1, lng: -94.58, heading: 0 };
  if (route.length === 1) return { ...route[0], heading: 0 };
  const clamped = Math.max(0, Math.min(0.9999, t));
  const length = routeLengthMiles(route) || 1;
  let remain = clamped * length;
  for (let i = 1; i < route.length; i++) {
    const seg = haversineMiles(route[i - 1], route[i]);
    if (remain <= seg || i === route.length - 1) {
      const p = seg === 0 ? 0 : remain / seg;
      const lat = route[i - 1].lat + (route[i].lat - route[i - 1].lat) * p;
      const lng = route[i - 1].lng + (route[i].lng - route[i - 1].lng) * p;
      const heading =
        (Math.atan2(route[i].lng - route[i - 1].lng, route[i].lat - route[i - 1].lat) *
          180) /
        Math.PI;
      return { lat, lng, heading };
    }
    remain -= seg;
  }
  const last = route[route.length - 1];
  return { ...last, heading: 0 };
}

export function pointInPolygon(pt: Coord, polygon: Coord[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].lat;
    const yj = polygon[j].lat;
    const xi = polygon[i].lng;
    const xj = polygon[j].lng;
    const intersect =
      yi > pt.lat !== yj > pt.lat && pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export const HIGHWAYS: { id: string; label: string; path: Coord[] }[] = [
  {
    id: "i70",
    label: "I-70",
    path: [
      { lat: 39.116, lng: -94.86 },
      { lat: 39.112, lng: -94.78 },
      { lat: 39.108, lng: -94.68 },
      { lat: 39.103, lng: -94.58 },
      { lat: 39.1, lng: -94.48 },
      { lat: 39.094, lng: -94.38 },
      { lat: 39.09, lng: -94.32 },
    ],
  },
  {
    id: "i35",
    label: "I-35",
    path: [
      { lat: 38.85, lng: -94.78 },
      { lat: 38.92, lng: -94.7 },
      { lat: 39.0, lng: -94.64 },
      { lat: 39.06, lng: -94.6 },
      { lat: 39.1, lng: -94.58 },
      { lat: 39.18, lng: -94.54 },
      { lat: 39.28, lng: -94.5 },
      { lat: 39.34, lng: -94.48 },
    ],
  },
  {
    id: "i29",
    label: "I-29",
    path: [
      { lat: 39.11, lng: -94.59 },
      { lat: 39.16, lng: -94.62 },
      { lat: 39.22, lng: -94.66 },
      { lat: 39.28, lng: -94.7 },
      { lat: 39.34, lng: -94.74 },
    ],
  },
  {
    id: "i435",
    label: "I-435",
    path: [
      { lat: 39.22, lng: -94.75 },
      { lat: 39.26, lng: -94.64 },
      { lat: 39.24, lng: -94.5 },
      { lat: 39.18, lng: -94.4 },
      { lat: 39.08, lng: -94.36 },
      { lat: 38.96, lng: -94.38 },
      { lat: 38.88, lng: -94.5 },
      { lat: 38.87, lng: -94.64 },
      { lat: 38.92, lng: -94.78 },
      { lat: 39.04, lng: -94.82 },
      { lat: 39.14, lng: -94.8 },
      { lat: 39.22, lng: -94.75 },
    ],
  },
  {
    id: "k10",
    label: "K-10",
    path: [
      { lat: 38.96, lng: -94.86 },
      { lat: 38.958, lng: -94.78 },
      { lat: 38.955, lng: -94.72 },
      { lat: 38.95, lng: -94.66 },
    ],
  },
  {
    id: "us69",
    label: "US-69",
    path: [
      { lat: 38.84, lng: -94.668 },
      { lat: 38.9, lng: -94.668 },
      { lat: 38.98, lng: -94.668 },
      { lat: 39.04, lng: -94.64 },
      { lat: 39.09, lng: -94.6 },
    ],
  },
];

export const RIVER: Coord[] = [
  { lat: 39.2, lng: -94.86 },
  { lat: 39.18, lng: -94.78 },
  { lat: 39.16, lng: -94.7 },
  { lat: 39.145, lng: -94.62 },
  { lat: 39.12, lng: -94.58 },
  { lat: 39.115, lng: -94.5 },
  { lat: 39.13, lng: -94.42 },
  { lat: 39.16, lng: -94.34 },
];

export const DISTRICTS: { name: string; lat: number; lng: number }[] = [
  { name: "Downtown", lat: 39.1, lng: -94.578 },
  { name: "Northland", lat: 39.24, lng: -94.65 },
  { name: "Plaza", lat: 39.041, lng: -94.591 },
  { name: "Overland Park", lat: 38.982, lng: -94.67 },
  { name: "Shawnee", lat: 39.023, lng: -94.72 },
  { name: "Lee's Summit", lat: 38.91, lng: -94.39 },
];

function box(lat: number, lng: number, dLat: number, dLng: number): Coord[] {
  return [
    { lat: lat + dLat, lng: lng - dLng },
    { lat: lat + dLat, lng: lng + dLng },
    { lat: lat - dLat, lng: lng + dLng },
    { lat: lat - dLat, lng: lng - dLng },
  ];
}

export const GEOFENCES: Geofence[] = [
  {
    id: "gf-yard",
    name: "Lenexa yard",
    kind: "yard",
    polygon: box(38.9536, -94.7336, 0.018, 0.028),
  },
  {
    id: "gf-wh",
    name: "East warehouse",
    kind: "warehouse",
    polygon: box(39.091, -94.415, 0.016, 0.026),
  },
  {
    id: "gf-mci",
    name: "MCI airport",
    kind: "airport",
    polygon: box(39.2976, -94.7139, 0.022, 0.038),
  },
  {
    id: "gf-dt",
    name: "Downtown core",
    kind: "downtown",
    polygon: box(39.1, -94.578, 0.02, 0.028),
  },
];
