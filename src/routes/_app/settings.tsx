import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { integrationAdapters } from "@/lib/integrations";
import { NativeSelect } from "@/components/ui/native-select";
import { AI_DRAFTING_MODES, TRANSPORT_TYPES, TRANSPORT_LABELS } from "@/lib/types";
import { loadLane } from "@/lib/lane-server";
import { useState } from "react";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const isStaticDemo = import.meta.env.VITE_DEPLOY_TARGET === "pages" || import.meta.env.VITE_AUTH_ENABLED === "false";
  const [exporting, setExporting] = useState(false);

  async function exportLaneBackup() {
    setExporting(true);
    try {
      const snapshot = await loadLane();
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...snapshot }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `toyota-advisor-lane-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

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
        <Field label="Approval-delay warning (minutes)">
          <Input type="number" value={settings.approvalDelayWarningMin} onChange={(e) => setSettings({ approvalDelayWarningMin: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Promise-risk warning (minutes)">
          <Input type="number" value={settings.promiseRiskWarningMin} onChange={(e) => setSettings({ promiseRiskWarningMin: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Default transportation">
          <NativeSelect value={settings.defaultTransportation} onChange={(e) => setSettings({ defaultTransportation: e.target.value as typeof settings.defaultTransportation })}>
            {TRANSPORT_TYPES.map((type) => <option key={type} value={type}>{TRANSPORT_LABELS[type]}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <section className="space-y-3 rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]" aria-labelledby="ai-title">
        <div><h2 id="ai-title" className="text-sm font-semibold">AI drafting</h2><p className="mt-1 text-xs text-muted">Provider and model are server-managed: xAI · Grok 4.5. Credentials are never shown here.</p></div>
        <Field label="Default customer tone"><NativeSelect value={settings.aiDefaultTone} onChange={(event) => setSettings({ aiDefaultTone: event.target.value as typeof settings.aiDefaultTone })}><option value="concise">Concise</option><option value="warm">Warm</option></NativeSelect></Field>
        <fieldset><legend className="text-sm font-medium">Enabled drafting modes</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{AI_DRAFTING_MODES.map((mode) => <label key={mode} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={settings.aiEnabledModes.includes(mode)} onChange={(event) => { const aiEnabledModes = event.target.checked ? [...settings.aiEnabledModes, mode] : settings.aiEnabledModes.filter((item) => item !== mode); if (aiEnabledModes.length) setSettings({ aiEnabledModes }); }} />{mode.replaceAll("_", " ")}</label>)}</div></fieldset>
      </section>
      <section className="rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]" aria-labelledby="appearance-title">
        <h2 id="appearance-title" className="text-sm font-semibold">Appearance</h2>
        <Field label="Color theme"><NativeSelect value={settings.appearance} onChange={(event) => setSettings({ appearance: event.target.value as typeof settings.appearance })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></NativeSelect></Field>
      </section>
      {isStaticDemo ? <section className="rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]" aria-labelledby="demo-title">
        <h2 id="demo-title" className="text-sm font-semibold">Demo Mode</h2>
        <p className="mt-1 text-xs text-muted">Uses fictional service-lane records only. It is never presented as a connected dealership feed.</p>
        <Button type="button" variant="secondary" className="mt-3" onClick={() => resetDemo(Date.now())}>Reset fictional demo lane</Button>
      </section> : null}
      {!isStaticDemo ? <section className="rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]" aria-labelledby="backup-title">
        <h2 id="backup-title" className="text-sm font-semibold">Backup</h2>
        <p className="mt-1 text-xs text-muted">Download the current authenticated lane, including active and completed records, as JSON.</p>
        <Button type="button" variant="secondary" className="mt-3" onClick={() => void exportLaneBackup()} disabled={exporting}>{exporting ? "Preparing…" : "Export lane backup"}</Button>
      </section> : null}
      <Link to="/fleet" className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
        Open separate fleet board
      </Link>
      <section className="rounded-xl bg-elevated p-4 shadow-[var(--shadow-border)]" aria-labelledby="integration-title">
        <h2 id="integration-title" className="text-sm font-semibold">Integrations</h2>
        <p className="mt-1 text-xs text-muted">No dealership feed is connected in this workspace. Demo and manual work are clearly local.</p>
        <ul className="mt-3 divide-y divide-border">{integrationAdapters.map((adapter) => <li key={adapter.id} className="flex items-center justify-between py-2 text-sm"><span>{adapter.label}</span><span className="font-mono text-xs text-muted">NOT CONNECTED</span></li>)}</ul>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
