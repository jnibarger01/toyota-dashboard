import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type VehicleStatus } from "@/lib/fleet-types";

const TONE: Record<VehicleStatus, "ok" | "warn" | "neutral" | "info" | "danger"> = {
  moving: "ok",
  idle: "warn",
  on_lot: "neutral",
  in_shop: "info",
  offline: "danger",
};

export function StatusChip({ status }: { status: VehicleStatus }) {
  return <Badge tone={TONE[status]}>{STATUS_LABELS[status]}</Badge>;
}
