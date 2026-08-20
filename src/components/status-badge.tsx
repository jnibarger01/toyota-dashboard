import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type RoStatus } from "@/lib/types";

const TONE: Record<RoStatus, "neutral" | "warn" | "ok" | "info" | "accent"> = {
  checked_in: "neutral",
  waiting_technician: "warn",
  diagnosing: "info",
  waiting_video: "info",
  recommendations_ready: "warn",
  waiting_approval: "accent",
  approved: "ok",
  waiting_parts: "warn",
  repair_in_progress: "info",
  quality_check: "info",
  ready_for_pickup: "ok",
  completed: "neutral",
};

export function StatusBadge({ status }: { status: RoStatus }) {
  return <Badge tone={TONE[status]}>{STATUS_LABELS[status]}</Badge>;
}
