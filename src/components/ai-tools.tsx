import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { rewriteAdvisorText, type RewriteMode } from "@/lib/ai";
import { useAppStore } from "@/lib/store";
import { useMemo, useState } from "react";

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
    if (tool === "cleaner") return NOTE_MODES;
    if (tool === "concern") return [{ id: "concern" as const, label: "Concern" }];
    return UPDATE_MODES;
  }, [tool]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await rewriteAdvisorText({
        data: {
          mode,
          source: source || composer?.source || "",
          vehicle: ro ? `${ro.year} ${ro.vehicle}` : undefined,
          concern: ro?.concern,
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
      <NativeSelect className="h-9 bg-elevated" value={mode} onChange={(e) => setMode(e.target.value as RewriteMode)}>
        {modes.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </NativeSelect>
      <Textarea
        rows={6}
        value={source}
        onChange={(e) => setSource(e.target.value)}
        placeholder={tool === "concern" ? "Customer says…" : "Paste diagnosis, tech notes, or talking points"}
      />
      <Button type="button" onClick={() => void run()} disabled={busy}>
        {busy ? "Writing…" : "Rewrite"}
      </Button>
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      {out ? (
        <pre className="whitespace-pre-wrap rounded-lg bg-surface px-3 py-2 font-sans text-sm">{out}</pre>
      ) : null}
    </div>
  );
}
