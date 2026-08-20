import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ago, clock, vehicleLabel } from "@/lib/format";
import { computePriority } from "@/lib/priority";
import { useAppStore } from "@/lib/store";
import { useNow } from "@/components/now";

/** The focused, deterministic attention queue for an advisor's next actions. */
export function TodayNow() {
  const ros = useAppStore((s) => s.ros);
  const settings = useAppStore((s) => s.settings);
  const selectRo = useAppStore((s) => s.selectRo);
  const setComposer = useAppStore((s) => s.setComposer);
  const now = useNow();
  const items = ros
    .filter((ro) => ro.status !== "completed")
    .map((ro) => ({ ro, priority: computePriority(ro, now, settings) }))
    .filter(({ priority }) => priority.score > 0)
    .sort((a, b) => b.priority.score - a.priority.score)
    .slice(0, 5);

  return (
    <section className="rounded-xl border border-border bg-elevated shadow-[var(--shadow-border)]" aria-labelledby="today-now-title">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 id="today-now-title" className="text-sm font-semibold tracking-tight">Today / Now</h2>
          <p className="text-xs text-muted">Ranked by explicit lane rules — not AI speculation.</p>
        </div>
        <span className="font-mono text-xs text-muted">{items.length} actions</span>
      </div>
      {items.length ? (
        <ol className="divide-y divide-border">
          {items.map(({ ro, priority }, index) => {
            const first = priority.signals[0];
            return (
              <li key={ro.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
                <span className="font-mono text-xs text-muted">{String(index + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-xs">RO {ro.roNumber}</span>
                    <span className="text-sm font-medium">{ro.customerName}</span>
                    <Badge tone={priority.urgency === "critical" ? "accent" : priority.urgency === "warn" ? "warn" : "neutral"}>{priority.urgency.toUpperCase()}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted">{vehicleLabel(ro)} · {first?.label ?? priority.action}</p>
                  <p className="mt-0.5 font-mono text-xs text-subtle">
                    {priority.updateOverdue && ro.nextUpdateDue ? `UPDATE +${Math.ceil((now - new Date(ro.nextUpdateDue).getTime()) / 60_000)}m` : `PROMISE ${clock(ro.promiseTime)}`}
                    {" · "}{ro.status.replaceAll("_", " ").toUpperCase()}
                    {" · "}{ago(ro.statusChangedAt, now)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {priority.updateOverdue ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => setComposer({ tool: "update", roId: ro.id, source: [ro.concern, ro.diagnosis, ro.notes].filter(Boolean).join("\n") })}>
                      Generate update
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" variant="ghost" onClick={() => selectRo(ro.id)}>Open RO</Button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="px-4 py-8 text-center text-sm text-muted">No exceptions need advisor attention right now.</p>
      )}
    </section>
  );
}
