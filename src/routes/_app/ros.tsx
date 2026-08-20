import { createFileRoute } from "@tanstack/react-router";
import { FiltersBar } from "@/components/filters-bar";
import { RoTable } from "@/components/ro-table";
import { useAppStore } from "@/lib/store";

export const Route = createFileRoute("/_app/ros")({ component: RosPage });

function RosPage() {
  const selectRo = useAppStore((s) => s.selectRo);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Repair orders</h1>
        <p className="text-sm text-muted">Every open RO, sorted by urgency. Click a row for the inspector.</p>
      </div>
      <FiltersBar />
      <RoTable onOpen={selectRo} />
    </div>
  );
}
