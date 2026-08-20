import { Badge } from "@/components/ui/badge";
import { TRANSPORT_LABELS, type TransportType } from "@/lib/types";

export function TransportChip({ type }: { type: TransportType }) {
  return <Badge tone={type === "waiting" ? "accent" : "outline"}>{TRANSPORT_LABELS[type]}</Badge>;
}
