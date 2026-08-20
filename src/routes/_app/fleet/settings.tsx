import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFleetStore } from "@/lib/fleet-store";
import { createSeedData } from "@/lib/fleet-seed";

export const Route = createFileRoute("/_app/fleet/settings")({ component: SettingsPage });

export function SettingsPage() {
  const settings = useFleetStore((s) => s.settings);
  const setSettings = useFleetStore((s) => s.setSettings);
  const hydrate = useFleetStore((s) => s.hydrate);
  const persist = useFleetStore((s) => s.persist);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted">Org labels and alert thresholds for this yard.</p>
      </div>

      <div className="space-y-4 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <Field label="Organization">
          <Input value={settings.orgName} onChange={(e) => setSettings({ orgName: e.target.value })} />
        </Field>
        <Field label="Home yard">
          <Input value={settings.yardName} onChange={(e) => setSettings({ yardName: e.target.value })} />
        </Field>
        <Field label="Speeding threshold (mph)">
          <Input
            type="number"
            value={settings.speedingMph}
            onChange={(e) => setSettings({ speedingMph: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Idle warning (minutes)">
          <Input
            type="number"
            value={settings.idleWarnMin}
            onChange={(e) => setSettings({ idleWarnMin: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>

      <button
        type="button"
        className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
        onClick={() => hydrate(createSeedData(), persist)}
      >
        Reset demo fleet
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
