import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useNow } from "@/components/now";
import { useAppStore } from "@/lib/store";
import { TECHNICIANS, TRANSPORT_LABELS, TRANSPORT_TYPES, type TransportType } from "@/lib/types";
import { uid } from "@/lib/utils";
import { useState, type FormEvent } from "react";

export function QuickIntake() {
  const addRo = useAppStore((s) => s.addRo);
  const advisor = useAppStore((s) => s.settings.advisorName);
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [roNumber, setRoNumber] = useState("");
  const [customer, setCustomer] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [year, setYear] = useState("2022");
  const [concern, setConcern] = useState("");
  const [tech, setTech] = useState<(typeof TECHNICIANS)[number]>("Unassigned");
  const [transport, setTransport] = useState<TransportType>("waiting");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!roNumber.trim() || !customer.trim() || !vehicle.trim()) return;
    const id = uid("ro");
    const at = new Date(now).toISOString();
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
      advisor,
      appointmentTime: at,
      status: "checked_in",
      statusChangedAt: at,
      concern: concern.trim(),
      diagnosis: "",
      lines: [],
      contactPref: "call",
      lastCustomerUpdate: null,
      nextUpdateDue: new Date(now + 25 * 60_000).toISOString(),
      notes: "",
      transportation: transport,
      promiseTime: new Date(now + 120 * 60_000).toISOString(),
      timeline: [{ id: uid("ev"), at, label: "Customer checked in", kind: "intake" }],
      createdAt: at,
      techNotes: "",
    });
    setRoNumber("");
    setCustomer("");
    setVehicle("");
    setConcern("");
    setOpen(false);
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
        <Button type="submit" size="sm">
          Add to lane
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
