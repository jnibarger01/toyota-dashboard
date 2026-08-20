import { create } from "zustand";
import { persist } from "zustand/middleware";
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
  addScratch: (text: string, now: number) => void;
  removeScratch: (id: string) => void;
  setSettings: (patch: Partial<AppSettings>) => void;
  markHydrated: () => void;
  resetDemo: (now?: number) => void;
};

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

export const useAppStore = create<LaneState>()(
  persist(
    (set, get) => ({
      ...seedAll(),
      selectedId: null,
      query: "",
      boardFilter: "all",
      includeCompleted: false,
      composer: null,
      hydrated: false,
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
      addScratch: (text, now) => {
        const t = text.trim();
        if (!t) return;
        set({ scratch: [{ id: uid("sc"), text: t, createdAt: new Date(now).toISOString() }, ...get().scratch] });
      },
      removeScratch: (id) => set({ scratch: get().scratch.filter((s) => s.id !== id) }),
      setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
      markHydrated: () => {
        const s = get();
        if (s.seededAt === DEMO_NOW || s.ros.length === 0) {
          set({ ...seedAll(Date.now()), hydrated: true, selectedId: s.selectedId });
        } else {
          set({ hydrated: true });
        }
      },
      resetDemo: (now = Date.now()) => set({ ...seedAll(now), selectedId: null, query: "", boardFilter: "all" }),
    }),
    {
      name: "sacc-lane-v2",
      skipHydration: true,
      partialize: (s) => ({
        ros: s.ros,
        followUps: s.followUps,
        scratch: s.scratch,
        settings: s.settings,
        seededAt: s.seededAt,
      }),
    },
  ),
);
