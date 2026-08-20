import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { queryAdvisorLane, summarizeRecentChanges, type CopilotAnswer } from "@/lib/copilot";
import { useAppStore } from "@/lib/store";
import { useNow } from "@/components/now";
import { getRecentLaneChanges } from "@/lib/ro-server";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function AdvisorCopilot() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<CopilotAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const ros = useAppStore((s) => s.ros); const settings = useAppStore((s) => s.settings); const selectRo = useAppStore((s) => s.selectRo); const now = useNow();
  const { user } = useCurrentUserState();
  function ask() {
    if (!question.trim()) return;
    if (/\b(?:changed|change|lunch)\b/i.test(question) && user) {
      setLoading(true);
      void getRecentLaneChanges({ data: { since: new Date(now - 4 * 60 * 60_000).toISOString() } })
        .then((changes) => setAnswer(summarizeRecentChanges(changes.flatMap((change) => change.roNumber && change.customerName ? [{ roId: change.roId, roNumber: change.roNumber, customerName: change.customerName, type: change.type, occurredAt: change.occurredAt }] : []))))
        .catch(() => setAnswer(queryAdvisorLane(question, ros, settings, now)))
        .finally(() => setLoading(false));
      return;
    }
    setAnswer(queryAdvisorLane(question, ros, settings, now));
  }
  return <section className="rounded-xl border border-border bg-elevated p-3 shadow-[var(--shadow-border)]" aria-label="Advisor copilot">
    <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); ask(); }}>
      <Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask Command Center… e.g. What's holding up my lane?" aria-label="Ask Command Center" />
      <Button type="submit" variant="secondary" disabled={loading}>{loading ? "Checking…" : "Ask"}</Button>
    </form>
    {answer ? <div className="mt-3 border-t border-border pt-3"><p className="text-sm font-medium">{answer.heading}</p><p className="mt-1 whitespace-pre-line text-sm text-muted">{answer.summary}</p><p className="mt-2 text-xs text-subtle">Recommended: {answer.action}</p><div className="mt-2 flex flex-wrap gap-2">{answer.roIds.map((id) => <Button key={id} type="button" size="sm" variant="ghost" onClick={() => selectRo(id)}>Open RO</Button>)}</div></div> : null}
  </section>;
}
