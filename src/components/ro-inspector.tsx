import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { TransportChip } from "@/components/transport-chip";
import { Badge } from "@/components/ui/badge";
import { useNow } from "@/components/now";
import { ago, clock, elapsedInStatus, lineTotals, miles, phonePretty, usd, vehicleLabel } from "@/lib/format";
import { computePriority } from "@/lib/priority";
import { useAppStore } from "@/lib/store";
import { CONTACT_PREF_LABELS, RO_STATUSES, STATUS_LABELS, type RoStatus } from "@/lib/types";
import { useState } from "react";

export function RoInspector() {
  const selectedId = useAppStore((s) => s.selectedId);
  const selectRo = useAppStore((s) => s.selectRo);
  const ros = useAppStore((s) => s.ros);
  const settings = useAppStore((s) => s.settings);
  const updateRoStatus = useAppStore((s) => s.updateRoStatus);
  const updateRo = useAppStore((s) => s.updateRo);
  const addTimeline = useAppStore((s) => s.addTimeline);
  const setComposer = useAppStore((s) => s.setComposer);
  const now = useNow();
  const [note, setNote] = useState("");

  const ro = ros.find((r) => r.id === selectedId) ?? null;
  const pri = ro ? computePriority(ro, now, settings) : null;
  const totals = ro ? lineTotals(ro) : null;

  return (
    <Sheet open={!!ro} onOpenChange={(o) => !o && selectRo(null)}>
      <SheetContent title={ro ? `RO ${ro.roNumber}` : "Repair order"} className="max-w-lg bg-elevated">
        {ro && pri && totals ? (
          <div className="flex h-full flex-col overflow-y-auto p-5 pr-12">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-xs text-muted">RO {ro.roNumber}</div>
                <h3 className="text-lg font-semibold tracking-tight">{ro.customerName}</h3>
                <p className="text-xs text-muted">
                  {vehicleLabel(ro)} · {miles(ro.mileage)}
                  {ro.vin ? ` · ${ro.vin.slice(-8)}` : ""}
                </p>
              </div>
              <StatusBadge status={ro.status} />
            </div>

            <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{pri.action}</p>

            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <Stat label="Promise" value={clock(ro.promiseTime)} />
              <Stat label="In status" value={elapsedInStatus(ro, now)} />
              <Stat label="Technician" value={ro.technician} />
              <Stat label="Contact" value={CONTACT_PREF_LABELS[ro.contactPref]} />
              <Stat label="Phone" value={phonePretty(ro.customerPhone) || "—"} />
              <div className="rounded-lg bg-surface px-3 py-2">
                <dt className="text-xs text-muted">Transport</dt>
                <dd className="mt-1">
                  <TransportChip type={ro.transportation} />
                </dd>
              </div>
            </dl>

            <div className="mt-4">
              <div className="mb-1 text-xs font-medium text-muted">Status</div>
              <NativeSelect
                className="h-9 w-full bg-surface"
                value={ro.status}
                onChange={(e) => updateRoStatus(ro.id, e.target.value as RoStatus, now)}
              >
                {RO_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <Section title="Concern">{ro.concern || "—"}</Section>
            <Section title="Diagnosis">{ro.diagnosis || "Still in diagnosis."}</Section>

            <div className="mt-4">
              <div className="mb-2 text-xs font-medium text-muted">Lines</div>
              <ul className="space-y-1.5">
                {ro.lines.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
                    <span>{l.description}</span>
                    <span className="flex items-center gap-2">
                      <Badge
                        tone={l.state === "approved" ? "ok" : l.state === "declined" ? "accent" : "warn"}
                      >
                        {l.state}
                      </Badge>
                      <span className="font-mono tabular-nums">{usd(l.amount)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">
                Recommended {usd(totals.recommended)} · Approved {usd(totals.approved)} · Declined {usd(totals.declined)}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  setComposer({
                    tool: "update",
                    roId: ro.id,
                    source: [ro.concern, ro.diagnosis, ro.notes].filter(Boolean).join("\n"),
                  })
                }
              >
                Write update
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setComposer({ tool: "cleaner", roId: ro.id, source: ro.techNotes || ro.diagnosis })}
              >
                Clean tech notes
              </Button>
            </div>

            <div className="mt-4">
              <div className="mb-1 text-xs font-medium text-muted">Note</div>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note" />
              <Button
                type="button"
                size="sm"
                className="mt-2"
                disabled={!note.trim()}
                onClick={() => {
                  updateRo(ro.id, { notes: ro.notes ? `${ro.notes}\n${note.trim()}` : note.trim() });
                  addTimeline(ro.id, note.trim(), "note", now);
                  setNote("");
                }}
              >
                Add to timeline
              </Button>
            </div>

            {ro.notes ? <Section title="Notes">{ro.notes}</Section> : null}

            <div className="mt-5">
              <div className="mb-2 text-xs font-medium text-muted">Timeline</div>
              <ol className="space-y-2">
                {[...ro.timeline].reverse().map((ev) => (
                  <li key={ev.id} className="text-sm">
                    <span className="font-mono text-xs text-muted">{ago(ev.at, now)}</span>
                    <div>{ev.label}</div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <div className="mt-4">
      <div className="mb-1 text-xs font-medium text-muted">{title}</div>
      <p className="text-sm">{children}</p>
    </div>
  );
}
