import { createFileRoute, Link } from "@tanstack/react-router";
import { SummaryCards } from "@/components/summary-cards";
import { FiltersBar } from "@/components/filters-bar";
import { QuickIntake } from "@/components/quick-intake";
import { RoTable, useVisibleRos } from "@/components/ro-table";
import { Scratchpad } from "@/components/scratchpad";
import { useAppStore } from "@/lib/store";
import { computeKpis } from "@/lib/kpis";
import { deriveFollowUps } from "@/lib/follow-ups";
import { useNow } from "@/components/now";
import { vehicleLabel } from "@/lib/format";
import { TodayNow } from "@/components/today-now";
import { AdvisorCopilot } from "@/components/advisor-copilot";
import { MorningBriefing } from "@/components/morning-briefing";

export const Route = createFileRoute("/_app/")({ component: Dashboard });

function Dashboard() {
  const ros = useAppStore((s) => s.ros);
  const settings = useAppStore((s) => s.settings);
  const followUps = useAppStore((s) => s.followUps);
  const selectRo = useAppStore((s) => s.selectRo);
  const now = useNow();
  const kpis = computeKpis(ros, settings, now);
  const queue = deriveFollowUps(ros, followUps, settings, now).slice(0, 4);
  const rows = useVisibleRos();
  const hydrated = useAppStore((s) => s.hydrated);
  const loadError = useAppStore((s) => s.loadError);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Lane board</h1>
          <p className="text-sm text-muted">
            {hydrated
              ? `${kpis.active} open · ${kpis.updatesDue} updates due · ${kpis.waitingCustomer} waiting on approval`
              : `${kpis.active} open · loading live times…`}
          </p>
        </div>
        <Link to="/fleet" className="text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline lg:hidden">
          Open fleet board
        </Link>
      </div>

      {loadError ? <div role="alert" className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-sm text-accent">{loadError}</div> : null}

      <AdvisorCopilot />
      <TodayNow />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SummaryCards kpis={kpis} />
        <QuickIntake />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3 min-w-0">
          <FiltersBar />
          <RoTable onOpen={selectRo} />
          {rows.length > 0 ? (
            <p className="text-xs text-subtle">{rows.length} repair orders in this view, sorted by urgency.</p>
          ) : null}
        </div>
        <aside className="space-y-3">
          <MorningBriefing />
          <section className="rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Needs contact</h2>
              <Link to="/follow-ups" className="text-xs font-medium text-muted hover:text-ink">
                Queue
              </Link>
            </div>
            {queue.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nothing waiting on a customer call.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {queue.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => selectRo(item.ro.id)}
                      className="w-full rounded-lg bg-bg px-2.5 py-2 text-left hover:bg-ink/4"
                    >
                      <div className="text-sm font-medium">{item.ro.customerName}</div>
                      <div className="text-xs text-muted">
                        {item.label} · {vehicleLabel(item.ro)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="hidden xl:block">
            <Scratchpad />
          </div>
        </aside>
      </div>
    </div>
  );
}
