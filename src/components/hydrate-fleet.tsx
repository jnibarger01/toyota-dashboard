import { useEffect, useRef } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { loadFleet, saveFleet } from "@/lib/fleet-server";
import { createSeedData } from "@/lib/fleet-seed";
import { snapshotFromStore, useFleetStore } from "@/lib/fleet-store";
import { useNow } from "./now";

export function HydrateFleet() {
  const { user, isPending } = useCurrentUserState();
  const hydrate = useFleetStore((s) => s.hydrate);
  const tick = useFleetStore((s) => s.tick);
  const hydrated = useFleetStore((s) => s.hydrated);
  const persist = useFleetStore((s) => s.persist);
  const alerts = useFleetStore((s) => s.alerts);
  const jobs = useFleetStore((s) => s.jobs);
  const drivers = useFleetStore((s) => s.drivers);
  const settings = useFleetStore((s) => s.settings);
  const now = useNow();
  const lastTick = useRef(now);

  useEffect(() => {
    if (isPending) return;
    let cancelled = false;
    (async () => {
      if (user) {
        try {
          const snap = await loadFleet();
          if (!cancelled) hydrate(snap, true);
          return;
        } catch {
          // Signed-in load can fail on first preview boot — fall through to local seed.
        }
      }
      if (!cancelled) hydrate(createSeedData(), false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isPending, hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    const dt = Math.max(0.2, Math.min(5, (now - lastTick.current) / 1000));
    lastTick.current = now;
    tick(now, dt);
  }, [now, hydrated, tick]);

  useEffect(() => {
    if (!persist || !hydrated || !user) return;
    const t = window.setTimeout(() => {
      void saveFleet({ data: snapshotFromStore() }).catch(() => undefined);
    }, 800);
    return () => window.clearTimeout(t);
  }, [persist, hydrated, user, alerts, jobs, drivers, settings]);

  return null;
}
