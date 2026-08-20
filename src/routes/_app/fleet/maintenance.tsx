import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dayClock, miles, usd } from "@/lib/fleet-format";
import { useFleetStore, vehicleOf } from "@/lib/fleet-store";
import type { JobStatus } from "@/lib/fleet-types";

export const Route = createFileRoute("/_app/fleet/maintenance")({ component: ShopPage });

function toneFor(s: JobStatus): "danger" | "warn" | "info" | "ok" | "neutral" {
  if (s === "overdue") return "danger";
  if (s === "due") return "warn";
  if (s === "in_progress") return "info";
  if (s === "done") return "ok";
  return "neutral";
}

export function ShopPage() {
  const jobs = useFleetStore((s) => s.jobs);
  const vehicles = useFleetStore((s) => s.vehicles);
  const completeJob = useFleetStore((s) => s.completeJob);
  const select = useFleetStore((s) => s.select);
  const ordered = [...jobs].sort((a, b) => {
    const rank: Record<JobStatus, number> = {
      overdue: 0,
      in_progress: 1,
      due: 2,
      scheduled: 3,
      done: 4,
    };
    return rank[a.status] - rank[b.status];
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Shop</h1>
        <p className="text-sm text-muted">Preventive maintenance, fault work, and annuals.</p>
      </div>
      <ul className="space-y-2">
        {ordered.map((j) => {
          const v = vehicleOf(vehicles, j.vehicleId);
          return (
            <li key={j.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-elevated px-4 py-3 shadow-[var(--shadow-border)]">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="font-mono text-sm hover:underline" onClick={() => select(j.vehicleId)}>
                    {v?.unit ?? j.vehicleId}
                  </button>
                  <Badge tone={toneFor(j.status)}>{j.status.replace("_", " ")}</Badge>
                </div>
                <div className="text-sm">{j.title}</div>
                <div className="text-xs text-muted">
                  {j.shop} · {dayClock(j.dueAt)}
                  {j.milesDue != null ? ` · ${j.milesDue < 0 ? `${miles(-j.milesDue)} overdue` : miles(j.milesDue)}` : ""}
                  {` · ${usd(j.cost)}`}
                </div>
              </div>
              {j.status !== "done" ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => completeJob(j.id)}>
                  Mark done
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
