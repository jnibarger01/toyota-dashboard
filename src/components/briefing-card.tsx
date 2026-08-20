import { Button } from "@/components/ui/button";
import { Panel } from "@/components/panel";
import { writeShiftBriefing } from "@/lib/briefing";
import { computeKpis } from "@/lib/fleet-kpis";
import { useFleetStore } from "@/lib/fleet-store";
import { ScrollText } from "lucide-react";
import { useState } from "react";

export function BriefingCard() {
  const vehicles = useFleetStore((s) => s.vehicles);
  const alerts = useFleetStore((s) => s.alerts);
  const jobs = useFleetStore((s) => s.jobs);
  const fuel = useFleetStore((s) => s.fuel);
  const geofences = useFleetStore((s) => s.geofences);
  const settings = useFleetStore((s) => s.settings);
  const drivers = useFleetStore((s) => s.drivers);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const kpis = computeKpis({ vehicles, alerts, jobs, fuel, geofences, settings, drivers });
    const open = alerts.filter((a) => !a.acknowledged);
    const summary = [
      `${kpis.total} units · ${kpis.moving} en route · ${kpis.idle} idle · ${kpis.inShop} in shop · ${kpis.offline} offline`,
      `Open alerts (${open.length}): ${open.map((a) => `${a.title} (${a.severity})`).join("; ") || "none"}`,
      `PM overdue: ${jobs.filter((j) => j.status === "overdue").map((j) => j.title).join("; ") || "none"}`,
      `Fuel today ${kpis.fuelBurnToday} gal / $${kpis.fuelCostToday} · idle ${kpis.idleGalToday} gal`,
      `Unassigned moving/idle: ${vehicles
        .filter((v) => !v.driverId && (v.status === "moving" || v.status === "idle"))
        .map((v) => v.unit)
        .join(", ") || "none"}`,
    ].join("\n");
    try {
      const res = await writeShiftBriefing({ data: { orgName: settings.orgName, summary } });
      if (res.ok) setText(res.text);
      else setError(res.error);
    } catch {
      setError("Could not write the briefing. Sign in and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Shift briefing"
      action={
        <Button type="button" size="sm" variant="subtle" onClick={() => void run()} disabled={busy}>
          <ScrollText className="size-3.5" />
          {busy ? "Writing…" : text ? "Refresh" : "Write briefing"}
        </Button>
      }
    >
      {text ? (
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">{text}</pre>
      ) : (
        <p className="text-sm text-muted">
          A one-page night-shift note from the live board — attention, rolling units, yard, and the next ask.
          {error ? <span className="mt-2 block text-danger">{error}</span> : null}
        </p>
      )}
    </Panel>
  );
}
