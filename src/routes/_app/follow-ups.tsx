import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useNow } from "@/components/now";
import { deriveFollowUps } from "@/lib/follow-ups";
import { useAppStore } from "@/lib/store";
import { uid } from "@/lib/utils";

export const Route = createFileRoute("/_app/follow-ups")({ component: FollowUpsPage });

function FollowUpsPage() {
  const ros = useAppStore((s) => s.ros);
  const followUps = useAppStore((s) => s.followUps);
  const settings = useAppStore((s) => s.settings);
  const selectRo = useAppStore((s) => s.selectRo);
  const addFollowUp = useAppStore((s) => s.addFollowUp);
  const setFollowUpOutcome = useAppStore((s) => s.setFollowUpOutcome);
  const now = useNow();
  const queue = deriveFollowUps(ros, followUps, settings, now);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Follow-ups</h1>
        <p className="text-sm text-muted">{queue.length} in queue — approvals, ready vehicles, overdue updates.</p>
      </div>
      <ul className="space-y-2">
        {queue.map((item) => {
          const stored = followUps.find((f) => f.roId === item.ro.id && f.reason === item.reason && f.outcome === "open");
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
                onClick={() => {
                  if (stored) setFollowUpOutcome(stored.id, "called");
                  else
                    addFollowUp({
                      id: uid("fu"),
                      roId: item.ro.id,
                      reason: item.reason,
                      label: item.label,
                      outcome: "called",
                      callbackAt: null,
                      createdAt: new Date(now).toISOString(),
                      note: "",
                    });
                }}
              >
                Mark called
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (stored) setFollowUpOutcome(stored.id, "completed");
                  else
                    addFollowUp({
                      id: uid("fu"),
                      roId: item.ro.id,
                      reason: item.reason,
                      label: item.label,
                      outcome: "completed",
                      callbackAt: null,
                      createdAt: new Date(now).toISOString(),
                      note: "",
                    });
                }}
              >
                Done
              </Button>
            </li>
          );
        })}
      </ul>
      {queue.length === 0 ? <p className="text-sm text-muted">Queue is clear.</p> : null}
    </div>
  );
}
