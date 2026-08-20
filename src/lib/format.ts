import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import type { RepairOrder } from "./types";

export function vehicleLabel(ro: RepairOrder): string {
  return `${ro.year} ${ro.vehicle}`;
}

export function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function usdFine(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function miles(n: number): string {
  return `${n.toLocaleString("en-US")} mi`;
}

export function clock(iso: string): string {
  return format(parseISO(iso), "h:mm a");
}

export function ago(iso: string, now: number): string {
  try {
    return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true, roundingMethod: "floor" });
  } catch {
    void now;
    return "—";
  }
}

export function elapsedInStatus(ro: RepairOrder, now: number): string {
  const ms = Math.max(0, now - new Date(ro.statusChangedAt).getTime());
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function phonePretty(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

export function lineTotals(ro: RepairOrder) {
  const recommended = ro.lines.filter((l) => l.state === "recommended").reduce((s, l) => s + l.amount, 0);
  const approved = ro.lines.filter((l) => l.state === "approved").reduce((s, l) => s + l.amount, 0);
  const declined = ro.lines.filter((l) => l.state === "declined").reduce((s, l) => s + l.amount, 0);
  return { recommended, approved, declined, open: recommended + approved };
}
