import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";
import { NowProvider, useNow } from "@/components/now";
import { HydrateStore } from "@/components/hydrate-store";
import { HydrateFleet } from "@/components/hydrate-fleet";
import { VehicleDrawer } from "@/components/vehicle-drawer";
import { RoInspector } from "@/components/ro-inspector";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { format } from "date-fns";
import {
  ClipboardList,
  Gauge,
  LayoutDashboard,
  MapPinned,
  NotebookPen,
  PhoneCall,
  Settings,
} from "lucide-react";
import { deriveFollowUps } from "@/lib/follow-ups";
import { computeKpis } from "@/lib/kpis";
import { useAppStore } from "@/lib/store";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/ros", label: "ROs", icon: ClipboardList },
  { to: "/follow-ups", label: "Follow-Ups", icon: PhoneCall },
  { to: "/notes", label: "Notes", icon: NotebookPen },
  { to: "/performance", label: "Performance", icon: Gauge },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function LaneClock() {
  const now = useNow();
  return (
    <div className="hidden text-right sm:block" suppressHydrationWarning>
      <div className="font-mono text-sm tabular-nums">{format(now, "h:mm a")}</div>
      <div className="text-xs text-muted">{format(now, "EEE, MMM d")}</div>
    </div>
  );
}

function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <div className="h-8 w-24 animate-pulse rounded-md bg-ink/10" />;
  if (user) return <UserButton />;
  return (
    <Link to="/login" className="text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
      Sign in
    </Link>
  );
}

function ShellInner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const settings = useAppStore((s) => s.settings);
  const ros = useAppStore((s) => s.ros);
  const followUps = useAppStore((s) => s.followUps);
  const now = useNow();
  const kpis = computeKpis(ros, settings, now);
  const queue = deriveFollowUps(ros, followUps, settings, now);
  const attention = kpis.updatesDue + kpis.waitingCustomer + kpis.ready;
  const onFleet = pathname.startsWith("/fleet");

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-md bg-ink text-[11px] font-semibold tracking-wide text-elevated">
              SA
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold tracking-tight">Command Center</span>
              <span className="hidden text-xs text-muted sm:block">{settings.storeName}</span>
            </span>
          </Link>
          <nav className="ml-4 hidden items-center gap-0.5 lg:flex">
            {NAV.map((item) => {
              const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              const badge = item.to === "/follow-ups" ? queue.length : item.to === "/" ? attention : 0;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "relative flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-150",
                    active ? "bg-ink/6 text-ink" : "text-muted hover:bg-ink/4 hover:text-ink",
                  )}
                >
                  <item.icon className="size-3.5" />
                  {item.label}
                  {badge > 0 ? (
                    <span className="ml-0.5 rounded-sm bg-accent px-1 py-px font-mono text-[10px] text-accent-fg tabular-nums">
                      {badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            <Link
              to="/fleet"
              className={cn(
                "relative flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-150",
                onFleet ? "bg-ink/6 text-ink" : "text-muted hover:bg-ink/4 hover:text-ink",
              )}
            >
              <MapPinned className="size-3.5" />
              Fleet
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <LaneClock />
            <Link
              to={onFleet ? "/" : "/fleet"}
              className="text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline lg:hidden"
            >
              {onFleet ? "Lane board" : "Fleet"}
            </Link>
            <div className="hidden h-8 w-px bg-border sm:block" />
            <div className="text-right">
              <div className="text-xs font-medium">{settings.advisorName}</div>
              <SignedIn>
                <div className="text-xs text-muted">Signed in</div>
              </SignedIn>
              <SignedOut>
                <div className="text-xs text-muted">Local lane</div>
              </SignedOut>
            </div>
            <AuthSlot />
          </div>
        </div>
      </header>

      <main suppressHydrationWarning className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 pb-24 sm:px-5 lg:pb-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-sm lg:hidden">
        <div className="grid grid-cols-6">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                  active ? "text-ink" : "text-muted",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <RoInspector />
      <VehicleDrawer />
    </div>
  );
}

export function AppShell() {
  return (
    <TooltipProvider>
      <NowProvider>
        <HydrateStore />
        <HydrateFleet />
        <ShellInner />
        <Toaster position="bottom-right" richColors closeButton />
      </NowProvider>
    </TooltipProvider>
  );
}
