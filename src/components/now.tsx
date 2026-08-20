import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DEMO_NOW } from "@/lib/seed";

const NowCtx = createContext(DEMO_NOW);

export function NowProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(DEMO_NOW);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return <NowCtx.Provider value={now}>{children}</NowCtx.Provider>;
}

export function useNow() {
  return useContext(NowCtx);
}
