import { useEffect } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { loadLane } from "@/lib/lane-server";
import { useAppStore } from "@/lib/store";
import { createSeedData } from "@/lib/seed";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { saveAdvisorSettings } from "@/lib/advisor-settings-server";

export function HydrateStore() {
  const { user, isPending } = useCurrentUserState();
  const hydrate = useAppStore((s) => s.hydrate);
  const setLoadError = useAppStore((s) => s.setLoadError);
  const persist = useAppStore((s) => s.persist);
  const hydrated = useAppStore((s) => s.hydrated);
  const settings = useAppStore((s) => s.settings);
  useEffect(() => {
    if (isPending) return;
    let cancelled = false;
    const demo = () => hydrate({ ros: createSeedData(), followUps: [], scratch: [], settings: { ...DEFAULT_SETTINGS }, seededAt: Date.now() }, false);
    const empty = () => hydrate({ ros: [], followUps: [], scratch: [], settings: { ...DEFAULT_SETTINGS }, seededAt: Date.now() }, false);
    if (!user) { demo(); return; }
    void loadLane().then((lane) => { if (!cancelled) hydrate(lane, true); }).catch(() => {
      if (!cancelled) {
        empty();
        setLoadError("Saved lane data is unavailable. No operational records were loaded.");
      }
    });
    return () => { cancelled = true; };
  }, [user, isPending, hydrate, setLoadError]);
  useEffect(() => {
    if (!persist || !hydrated || !user) return;
    const timer = window.setTimeout(() => { void saveAdvisorSettings({ data: settings }).catch(() => undefined); }, 700);
    return () => window.clearTimeout(timer);
  }, [persist, hydrated, user, settings]);
  return null;
}
