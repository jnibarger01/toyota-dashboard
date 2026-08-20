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
import { CONTACT_PREF_LABELS, RO_STATUSES, STATUS_LABELS, TECHNICIANS, type ContactPref, type RoStatus } from "@/lib/types";
import { addRepairOrderBlocker, addRepairOrderRecommendation, decideRepairOrderRecommendation, getActiveRepairOrders, getRepairOrderHistory, getRepairOrderRecommendations, recordCustomerContact, recordInternalRepairOrderNote, resolveRepairOrderBlocker, resolveRepairOrderSyncConflict, setRepairOrderUpdateInterval, transitionRepairOrder, updateRepairOrderOperationalFields } from "@/lib/ro-server";
import { BLOCKER_TYPES, allowedTransitions, calculateWorkflowDurations, type BlockerType, type WorkflowState } from "@/lib/ro-domain";
import type { RecommendationRecord, RepairOrderRecord } from "@/lib/ro-repository.server";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useEffect, useState } from "react";

type OperationalPatch = { promiseAt?: string | null; technicianName?: string | null; technicianFindings?: string | null; diagnosis?: string | null; partsStatus?: string; partsEtaAt?: string | null };

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
  const { user } = useCurrentUserState();
  const [note, setNote] = useState("");
  const [contactMethod, setContactMethod] = useState<ContactPref>("call");
  const [contactNote, setContactNote] = useState("");
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [intervalSaving, setIntervalSaving] = useState(false);
  const [workflowRecord, setWorkflowRecord] = useState<RepairOrderRecord | null>(null);
  const [transitionSaving, setTransitionSaving] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [blockerType, setBlockerType] = useState<BlockerType>("parts");
  const [blockerDescription, setBlockerDescription] = useState("");
  const [blockerSaving, setBlockerSaving] = useState(false);
  const [blockerError, setBlockerError] = useState<string | null>(null);
  const [blockerResolving, setBlockerResolving] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [operationalSaving, setOperationalSaving] = useState(false);
  const [operationalError, setOperationalError] = useState<string | null>(null);
  const [syncResolving, setSyncResolving] = useState(false);
  const [syncResolutionError, setSyncResolutionError] = useState<string | null>(null);
  const [diagnosisDraft, setDiagnosisDraft] = useState("");
  const [findingsDraft, setFindingsDraft] = useState("");
  const [recommendations, setRecommendations] = useState<RecommendationRecord[] | null>(null);
  const [recommendationSaving, setRecommendationSaving] = useState<string | null>(null);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [estimateDescription, setEstimateDescription] = useState("");
  const [estimateAmount, setEstimateAmount] = useState("");
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getRepairOrderHistory>> | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const ro = ros.find((r) => r.id === selectedId) ?? null;
  const roId = ro?.id ?? null;
  const pri = ro ? computePriority(ro, now, settings) : null;
  const totals = ro ? lineTotals(ro) : null;

  useEffect(() => {
    if (!user || !roId) { setHistory(null); setHistoryError(null); return; }
    let cancelled = false;
    setHistory(null); setHistoryError(null);
    void getRepairOrderHistory({ data: { roId } }).then((result) => { if (!cancelled) setHistory(result); }).catch(() => { if (!cancelled) setHistoryError("Audited history is unavailable right now."); });
    return () => { cancelled = true; };
  }, [user, roId]);

  useEffect(() => {
    if (!user || !roId) { setRecommendations(null); setRecommendationError(null); return; }
    let cancelled = false;
    void getRepairOrderRecommendations({ data: { roId } }).then((items) => { if (!cancelled) setRecommendations(items); }).catch(() => { if (!cancelled) setRecommendationError("Recommendations are unavailable right now."); });
    return () => { cancelled = true; };
  }, [user, roId]);

  useEffect(() => {
    setDiagnosisDraft(ro?.diagnosis ?? "");
    setFindingsDraft(ro?.techNotes ?? "");
  }, [roId, ro?.diagnosis, ro?.techNotes]);

  useEffect(() => {
    if (!user || !roId) { setWorkflowRecord(null); setTransitionError(null); return; }
    let cancelled = false;
    void getActiveRepairOrders().then((records) => {
      if (!cancelled) setWorkflowRecord(records.find((record) => record.id === roId) ?? null);
    }).catch(() => { if (!cancelled) setTransitionError("Workflow state is unavailable right now."); });
    return () => { cancelled = true; };
  }, [user, roId]);

  const changeWorkflowState = async (to: WorkflowState) => {
    if (!ro || !workflowRecord || transitionSaving || to === workflowRecord.state) return;
    setTransitionSaving(true);
    setTransitionError(null);
    try {
      const updated = await transitionRepairOrder({ data: { roId: ro.id, to, expectedVersion: workflowRecord.version } });
      setWorkflowRecord(updated);
      updateRoStatus(ro.id, legacyStatusForWorkflow(to), now);
      addTimeline(ro.id, `Workflow changed to ${workflowLabel(to)}`, "status", now);
      void getRepairOrderHistory({ data: { roId: ro.id } }).then(setHistory).catch(() => undefined);
    } catch (error) {
      setTransitionError(error instanceof Error ? error.message : "Status change was not saved.");
    } finally {
      setTransitionSaving(false);
    }
  };

  const addBlocker = async () => {
    if (!ro || !blockerDescription.trim() || blockerSaving) return;
    setBlockerSaving(true);
    setBlockerError(null);
    try {
      if (user) {
        if (!workflowRecord) throw new Error("Authoritative workflow state is still loading.");
        const updated = await addRepairOrderBlocker({ data: { roId: ro.id, type: blockerType, description: blockerDescription.trim(), severity: "medium", expectedVersion: workflowRecord.version } });
        setWorkflowRecord(updated);
      }
      addTimeline(ro.id, `Blocker added: ${workflowLabel(blockerType as WorkflowState)} — ${blockerDescription.trim()}`, "parts", now);
      setBlockerDescription("");
      if (user) void getRepairOrderHistory({ data: { roId: ro.id } }).then(setHistory).catch(() => undefined);
    } catch {
      setBlockerError("Blocker was not saved.");
    } finally {
      setBlockerSaving(false);
    }
  };

  const resolveBlocker = async (blockerId: string) => {
    if (!ro || !workflowRecord || blockerResolving) return;
    setBlockerResolving(blockerId);
    setBlockerError(null);
    try {
      const updated = await resolveRepairOrderBlocker({ data: { roId: ro.id, blockerId, expectedVersion: workflowRecord.version } });
      setWorkflowRecord(updated);
      addTimeline(ro.id, "Blocker resolved", "note", now);
      void getRepairOrderHistory({ data: { roId: ro.id } }).then(setHistory).catch(() => undefined);
    } catch (error) {
      setBlockerError(error instanceof Error ? error.message : "Blocker was not resolved.");
    } finally {
      setBlockerResolving(null);
    }
  };

  const markContacted = async () => {
    if (!ro || contactSaving) return;
    const interval = workflowRecord?.updateIntervalMinutes ?? (ro.transportation === "waiting" ? settings.waitingUpdateIntervalMin : settings.updateIntervalMin);
    const at = new Date(now).toISOString();
    const summary = `Customer contacted by ${CONTACT_PREF_LABELS[contactMethod]}${contactNote.trim() ? ` — ${contactNote.trim()}` : ""}`;

    setContactError(null);
    setContactSaving(true);
    try {
      if (user) {
        if (!workflowRecord) throw new Error("Authoritative workflow state is still loading.");
        const updated = await recordCustomerContact({
          data: {
            roId: ro.id,
            expectedVersion: workflowRecord.version,
            method: contactMethod === "call" ? "phone" : contactMethod === "text" ? "sms" : "email",
            summary,
            outcome: contactNote.trim() || undefined,
            intervalMinutes: interval,
          },
        });
        setWorkflowRecord(updated);
      }
      updateRo(ro.id, { lastCustomerUpdate: at, nextUpdateDue: new Date(now + interval * 60_000).toISOString() });
      addTimeline(ro.id, summary, "contact", now);
      setContactNote("");
      if (user) void getRepairOrderHistory({ data: { roId: ro.id } }).then(setHistory).catch(() => undefined);
    } catch {
      setContactError("Contact was not saved. The customer timer was left unchanged.");
    } finally {
      setContactSaving(false);
    }
  };

  const addInternalNote = async () => {
    if (!ro || !note.trim() || noteSaving) return;
    const text = note.trim();
    setNoteSaving(true);
    setNoteError(null);
    try {
      if (user) await recordInternalRepairOrderNote({ data: { roId: ro.id, note: text } });
      updateRo(ro.id, { notes: ro.notes ? `${ro.notes}\n${text}` : text });
      addTimeline(ro.id, text, "note", now);
      setNote("");
      if (user) void getRepairOrderHistory({ data: { roId: ro.id } }).then(setHistory).catch(() => undefined);
    } catch {
      setNoteError("Internal note was not saved.");
    } finally {
      setNoteSaving(false);
    }
  };

  const setUpdateInterval = async (value: string) => {
    if (!ro || !workflowRecord || intervalSaving) return;
    const intervalMinutes = Number(value);
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 24 * 60) { setContactError("Update interval must be between 1 and 1,440 minutes."); return; }
    setIntervalSaving(true);
    setContactError(null);
    try {
      const updated = await setRepairOrderUpdateInterval({ data: { roId: ro.id, expectedVersion: workflowRecord.version, intervalMinutes } });
      setWorkflowRecord(updated);
      updateRo(ro.id, { nextUpdateDue: updated.nextUpdateDueAt });
      addTimeline(ro.id, `Customer update interval set to ${intervalMinutes}m`, "contact", now);
      void getRepairOrderHistory({ data: { roId: ro.id } }).then(setHistory).catch(() => undefined);
    } catch (error) {
      setContactError(error instanceof Error ? error.message : "Update interval was not saved.");
    } finally {
      setIntervalSaving(false);
    }
  };

  const saveOperational = async (patch: OperationalPatch, localPatch: Parameters<typeof updateRo>[1], label: string) => {
    if (!ro || operationalSaving) return;
    setOperationalSaving(true);
    setOperationalError(null);
    try {
      if (user) {
        if (!workflowRecord) throw new Error("Authoritative workflow state is still loading.");
        const updated = await updateRepairOrderOperationalFields({ data: { ...patch, roId: ro.id, expectedVersion: workflowRecord.version } });
        setWorkflowRecord(updated);
      }
      updateRo(ro.id, localPatch);
      addTimeline(ro.id, label, "note", now);
      if (user) void getRepairOrderHistory({ data: { roId: ro.id } }).then(setHistory).catch(() => undefined);
    } catch (error) {
      setOperationalError(error instanceof Error ? error.message : "Operational change was not saved.");
    } finally {
      setOperationalSaving(false);
    }
  };

  const decideRecommendation = async (id: string, state: "recommended" | "approved" | "declined") => {
    if (!ro || !workflowRecord || recommendationSaving) return;
    setRecommendationSaving(id);
    setRecommendationError(null);
    try {
      const updated = await decideRepairOrderRecommendation({ data: { roId: ro.id, id, state, expectedVersion: workflowRecord.version } });
      setWorkflowRecord(updated);
      const nextRecommendations = (recommendations ?? []).map((item) => item.id === id ? { ...item, state, decidedAt: state === "recommended" ? null : new Date().toISOString() } : item);
      setRecommendations(nextRecommendations);
      updateRo(ro.id, { lines: nextRecommendations.map((item) => ({ id: item.id, description: item.description, amount: item.amount, hours: item.laborHours ?? 0, state: item.state })) });
      addTimeline(ro.id, `Recommendation ${state}`, "approval", now);
      void getRepairOrderHistory({ data: { roId: ro.id } }).then(setHistory).catch(() => undefined);
    } catch (error) {
      setRecommendationError(error instanceof Error ? error.message : "Recommendation decision was not saved.");
    } finally {
      setRecommendationSaving(null);
    }
  };

  const addEstimate = async () => {
    if (!ro || !workflowRecord || recommendationSaving || !estimateDescription.trim()) return;
    const amount = Number(estimateAmount);
    if (!Number.isFinite(amount) || amount < 0) { setRecommendationError("Enter a valid non-negative estimate amount."); return; }
    setRecommendationSaving("new");
    setRecommendationError(null);
    try {
      const updated = await addRepairOrderRecommendation({ data: { roId: ro.id, description: estimateDescription.trim(), amount, expectedVersion: workflowRecord.version } });
      setWorkflowRecord(updated);
      setRecommendations(await getRepairOrderRecommendations({ data: { roId: ro.id } }));
      updateRo(ro.id, { lines: [...ro.lines, { id: `local-${Date.now()}`, description: estimateDescription.trim(), amount, hours: 0, state: "recommended" }] });
      addTimeline(ro.id, `Estimate added: ${estimateDescription.trim()}`, "approval", now);
      setEstimateDescription("");
      setEstimateAmount("");
      void getRepairOrderHistory({ data: { roId: ro.id } }).then(setHistory).catch(() => undefined);
    } catch (error) {
      setRecommendationError(error instanceof Error ? error.message : "Estimate was not saved.");
    } finally {
      setRecommendationSaving(null);
    }
  };

  const resolveSyncConflict = async () => {
    if (!ro || !workflowRecord || !workflowRecord.conflictState || syncResolving) return;
    setSyncResolving(true);
    setSyncResolutionError(null);
    try {
      const updated = await resolveRepairOrderSyncConflict({ data: { roId: ro.id, expectedVersion: workflowRecord.version } });
      setWorkflowRecord(updated);
      addTimeline(ro.id, "Sync conflict resolved: retained local record", "note", now);
      void getRepairOrderHistory({ data: { roId: ro.id } }).then(setHistory).catch(() => undefined);
    } catch (error) {
      setSyncResolutionError(error instanceof Error ? error.message : "Sync conflict was not resolved.");
    } finally {
      setSyncResolving(false);
    }
  };

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
              {workflowRecord?.email ? <Stat label="Email" value={workflowRecord.email} /> : null}
              {workflowRecord?.vehicle.licensePlate ? <Stat label="Plate" value={workflowRecord.vehicle.licensePlate} /> : null}
              <div className="rounded-lg bg-surface px-3 py-2">
                <dt className="text-xs text-muted">Transport</dt>
                <dd className="mt-1">
                  <TransportChip type={ro.transportation} />
                </dd>
              </div>
            </dl>

            <div className="mt-4 rounded-lg bg-surface p-3">
              <div className="flex items-baseline justify-between gap-2"><span className="text-xs font-medium text-muted">Customer update</span><span className={pri.updateOverdue ? "font-mono text-xs text-accent" : "font-mono text-xs text-muted"}>{ro.nextUpdateDue ? (pri.updateOverdue ? `OVERDUE +${Math.ceil((now - new Date(ro.nextUpdateDue).getTime()) / 60_000)}m` : `Due ${clock(ro.nextUpdateDue)}`) : "No update due"}</span></div>
              <p className="mt-1 text-xs text-muted">Last contact: {ro.lastCustomerUpdate ? ago(ro.lastCustomerUpdate, now) : "not recorded"} · Target {workflowRecord?.updateIntervalMinutes ?? (ro.transportation === "waiting" ? settings.waitingUpdateIntervalMin : settings.updateIntervalMin)}m</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => setComposer({ tool: "update", roId: ro.id, source: [ro.concern, ro.diagnosis, ro.notes].filter(Boolean).join("\n") })}>Generate update</Button>
                <NativeSelect className="h-8 w-24 bg-elevated" value={contactMethod} onChange={(event) => setContactMethod(event.target.value as ContactPref)}>{(["call", "text", "email"] as const).map((method) => <option key={method} value={method}>{CONTACT_PREF_LABELS[method]}</option>)}</NativeSelect>
                <Button type="button" size="sm" disabled={contactSaving} onClick={() => void markContacted()}>{contactSaving ? "Saving…" : "Mark contacted"}</Button>
              </div>
              <Textarea className="mt-2" rows={2} value={contactNote} onChange={(event) => setContactNote(event.target.value)} placeholder="Optional outcome or customer response" />
              {user && workflowRecord ? <label className="mt-2 flex items-center gap-2 text-xs text-muted">Update interval <input className="h-7 w-20 rounded-md border border-border bg-elevated px-2 text-sm text-ink" type="number" min="1" max="1440" defaultValue={workflowRecord.updateIntervalMinutes} disabled={intervalSaving} onBlur={(event) => { if (Number(event.target.value) !== workflowRecord.updateIntervalMinutes) void setUpdateInterval(event.target.value); }} /> minutes</label> : null}
              {contactError ? <p className="mt-2 text-xs text-accent">{contactError}</p> : null}
            </div>

            <div className="mt-4">
              <div className="mb-1 text-xs font-medium text-muted">Status</div>
              {user ? workflowRecord ? <>
                <NativeSelect className="h-9 w-full bg-surface" value={workflowRecord.state} disabled={transitionSaving} onChange={(event) => void changeWorkflowState(event.target.value as WorkflowState)}>
                  <option value={workflowRecord.state}>{workflowLabel(workflowRecord.state)}</option>
                  {allowedTransitions(workflowRecord.state).map((state) => <option key={state} value={state}>{workflowLabel(state)}</option>)}
                </NativeSelect>
                <p className="mt-1 text-xs text-muted">Version {workflowRecord.version} · only permitted workflow transitions are available.</p>
              </> : <p className="text-xs text-muted">Loading authoritative workflow state…</p> : <NativeSelect className="h-9 w-full bg-surface" value={ro.status} onChange={(e) => updateRoStatus(ro.id, e.target.value as RoStatus, now)}>{RO_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</NativeSelect>}
              {transitionError ? <p className="mt-1 text-xs text-accent">{transitionError}</p> : null}
            </div>

            {user && workflowRecord ? <div className="mt-4 rounded-lg bg-surface p-3">
              <div className="flex items-baseline justify-between gap-2"><span className="text-xs font-medium text-muted">Synchronization</span><Badge tone={workflowRecord.syncStatus === "conflict" || workflowRecord.syncStatus === "failed" ? "accent" : workflowRecord.syncStatus === "synced" ? "ok" : "warn"}>{workflowRecord.syncStatus}</Badge></div>
              <p className="mt-1 text-xs text-muted">Source: {workflowRecord.sourceSystem}{workflowRecord.externalId ? ` · External ID ${workflowRecord.externalId}` : " · no external ID"} · Version {workflowRecord.version}</p>
              <p className="mt-1 text-xs text-muted">Last source sync: {workflowRecord.sourceSyncedAt ? ago(workflowRecord.sourceSyncedAt, now) : "not synced"} · Last local change: {ago(workflowRecord.localChangedAt, now)}</p>
              {workflowRecord.conflictState ? <div className="mt-2 rounded-md border border-accent/40 bg-accent-soft p-2"><p className="text-xs font-medium">Conflict: {workflowRecord.conflictState}</p>{workflowRecord.syncError ? <p className="mt-1 text-xs text-muted">{workflowRecord.syncError}</p> : null}<Button type="button" size="sm" className="mt-2" disabled={syncResolving} onClick={() => void resolveSyncConflict()}>{syncResolving ? "Resolving…" : "Retain local record"}</Button><p className="mt-1 text-xs text-muted">This clears only the local conflict marker and queues reconciliation; it does not overwrite an external system.</p></div> : workflowRecord.syncError ? <p className="mt-2 text-xs text-accent">{workflowRecord.syncError}</p> : null}
              {syncResolutionError ? <p className="mt-2 text-xs text-accent">{syncResolutionError}</p> : null}
            </div> : null}

            <Section title="Concern">{ro.concern || "—"}</Section>
            <Section title="Diagnosis">{ro.diagnosis || "Still in diagnosis."}</Section>

            <div className="mt-4 rounded-lg bg-surface p-3">
              <div className="text-xs font-medium text-muted">Operational details</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-muted">Technician<NativeSelect className="mt-1 h-8 w-full bg-elevated" value={ro.technician} disabled={operationalSaving} onChange={(event) => void saveOperational({ technicianName: event.target.value === "Unassigned" ? null : event.target.value }, { technician: event.target.value }, `Technician assigned: ${event.target.value}`)}>{TECHNICIANS.map((technician) => <option key={technician} value={technician}>{technician}</option>)}</NativeSelect></label>
                <label className="text-xs text-muted">Promise time<input className="mt-1 h-8 w-full rounded-md border border-border bg-elevated px-2 text-sm text-ink" type="datetime-local" defaultValue={toLocalDateTime(ro.promiseTime)} disabled={operationalSaving} onBlur={(event) => { if (!event.target.value) return; const promiseTime = new Date(event.target.value).toISOString(); if (promiseTime !== ro.promiseTime) void saveOperational({ promiseAt: promiseTime }, { promiseTime }, "Promise time changed"); }} /></label>
                <label className="text-xs text-muted">Parts status<NativeSelect className="mt-1 h-8 w-full bg-elevated" value={workflowRecord?.partsStatus ?? "unknown"} disabled={operationalSaving || Boolean(user && !workflowRecord)} onChange={(event) => void saveOperational({ partsStatus: event.target.value }, {}, `Parts status: ${event.target.value}`)}>{["unknown", "required", "ordered", "awaiting_parts", "received", "unavailable"].map((status) => <option key={status} value={status}>{workflowLabel(status as WorkflowState)}</option>)}</NativeSelect></label>
                <label className="text-xs text-muted">Parts ETA<input className="mt-1 h-8 w-full rounded-md border border-border bg-elevated px-2 text-sm text-ink" type="datetime-local" defaultValue={workflowRecord?.partsEtaAt ? toLocalDateTime(workflowRecord.partsEtaAt) : ""} disabled={operationalSaving || Boolean(user && !workflowRecord)} onBlur={(event) => { const partsEtaAt = event.target.value ? new Date(event.target.value).toISOString() : null; if (partsEtaAt !== (workflowRecord?.partsEtaAt ?? null)) void saveOperational({ partsEtaAt }, {}, "Parts ETA changed"); }} /></label>
              </div>
              <label className="mt-2 block text-xs text-muted">Diagnosis<Textarea className="mt-1" rows={2} value={diagnosisDraft} onChange={(event) => setDiagnosisDraft(event.target.value)} /></label>
              <Button type="button" size="sm" className="mt-2" disabled={operationalSaving || diagnosisDraft === (ro.diagnosis ?? "")} onClick={() => void saveOperational({ diagnosis: diagnosisDraft.trim() || null }, { diagnosis: diagnosisDraft.trim() }, "Diagnosis updated")}>{operationalSaving ? "Saving…" : "Save diagnosis"}</Button>
              <label className="mt-2 block text-xs text-muted">Technician findings<Textarea className="mt-1" rows={2} value={findingsDraft} onChange={(event) => setFindingsDraft(event.target.value)} /></label>
              <Button type="button" size="sm" variant="secondary" className="mt-2" disabled={operationalSaving || findingsDraft === (ro.techNotes ?? "")} onClick={() => void saveOperational({ technicianFindings: findingsDraft.trim() || null }, { techNotes: findingsDraft.trim() }, "Technician findings updated")}>Save findings</Button>
              {operationalError ? <p className="mt-2 text-xs text-accent">{operationalError}</p> : null}
            </div>

            <div className="mt-4 rounded-lg bg-surface p-3">
              <div className="text-xs font-medium text-muted">Blocker</div>
              <div className="mt-2 flex gap-2">
                <NativeSelect className="h-8 w-36 bg-elevated" value={blockerType} onChange={(event) => setBlockerType(event.target.value as BlockerType)}>{BLOCKER_TYPES.map((type) => <option key={type} value={type}>{workflowLabel(type as WorkflowState)}</option>)}</NativeSelect>
                <Button type="button" size="sm" disabled={!blockerDescription.trim() || blockerSaving} onClick={() => void addBlocker()}>{blockerSaving ? "Saving…" : "Add blocker"}</Button>
              </div>
              <Textarea className="mt-2" rows={2} value={blockerDescription} onChange={(event) => setBlockerDescription(event.target.value)} placeholder="What is blocked, and who owns the next step?" />
              {blockerError ? <p className="mt-2 text-xs text-accent">{blockerError}</p> : null}
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs font-medium text-muted">Lines</div>
              {user && recommendations ? <div className="mb-2 grid grid-cols-[1fr_6rem_auto] gap-2"><input className="h-8 min-w-0 rounded-md border border-border bg-elevated px-2 text-sm text-ink" value={estimateDescription} onChange={(event) => setEstimateDescription(event.target.value)} placeholder="Verified recommendation" aria-label="Estimate description" /><input className="h-8 rounded-md border border-border bg-elevated px-2 text-sm text-ink" value={estimateAmount} onChange={(event) => setEstimateAmount(event.target.value)} inputMode="decimal" placeholder="$0" aria-label="Estimate amount" /><Button type="button" size="sm" disabled={!estimateDescription.trim() || recommendationSaving !== null} onClick={() => void addEstimate()}>{recommendationSaving === "new" ? "Adding…" : "Add estimate"}</Button></div> : null}
              <ul className="space-y-1.5">
                {(user && recommendations ? recommendations : ro.lines).map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
                    <span>{l.description}</span>
                    <span className="flex items-center gap-2">
                      <Badge
                        tone={l.state === "approved" ? "ok" : l.state === "declined" ? "accent" : "warn"}
                      >
                        {l.state}
                      </Badge>
                      <span className="font-mono tabular-nums">{usd(l.amount)}</span>
                      {user && recommendations ? <NativeSelect className="h-7 w-28 bg-elevated text-xs" value={l.state} disabled={recommendationSaving !== null} onChange={(event) => void decideRecommendation(l.id, event.target.value as "recommended" | "approved" | "declined")}><option value="recommended">recommended</option><option value="approved">approved</option><option value="declined">declined</option></NativeSelect> : null}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">
                Recommended {usd(totals.recommended)} · Approved {usd(totals.approved)} · Declined {usd(totals.declined)}
              </p>
              {recommendationError ? <p className="mt-2 text-xs text-accent">{recommendationError}</p> : null}
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
                Draft tools
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
                disabled={!note.trim() || noteSaving}
                onClick={() => void addInternalNote()}
              >
                {noteSaving ? "Saving…" : "Add to timeline"}
              </Button>
              {noteError ? <p className="mt-2 text-xs text-accent">{noteError}</p> : null}
            </div>

            {ro.notes ? <Section title="Notes">{ro.notes}</Section> : null}

            {user ? <div className="mt-5"><div className="mb-2 text-xs font-medium text-muted">Audited activity</div>{historyError ? <p className="text-sm text-accent">{historyError}</p> : history ? <div className="space-y-3"><CommunicationHistory communications={history.communications} now={now} /><WorkflowHistory statusHistory={history.statusHistory} now={now} /><BlockerHistory blockers={history.blockers} resolvingId={blockerResolving} onResolve={resolveBlocker} /><HistoryGroup title="Events" empty="No audited changes." items={history.events.map((item) => `${ago(item.occurredAt, now)} · ${item.type.replaceAll("_", " ")}${item.notes ? ` · ${item.notes}` : ""}`)} /></div> : <p className="text-xs text-muted">Loading audited history…</p>}</div> : null}

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

function HistoryGroup({ title, empty, items }: { title: string; empty: string; items: string[] }) { return <div><div className="text-xs text-muted">{title}</div>{items.length ? <ul className="mt-1 space-y-1">{items.slice(0, 5).map((item, index) => <li key={`${title}-${index}`} className="text-xs">{item}</li>)}</ul> : <p className="mt-1 text-xs text-subtle">{empty}</p>}</div>; }

function CommunicationHistory({ communications, now }: { communications: Awaited<ReturnType<typeof getRepairOrderHistory>>["communications"]; now: number }) {
  return <div><div className="text-xs text-muted">Communications</div>{communications.length ? <ol className="mt-1 space-y-2">{communications.slice(0, 8).map((item) => <li key={item.id} className="rounded-md bg-surface px-2 py-1.5 text-xs"><div className="flex items-center justify-between gap-2"><span className="font-medium">{item.direction.toUpperCase()} · {item.method.toUpperCase()} · {item.sent ? "SENT" : "NOT SENT"}</span><span className="font-mono text-muted">{ago(item.occurredAt, now)}</span></div><p className="mt-1">{item.summary}</p>{item.message ? <p className="mt-1 text-muted">Message: {item.message}</p> : null}{item.outcome ? <p className="mt-1 text-muted">Outcome: {item.outcome}</p> : null}{item.customerResponse ? <p className="mt-1 text-muted">Customer response: {item.customerResponse}</p> : null}<p className="mt-1 text-subtle">{item.aiGenerated ? "AI draft" : "Advisor entry"} · {item.source}{item.advisorId ? ` · ${item.advisorId}` : ""}</p></li>)}</ol> : <p className="mt-1 text-xs text-subtle">No confirmed server-side contacts.</p>}</div>;
}

function WorkflowHistory({ statusHistory, now }: { statusHistory: Awaited<ReturnType<typeof getRepairOrderHistory>>["statusHistory"]; now: number }) {
  const durations = calculateWorkflowDurations(statusHistory, new Date(now));
  return <div><div className="text-xs text-muted">Workflow history</div>{statusHistory.length ? <><p className="mt-1 text-xs text-subtle">Current {durations.timeInCurrentStateMinutes}m · approval {durations.authorizationDelayMinutes}m · diagnosis {durations.diagnosticDelayMinutes}m · repair {durations.repairDurationMinutes}m{durations.bottleneck ? ` · bottleneck ${workflowLabel(durations.bottleneck)}` : ""}</p><ol className="mt-1 space-y-1">{statusHistory.slice(-6).reverse().map((item) => <li key={item.id} className="text-xs"><span className="font-mono text-muted">{ago(item.occurredAt, now)}</span> · {item.previousState ? `${workflowLabel(item.previousState)} → ` : ""}{workflowLabel(item.newState)}{item.reason ? ` · ${item.reason}` : ""}</li>)}</ol></> : <p className="mt-1 text-xs text-subtle">No persisted state transitions.</p>}</div>;
}

function BlockerHistory({ blockers, resolvingId, onResolve }: { blockers: Awaited<ReturnType<typeof getRepairOrderHistory>>["blockers"]; resolvingId: string | null; onResolve: (id: string) => void }) {
  return <div><div className="text-xs text-muted">Blockers</div>{blockers.length ? <ul className="mt-1 space-y-1">{blockers.slice(0, 5).map((blocker) => <li key={blocker.id} className="flex items-center justify-between gap-2 text-xs"><span>{blocker.resolvedAt ? "RESOLVED" : blocker.severity.toUpperCase()} · {blocker.type} · {blocker.description}</span>{!blocker.resolvedAt ? <Button type="button" size="sm" variant="ghost" disabled={resolvingId !== null} onClick={() => onResolve(blocker.id)}>{resolvingId === blocker.id ? "Resolving…" : "Resolve"}</Button> : null}</li>)}</ul> : <p className="mt-1 text-xs text-subtle">No recorded blockers.</p>}</div>;
}

function workflowLabel(state: WorkflowState): string { return state.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }

function toLocalDateTime(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function legacyStatusForWorkflow(state: WorkflowState): RoStatus {
  const map: Record<WorkflowState, RoStatus> = { scheduled: "checked_in", arrived: "checked_in", written: "waiting_technician", dispatched: "waiting_technician", diagnosing: "diagnosing", estimate_ready: "recommendations_ready", awaiting_approval: "waiting_approval", approved: "approved", repairing: "repair_in_progress", qc: "quality_check", ready: "ready_for_pickup", delivered: "completed" };
  return map[state];
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
