import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import type { Vehicle } from "./fleet-types";

export function vehicleTitle(v: Vehicle): string {
  return `${v.year} ${v.make} ${v.model}`;
}

export function miles(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} mi`;
}

export function gallons(n: number): string {
  return `${n.toFixed(1)} gal`;
}

export function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function usdFine(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function clock(iso: string): string {
  return format(parseISO(iso), "h:mm a");
}

export function dayClock(iso: string): string {
  return format(parseISO(iso), "EEE h:mm a");
}

export function ago(iso: string, now: number): string {
  try {
    return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true, roundingMethod: "floor" });
  } catch {
    void now;
    return "—";
  }
}

export function phonePretty(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

export function fuelLabel(pctVal: number): string {
  if (pctVal <= 12) return "Critical";
  if (pctVal <= 25) return "Low";
  return `${Math.round(pctVal)}%`;
}

export function scoreTone(score: number): "ok" | "warn" | "accent" {
  if (score >= 88) return "ok";
  if (score >= 72) return "warn";
  return "accent";
}
