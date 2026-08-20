import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const resetDemo = useAppStore((s) => s.resetDemo);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted">Lane labels and update cadence for this advisor.</p>
      </div>
      <div className="space-y-4 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]">
        <Field label="Advisor name">
          <Input value={settings.advisorName} onChange={(e) => setSettings({ advisorName: e.target.value })} />
        </Field>
        <Field label="Store">
          <Input value={settings.storeName} onChange={(e) => setSettings({ storeName: e.target.value })} />
        </Field>
        <Field label="Update interval (minutes)">
          <Input
            type="number"
            value={settings.updateIntervalMin}
            onChange={(e) => setSettings({ updateIntervalMin: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Waiting-customer update (minutes)">
          <Input
            type="number"
            value={settings.waitingUpdateIntervalMin}
            onChange={(e) => setSettings({ waitingUpdateIntervalMin: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="High-dollar threshold">
          <Input
            type="number"
            value={settings.highDollarThreshold}
            onChange={(e) => setSettings({ highDollarThreshold: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={() => resetDemo(Date.now())}>
          Reset demo lane
        </Button>
        <Link to="/fleet" className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
          Open fleet board
        </Link>
      </div>
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
