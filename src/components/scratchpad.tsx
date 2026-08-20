import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useNow } from "@/components/now";
import { useAppStore } from "@/lib/store";
import { uid } from "@/lib/utils";
import { createServiceFollowUp } from "@/lib/follow-up-server";
import { createScratchNote, removeScratchNote } from "@/lib/scratch-server";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useState } from "react";

export function Scratchpad() {
  const scratch = useAppStore((s) => s.scratch);
  const addScratch = useAppStore((s) => s.addScratch);
  const addScratchNote = useAppStore((s) => s.addScratchNote);
  const removeScratch = useAppStore((s) => s.removeScratch);
  const addFollowUp = useAppStore((s) => s.addFollowUp);
  const ros = useAppStore((s) => s.ros);
  const now = useNow();
  const [text, setText] = useState("");
  const [targetRoId, setTargetRoId] = useState("");
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [scratchError, setScratchError] = useState<string | null>(null);
  const { user } = useCurrentUserState();
  const activeRos = ros.filter((ro) => ro.status !== "completed");

  const makeFollowUp = async (noteId: string, label: string) => {
    const ro = activeRos.find((item) => item.id === targetRoId);
    if (!ro || creatingFor) return;
    setCreatingFor(noteId);
    setFollowUpError(null);
    try {
      if (user) {
        const followUp = await createServiceFollowUp({ data: { id: uid("fu"), roId: ro.id, reason: "manual", label, note: label } });
        addFollowUp(followUp);
      } else {
        addFollowUp({ id: uid("fu"), roId: ro.id, reason: "manual", label, outcome: "open", callbackAt: null, createdAt: new Date(now).toISOString(), note: label, estimatedOpportunity: 0 });
      }
      if (user) await removeScratchNote({ data: { id: noteId } });
      removeScratch(noteId);
    } catch {
      setFollowUpError("Follow-up was not saved. The scratch note remains.");
    } finally {
      setCreatingFor(null);
    }
  };

  return (
    <section className="rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <h2 className="text-sm font-medium">Scratchpad</h2>
      <form
        className="mt-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = text.trim();
          if (!value) return;
          setScratchError(null);
          if (!user) { addScratch(value, now); setText(""); return; }
          void createScratchNote({ data: { id: uid("sc"), text: value } }).then((note) => { addScratchNote(note); setText(""); }).catch(() => setScratchError("Scratch note was not saved."));
        }}
      >
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Call Camry customer after lunch" rows={2} />
        <Button type="submit" size="sm" className="mt-2" disabled={!text.trim()}>
          Save note
        </Button>
      </form>
      {scratch.length ? <div className="mt-3"><label className="text-xs text-muted" htmlFor="scratchpad-ro">Related repair order</label><NativeSelect id="scratchpad-ro" className="mt-1 h-8 w-full bg-bg" value={targetRoId} onChange={(event) => setTargetRoId(event.target.value)}><option value="">Choose an active RO…</option>{activeRos.map((ro) => <option key={ro.id} value={ro.id}>RO {ro.roNumber} · {ro.customerName}</option>)}</NativeSelect></div> : null}
      <ul className="mt-3 space-y-2">
        {scratch.map((n) => (
          <li key={n.id} className="rounded-lg bg-bg px-2.5 py-2">
            <p className="text-sm">{n.text}</p>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                className="text-xs font-medium text-muted hover:text-ink"
                disabled={!targetRoId || creatingFor !== null}
                onClick={() => void makeFollowUp(n.id, n.text)}
              >
                {creatingFor === n.id ? "Saving…" : "Make follow-up"}
              </button>
              <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => {
                setScratchError(null);
                if (!user) { removeScratch(n.id); return; }
                void removeScratchNote({ data: { id: n.id } }).then(() => removeScratch(n.id)).catch(() => setScratchError("Scratch note was not dismissed."));
              }}>
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
      {followUpError ? <p className="mt-2 text-xs text-accent">{followUpError}</p> : null}
      {scratchError ? <p className="mt-2 text-xs text-accent">{scratchError}</p> : null}
    </section>
  );
}
