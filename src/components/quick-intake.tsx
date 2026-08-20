import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useNow } from "@/components/now";
import { useAppStore } from "@/lib/store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { createManualRepairOrder } from "@/lib/ro-server";
import { projectRepairOrder } from "@/lib/ro-projection";
import { TECHNICIANS, TRANSPORT_LABELS, TRANSPORT_TYPES, type TransportType } from "@/lib/types";
import { uid } from "@/lib/utils";
import { useState, type FormEvent } from "react";

export function QuickIntake() {
  const addRo = useAppStore((s) => s.addRo);
  const settings = useAppStore((s) => s.settings);
  const now = useNow();
  const { user } = useCurrentUserState();
  const [open, setOpen] = useState(false);
  const [roNumber, setRoNumber] = useState("");
  const [customer, setCustomer] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [year, setYear] = useState("2022");
  const [concern, setConcern] = useState("");
  const [tech, setTech] = useState<(typeof TECHNICIANS)[number]>("Unassigned");
  const [transport, setTransport] = useState<TransportType>("waiting");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!roNumber.trim() || !customer.trim() || !vehicle.trim()) return;
    setBusy(true); setError(null);
    const id = crypto.randomUUID();
    const at = new Date(now).toISOString();
    const promiseTime = new Date(now + 120 * 60_000).toISOString();
    const updateIntervalMinutes = transport === "waiting" ? settings.waitingUpdateIntervalMin : settings.updateIntervalMin;
    if (user) {
      try {
        const created = await createManualRepairOrder({ data: { id, roNumber: roNumber.trim(), customerName: customer.trim(), year: Number(year) || undefined, model: vehicle.trim(), technicianName: tech === "Unassigned" ? undefined : tech, transportation: transport, waitingCustomer: transport === "waiting", promiseAt: promiseTime, updateIntervalMinutes, concern: concern.trim() || undefined } });
        addRo(projectRepairOrder(created, []));
      } catch { setError("Could not create the RO on the server. Nothing was added."); setBusy(false); return; }
    } else {
      addRo({
        id,
        roNumber: roNumber.trim(),
        customerName: customer.trim(),
        customerPhone: "",
        vehicle: vehicle.trim(),
        year: Number(year) || new Date().getFullYear(),
        mileage: 0,
        vin: "",
        technician: tech,
        advisor: settings.advisorName,
        appointmentTime: at,
        status: "checked_in",
        statusChangedAt: at,
        concern: concern.trim(),
        diagnosis: "",
        lines: [],
        contactPref: "call",
        lastCustomerUpdate: null,
        nextUpdateDue: new Date(now + updateIntervalMinutes * 60_000).toISOString(),
        notes: "",
        transportation: transport,
        promiseTime,
        timeline: [{ id: uid("ev"), at, label: "Customer checked in", kind: "intake" }],
        createdAt: at,
        techNotes: "",
      });
    }
    setRoNumber("");
    setCustomer("");
    setVehicle("");
    setConcern("");
    setOpen(false);
    setBusy(false);
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Quick intake
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl bg-elevated p-3 shadow-[var(--shadow-border)]">
      <div className="mb-2 text-sm font-medium">New repair order</div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Input value={roNumber} onChange={(e) => setRoNumber(e.target.value)} placeholder="RO #" required autoFocus />
        <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer" required />
        <Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Vehicle" required />
        <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year" />
        <NativeSelect className="h-9 bg-surface" value={tech} onChange={(e) => setTech(e.target.value as typeof tech)}>
          {TECHNICIANS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="h-9 bg-surface"
          value={transport}
          onChange={(e) => setTransport(e.target.value as TransportType)}
        >
          {TRANSPORT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TRANSPORT_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Input className="mt-2" value={concern} onChange={(e) => setConcern(e.target.value)} placeholder="Concern" />
      <div className="mt-2 flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Adding…" : "Add to lane"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs text-accent">{error}</p> : null}
    </form>
  );
}
