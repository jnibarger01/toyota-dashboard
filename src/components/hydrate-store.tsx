import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

export function HydrateStore() {
  const markHydrated = useAppStore((s) => s.markHydrated);
  useEffect(() => {
    markHydrated();
    void Promise.resolve(useAppStore.persist.rehydrate()).then(() => {
      markHydrated();
    });
  }, [markHydrated]);
  return null;
}
