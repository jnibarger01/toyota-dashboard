import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useAppStore } from "@/lib/store";
import type { BoardFilter } from "@/lib/types";

const FILTERS: { id: BoardFilter; label: string }[] = [
  { id: "all", label: "All open" },
  { id: "waiting_customers", label: "Waiting customers" },
  { id: "waiting_technician", label: "Waiting technician" },
  { id: "updates_overdue", label: "Updates due" },
  { id: "approval_pending", label: "Approvals" },
  { id: "parts_pending", label: "Parts" },
  { id: "blockers", label: "Open blockers" },
  { id: "ready", label: "Ready" },
  { id: "promise_risk", label: "Promise risk" },
  { id: "high_dollar", label: "High dollar" },
  { id: "declined_work", label: "Declined work" },
  { id: "carryovers", label: "Carryovers" },
  { id: "comebacks", label: "Comebacks" },
  { id: "delivered", label: "Delivered" },
  { id: "stalled", label: "Stalled" },
];

export function FiltersBar() {
  const query = useAppStore((s) => s.query);
  const setQuery = useAppStore((s) => s.setQuery);
  const boardFilter = useAppStore((s) => s.boardFilter);
  const setBoardFilter = useAppStore((s) => s.setBoardFilter);
  const includeCompleted = useAppStore((s) => s.includeCompleted);
  const setIncludeCompleted = useAppStore((s) => s.setIncludeCompleted);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search RO, customer, vehicle, VIN"
        className="w-full sm:w-64"
      />
      <NativeSelect
        className="h-9 bg-elevated"
        value={boardFilter}
        onChange={(e) => setBoardFilter(e.target.value as BoardFilter)}
      >
        {FILTERS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </NativeSelect>
      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={includeCompleted}
          onChange={(e) => setIncludeCompleted(e.target.checked)}
        />
        Show completed
      </label>
    </div>
  );
}
