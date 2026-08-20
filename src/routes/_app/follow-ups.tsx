import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useNow } from "@/components/now";
import { deriveFollowUps } from "@/lib/follow-ups";
import { useAppStore } from "@/lib/store";
import { uid } from "@/lib/utils";
import { createServiceFollowUp, getServiceFollowUps, setServiceFollowUpOutcome } from "@/lib/follow-up-server";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useEffect, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { usd } from "@/lib/format";
import type { FollowUpReason } from "@/lib/types";

type FollowUpView = "queue" | "due_today" | "overdue" | "upcoming" | "high_value" | "completed";

export const Route = createFileRoute("/_app/follow-ups")({ component: FollowUpsPage });

function FollowUpsPage() {
  const ros = useAppStore((s) => s.ros);
  const followUps = useAppStore((s) => s.followUps);
  const settings = useAppStore((s) => s.settings);
  const selectRo = useAppStore((s) => s.selectRo);
  const addFollowUp = useAppStore((s) => s.addFollowUp);
  const setFollowUpOutcome = useAppStore((s) => s.setFollowUpOutcome);
  const replaceFollowUps = useAppStore((s) => s.replaceFollowUps);
  const { user } = useCurrentUserState();
  const now = useNow();
  const queue = deriveFollowUps(ros, followUps, settings, now);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [view, setView] = useState<FollowUpView>("queue");
  const [manualRoId, setManualRoId] = useState("");
  const [manualReason, setManualReason] = useState<FollowUpReason>("customer_callback");
  const [manualLabel, setManualLabel] = useState("");
  const [manualDueAt, setManualDueAt] = useState("");
  const [manualOpportunity, setManualOpportunity] = useState("");
  const [manualNote, setManualNote] = useState("");
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday); endOfToday.setDate(endOfToday.getDate() + 1);
  const savedView = followUps.filter((item) => {
    const due = item.callbackAt ? new Date(item.callbackAt).getTime() : null;
    if (view === "completed") return item.outcome === "completed";
    if (item.outcome !== "open" && item.outcome !== "later") return false;
    if (view === "overdue") return due != null && due < startOfToday.getTime();
    if (view === "due_today") return due != null && due >= startOfToday.getTime() && due < endOfToday.getTime();
    if (view === "upcoming") return due != null && due >= endOfToday.getTime();
    if (view === "high_value") return item.estimatedOpportunity >= settings.highDollarThreshold;
    return false;
  });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void getServiceFollowUps().then((records) => { if (!cancelled) replaceFollowUps(records); }).catch(() => { if (!cancelled) setError("Saved follow-ups are unavailable right now."); });
    return () => { cancelled = true; };
  }, [user, replaceFollowUps]);

  const setOutcome = async (item: typeof queue[number], outcome: "called" | "completed") => {
    if (savingKey) return;
    const stored = followUps.find((followUp) => followUp.roId === item.ro.id && followUp.reason === item.reason && followUp.outcome === "open");
    setSavingKey(`${item.key}-${outcome}`);
    setError(null);
    try {
      if (user) {
        const persisted = stored
          ? await setServiceFollowUpOutcome({ data: { id: stored.id, outcome } })
          : await (async () => {
              const created = await createServiceFollowUp({ data: { id: uid("fu"), roId: item.ro.id, reason: item.reason, label: item.label } });
              return setServiceFollowUpOutcome({ data: { id: created.id, outcome } });
            })();
        if (stored) setFollowUpOutcome(persisted.id, outcome);
        else addFollowUp(persisted);
      } else if (stored) setFollowUpOutcome(stored.id, outcome);
      else addFollowUp({ id: uid("fu"), roId: item.ro.id, reason: item.reason, label: item.label, outcome, callbackAt: null, createdAt: new Date(now).toISOString(), note: "", estimatedOpportunity: 0 });
    } catch {
      setError("Follow-up was not saved.");
    } finally {
      setSavingKey(null);
    }
  };

  const createManual = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!manualRoId || !manualLabel.trim() || savingKey) return;
    const estimatedOpportunity = manualOpportunity ? Number(manualOpportunity) : 0;
    if (!Number.isFinite(estimatedOpportunity) || estimatedOpportunity < 0) { setError("Opportunity must be a positive dollar amount."); return; }
    setSavingKey("manual"); setError(null);
    const callbackAt = manualDueAt ? new Date(manualDueAt).toISOString() : null;
    try {
      const item = user
        ? await createServiceFollowUp({ data: { roId: manualRoId, reason: manualReason, label: manualLabel.trim(), callbackAt, estimatedOpportunity, note: manualNote.trim(), createdManually: true } })
        : { id: uid("fu"), roId: manualRoId, reason: manualReason, label: manualLabel.trim(), outcome: "open" as const, callbackAt, estimatedOpportunity, note: manualNote.trim(), createdAt: new Date(now).toISOString(), createdManually: true };
      addFollowUp(item);
      setManualLabel(""); setManualDueAt(""); setManualOpportunity(""); setManualNote("");
    } catch {
      setError("Follow-up was not saved.");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Follow-ups</h1>
        <p className="text-sm text-muted">{queue.length} in queue — approvals, ready vehicles, overdue updates.</p>
      </div>
      <NativeSelect aria-label="Follow-up view" className="h-9 w-full max-w-xs bg-elevated" value={view} onChange={(event) => setView(event.target.value as FollowUpView)}>
        <option value="queue">Active queue</option><option value="due_today">Due today</option><option value="overdue">Overdue</option><option value="upcoming">Upcoming</option><option value="high_value">High value</option><option value="completed">Completed</option>
      </NativeSelect>
      {view === "queue" ? <ul className="space-y-2">
        {queue.map((item) => {
          return (
            <li key={item.key} className="flex flex-wrap items-center gap-3 rounded-xl bg-elevated px-4 py-3 shadow-[var(--shadow-border)]">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => selectRo(item.ro.id)}>
                <div className="font-medium">{item.ro.customerName}</div>
                <div className="text-sm text-muted">{item.label}</div>
              </button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={savingKey !== null}
                onClick={() => void setOutcome(item, "called")}
              >
                Mark called
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={savingKey !== null}
                onClick={() => void setOutcome(item, "completed")}
              >
                Done
              </Button>
            </li>
          );
        })}
      </ul> : <ul className="space-y-2">{savedView.map((item) => {
        const ro = ros.find((record) => record.id === item.roId);
        return <li key={item.id} className="rounded-xl bg-elevated px-4 py-3 shadow-[var(--shadow-border)]"><button type="button" className="text-left" onClick={() => selectRo(item.roId)}><div className="font-medium">{ro?.customerName ?? "Repair order"}</div><div className="text-sm text-muted">{item.label}{item.callbackAt ? ` · ${new Date(item.callbackAt).toLocaleString()}` : ""}</div>{item.estimatedOpportunity > 0 ? <div className="mt-1 text-xs font-medium">Opportunity {usd(item.estimatedOpportunity)}</div> : null}</button></li>;
      })}</ul>}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      {view === "queue" && queue.length === 0 ? <p className="text-sm text-muted">Queue is clear.</p> : null}
      {view !== "queue" && savedView.length === 0 ? <p className="text-sm text-muted">No follow-ups in this view.</p> : null}
      <details className="rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <summary className="cursor-pointer text-sm font-medium">Add follow-up</summary>
        <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={createManual}>
          <label className="grid gap-1 text-xs text-muted">Repair order
            <NativeSelect required aria-label="Repair order for follow-up" value={manualRoId} onChange={(event) => setManualRoId(event.target.value)} className="h-9 bg-surface text-sm text-foreground"><option value="">Select an active RO</option>{ros.filter((ro) => ro.status !== "completed").map((ro) => <option key={ro.id} value={ro.id}>{ro.roNumber} · {ro.customerName}</option>)}</NativeSelect>
          </label>
          <label className="grid gap-1 text-xs text-muted">Reason
            <NativeSelect aria-label="Follow-up reason" value={manualReason} onChange={(event) => setManualReason(event.target.value as FollowUpReason)} className="h-9 bg-surface text-sm text-foreground"><option value="customer_callback">Customer callback</option><option value="deferred_maintenance">Deferred maintenance</option><option value="post_service">Post-service contact</option><option value="unsold_recommendation">Unsold recommendation</option><option value="appointment_needed">Appointment needed</option><option value="parts_arrival">Parts arrival</option><option value="internal_follow_up">Internal follow-up</option></NativeSelect>
          </label>
          <label className="grid gap-1 text-xs text-muted sm:col-span-2">Follow-up
            <input required maxLength={500} value={manualLabel} onChange={(event) => setManualLabel(event.target.value)} className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-foreground" placeholder="What needs to happen?" />
          </label>
          <label className="grid gap-1 text-xs text-muted">Due
            <input type="datetime-local" value={manualDueAt} onChange={(event) => setManualDueAt(event.target.value)} className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-foreground" />
          </label>
          <label className="grid gap-1 text-xs text-muted">Opportunity
            <input type="number" min="0" max="1000000" step="0.01" value={manualOpportunity} onChange={(event) => setManualOpportunity(event.target.value)} className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-foreground" placeholder="$0" />
          </label>
          <label className="grid gap-1 text-xs text-muted sm:col-span-2">Notes
            <textarea maxLength={4000} value={manualNote} onChange={(event) => setManualNote(event.target.value)} className="min-h-18 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground" placeholder="Context for the next advisor" />
          </label>
          <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={savingKey !== null}>{savingKey === "manual" ? "Saving…" : "Save follow-up"}</Button></div>
        </form>
      </details>
    </div>
  );
}
