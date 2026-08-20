import { create } from "zustand";
import { uid } from "./utils";
import { createSeedData, DEMO_NOW } from "./seed";
import type {
  AppSettings,
  BoardFilter,
  ComposerState,
  FollowUp,
  FollowUpOutcome,
  RepairOrder,
  RoStatus,
  ScratchNote,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";

type LaneState = {
  ros: RepairOrder[];
  followUps: FollowUp[];
  scratch: ScratchNote[];
  settings: AppSettings;
  selectedId: string | null;
  query: string;
  boardFilter: BoardFilter;
  includeCompleted: boolean;
  composer: ComposerState;
  hydrated: boolean;
  loadError: string | null;
  seededAt: number;
  selectRo: (id: string | null) => void;
  setQuery: (q: string) => void;
  setBoardFilter: (f: BoardFilter) => void;
  setIncludeCompleted: (v: boolean) => void;
  setComposer: (c: ComposerState) => void;
  updateRo: (id: string, patch: Partial<RepairOrder>) => void;
  updateRoStatus: (id: string, status: RoStatus, now: number) => void;
  addTimeline: (id: string, label: string, kind: RepairOrder["timeline"][number]["kind"], now: number) => void;
  addRo: (ro: RepairOrder) => void;
  setFollowUpOutcome: (id: string, outcome: FollowUpOutcome) => void;
  addFollowUp: (fu: FollowUp) => void;
  replaceFollowUps: (followUps: FollowUp[]) => void;
  addScratch: (text: string, now: number) => void;
  addScratchNote: (note: ScratchNote) => void;
  removeScratch: (id: string) => void;
  setSettings: (patch: Partial<AppSettings>) => void;
  resetDemo: (now?: number) => void;
  hydrate: (snapshot: LaneSnapshot, persist: boolean) => void;
  setLoadError: (message: string | null) => void;
  persist: boolean;
};

export type LaneSnapshot = Pick<LaneState, "ros" | "followUps" | "scratch" | "settings" | "seededAt">;

const IS_STATIC_DEMO = import.meta.env.VITE_DEPLOY_TARGET === "pages" || import.meta.env.VITE_AUTH_ENABLED === "false";

function seedAll(now = DEMO_NOW): Pick<LaneState, "ros" | "followUps" | "scratch" | "settings" | "seededAt"> {
  return {
    ros: createSeedData(now),
    followUps: [],
    scratch: [
      { id: "s1", text: "Call Camry customer after lunch", createdAt: new Date(now).toISOString() },
      { id: "s2", text: "Check with parts on Highlander sensor", createdAt: new Date(now).toISOString() },
      { id: "s3", text: "Waiting for extended warranty authorization", createdAt: new Date(now).toISOString() },
    ],
    settings: { ...DEFAULT_SETTINGS },
    seededAt: now,
  };
}

function emptyAll(now = Date.now()): Pick<LaneState, "ros" | "followUps" | "scratch" | "settings" | "seededAt"> {
  return { ros: [], followUps: [], scratch: [], settings: { ...DEFAULT_SETTINGS }, seededAt: now };
}

export const useAppStore = create<LaneState>()(
  (set, get) => ({
      ...(IS_STATIC_DEMO ? seedAll() : emptyAll()),
      selectedId: null,
      query: "",
      boardFilter: "all",
      includeCompleted: false,
      composer: null,
      hydrated: false,
      loadError: null,
      persist: false,
      selectRo: (id) => set({ selectedId: id }),
      setQuery: (query) => set({ query }),
      setBoardFilter: (boardFilter) => set({ boardFilter }),
      setIncludeCompleted: (includeCompleted) => set({ includeCompleted }),
      setComposer: (composer) => set({ composer }),
      updateRo: (id, patch) =>
        set({ ros: get().ros.map((r) => (r.id === id ? { ...r, ...patch } : r)) }),
      updateRoStatus: (id, status, now) => {
        const ro = get().ros.find((r) => r.id === id);
        if (!ro || ro.status === status) return;
        const event = {
          id: uid("ev"),
          at: new Date(now).toISOString(),
          label: status.replace(/_/g, " "),
          kind: "status" as const,
        };
        set({
          ros: get().ros.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status,
                  statusChangedAt: new Date(now).toISOString(),
                  timeline: [...r.timeline, event],
                }
              : r,
          ),
        });
      },
      addTimeline: (id, label, kind, now) =>
        set({
          ros: get().ros.map((r) =>
            r.id === id
              ? {
                  ...r,
                  timeline: [...r.timeline, { id: uid("ev"), at: new Date(now).toISOString(), label, kind }],
                }
              : r,
          ),
        }),
      addRo: (ro) => set({ ros: [ro, ...get().ros], selectedId: ro.id }),
      setFollowUpOutcome: (id, outcome) =>
        set({
          followUps: get().followUps.map((f) => (f.id === id ? { ...f, outcome } : f)),
        }),
      addFollowUp: (fu) => set({ followUps: [fu, ...get().followUps] }),
      replaceFollowUps: (followUps) => set({ followUps }),
      addScratch: (text, now) => {
        const t = text.trim();
        if (!t) return;
        set({ scratch: [{ id: uid("sc"), text: t, createdAt: new Date(now).toISOString() }, ...get().scratch] });
      },
      addScratchNote: (note) => set({ scratch: [note, ...get().scratch] }),
      removeScratch: (id) => set({ scratch: get().scratch.filter((s) => s.id !== id) }),
      setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
      resetDemo: (now = Date.now()) => {
        if (!IS_STATIC_DEMO) return;
        set({ ...seedAll(now), selectedId: null, query: "", boardFilter: "all" });
      },
      hydrate: (snapshot, persist) => set({ ...snapshot, hydrated: true, persist, loadError: null, selectedId: null, query: "", boardFilter: "all" }),
      setLoadError: (loadError) => set({ loadError }),
  }),
);
