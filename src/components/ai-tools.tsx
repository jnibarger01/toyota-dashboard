import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { draftVerifiedCustomerUpdate, rewriteAdvisorText, type RewriteMode } from "@/lib/ai";
import { useAppStore } from "@/lib/store";
import { useEffect, useMemo, useState } from "react";

const UPDATE_MODES: { id: RewriteMode; label: string }[] = [
  { id: "update_simple", label: "Simple" },
  { id: "update_technical", label: "Technical" },
  { id: "update_text", label: "Text" },
  { id: "update_phone", label: "Phone" },
  { id: "update_recommend", label: "Recommend" },
  { id: "update_declined", label: "Declined" },
];

const NOTE_MODES: { id: RewriteMode; label: string }[] = [
  { id: "note_ro", label: "RO note" },
  { id: "note_customer", label: "Customer" },
  { id: "note_internal", label: "Internal" },
];

export function AiTools({ defaultTool }: { defaultTool?: "update" | "cleaner" | "concern" }) {
  const composer = useAppStore((s) => s.composer);
  const setComposer = useAppStore((s) => s.setComposer);
  const ros = useAppStore((s) => s.ros);
  const settings = useAppStore((s) => s.settings);
  const tool = composer?.tool ?? defaultTool ?? "update";
  const ro = ros.find((r) => r.id === composer?.roId) ?? null;
  const [source, setSource] = useState(composer?.source ?? "");
  const [mode, setMode] = useState<RewriteMode>(
    tool === "cleaner" ? "note_ro" : tool === "concern" ? "concern" : "update_simple",
  );
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modes = useMemo(() => {
    const candidates = tool === "cleaner" ? NOTE_MODES : tool === "concern" ? [{ id: "concern" as const, label: "Concern" }] : UPDATE_MODES;
    return candidates.filter((candidate) => settings.aiEnabledModes.includes(candidate.id));
  }, [settings.aiEnabledModes, tool]);
  useEffect(() => { if (modes.length && !modes.some((candidate) => candidate.id === mode)) setMode(modes[0]!.id); }, [mode, modes]);
  useEffect(() => {
    setSource(composer?.source ?? "");
    setOut("");
    setError(null);
  }, [composer?.roId, composer?.source, tool]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = ro && tool === "update"
        ? await draftVerifiedCustomerUpdate({ data: { roId: ro.id, tone: settings.aiDefaultTone, mode } })
        : await rewriteAdvisorText({
            data: {
              mode,
              source: source || composer?.source || "",
              vehicle: ro ? `${ro.year} ${ro.vehicle}` : undefined,
              concern: ro?.concern,
              tone: settings.aiDefaultTone,
            },
          });
      if (res.ok) setOut(res.text);
      else setError(res.error);
    } catch {
      setError("Could not write. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {ro ? (
        <p className="text-xs text-muted">
          Using RO {ro.roNumber} · {ro.customerName}
          <button type="button" className="ml-2 underline" onClick={() => setComposer(null)}>
            Clear
          </button>
        </p>
      ) : null}
      {ro && tool === "update" ? <p className="text-xs text-subtle">Customer drafts use verified server-side RO facts. Creating a draft does not record or send a customer contact.</p> : null}
      {modes.length ? <NativeSelect className="h-9 bg-elevated" value={mode} onChange={(e) => setMode(e.target.value as RewriteMode)}>
        {modes.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </NativeSelect> : <p className="rounded-md bg-surface p-2 text-xs text-muted">No drafting modes are enabled. Enable one in Settings.</p>}
      <Textarea
        rows={6}
        value={source}
        onChange={(e) => setSource(e.target.value)}
        placeholder={tool === "concern" ? "Customer says…" : "Paste diagnosis, tech notes, or talking points"}
      />
      <Button type="button" onClick={() => void run()} disabled={busy || !modes.length}>
        {busy ? "Writing…" : "Rewrite"}
      </Button>
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      {out ? (
        <pre className="whitespace-pre-wrap rounded-lg bg-surface px-3 py-2 font-sans text-sm">{out}</pre>
      ) : null}
    </div>
  );
}
