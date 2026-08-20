import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/fleet")({ component: FleetLayout });

const SUB = [
  { to: "/fleet", label: "Live" },
  { to: "/fleet/vehicles", label: "Vehicles" },
  { to: "/fleet/drivers", label: "Drivers" },
  { to: "/fleet/maintenance", label: "Shop" },
  { to: "/fleet/alerts", label: "Alerts" },
  { to: "/fleet/fuel", label: "Fuel" },
] as const;

function FleetLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted">Optional board</p>
          <h1 className="text-xl font-semibold tracking-tight">Fleet</h1>
        </div>
        <Button asChild>
          <Link to="/">Back to lane board</Link>
        </Button>
      </div>
      <nav className="flex flex-wrap gap-1">
        {SUB.map((item) => {
          const active = item.to === "/fleet" ? pathname === "/fleet" || pathname === "/fleet/" : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium",
                active ? "bg-ink text-elevated" : "text-muted hover:bg-ink/6 hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
