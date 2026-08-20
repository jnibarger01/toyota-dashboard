import { createFileRoute } from "@tanstack/react-router";
import { useNow } from "@/components/now";
import { lineTotals, usd } from "@/lib/format";
import { computeKpis } from "@/lib/kpis";
import { useAppStore } from "@/lib/store";

export const Route = createFileRoute("/_app/performance")({ component: PerformancePage });

function PerformancePage() {
  const ros = useAppStore((s) => s.ros);
  const settings = useAppStore((s) => s.settings);
  const now = useNow();
  const kpis = computeKpis(ros, settings, now);
  const closed = ros.filter((r) => r.status === "completed");
  const closedDollars = closed.reduce((s, r) => s + lineTotals(r).approved, 0);
  const approvalRate =
    kpis.approved + kpis.recommended > 0 ? Math.round((kpis.approved / (kpis.approved + kpis.recommended)) * 100) : 0;
  const avgRo = closed.length ? closedDollars / closed.length : 0;

  const techs = [...new Set(ros.map((r) => r.technician).filter((t) => t !== "Unassigned"))];
  const byTech = techs.map((name) => {
    const mine = ros.filter((r) => r.technician === name);
    const open = mine.filter((r) => r.status !== "completed").length;
    const done = mine.filter((r) => r.status === "completed").length;
    return { name, open, done };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Performance</h1>
        <p className="text-sm text-muted">Today on this lane — local sample until a DMS feed is connected.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <Stat label="Closed today" value={String(closed.length)} hint={usd(closedDollars)} />
        <Stat label="Approved on open" value={usd(kpis.approved)} hint={`${approvalRate}% of presented`} />
        <Stat label="Still recommended" value={usd(kpis.recommended)} hint="Not yet decided" />
        <Stat label="Avg closed RO" value={usd(avgRo)} hint={`${kpis.stalled} stalled now`} />
      </div>
      <section className="rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <h2 className="text-sm font-medium">Technicians</h2>
        <ul className="mt-3 divide-y divide-border">
          {byTech.map((t) => (
            <li key={t.name} className="flex items-center justify-between py-2 text-sm">
              <span>{t.name}</span>
              <span className="font-mono text-muted tabular-nums">
                {t.open} open · {t.done} closed
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-elevated px-3 py-3 shadow-[var(--shadow-border)]">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-mono text-lg tabular-nums">{value}</div>
      <div className="text-xs text-subtle">{hint}</div>
    </div>
  );
}
