import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNow } from "@/components/now";
import { useAppStore } from "@/lib/store";
import { uid } from "@/lib/utils";
import { useState } from "react";

export function Scratchpad() {
  const scratch = useAppStore((s) => s.scratch);
  const addScratch = useAppStore((s) => s.addScratch);
  const removeScratch = useAppStore((s) => s.removeScratch);
  const addFollowUp = useAppStore((s) => s.addFollowUp);
  const ros = useAppStore((s) => s.ros);
  const now = useNow();
  const [text, setText] = useState("");

  return (
    <section className="rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
      <h2 className="text-sm font-medium">Scratchpad</h2>
      <form
        className="mt-2"
        onSubmit={(e) => {
          e.preventDefault();
          addScratch(text, now);
          setText("");
        }}
      >
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Call Camry customer after lunch" rows={2} />
        <Button type="submit" size="sm" className="mt-2" disabled={!text.trim()}>
          Save note
        </Button>
      </form>
      <ul className="mt-3 space-y-2">
        {scratch.map((n) => (
          <li key={n.id} className="rounded-lg bg-bg px-2.5 py-2">
            <p className="text-sm">{n.text}</p>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                className="text-xs font-medium text-muted hover:text-ink"
                onClick={() => {
                  const ro = ros.find((r) => r.status !== "completed");
                  if (!ro) return;
                  addFollowUp({
                    id: uid("fu"),
                    roId: ro.id,
                    reason: "manual",
                    label: n.text,
                    outcome: "open",
                    callbackAt: null,
                    createdAt: new Date(now).toISOString(),
                    note: n.text,
                  });
                  removeScratch(n.id);
                }}
              >
                Make follow-up
              </button>
              <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => removeScratch(n.id)}>
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
