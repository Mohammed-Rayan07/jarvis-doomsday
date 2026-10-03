"use client";
import { create } from "zustand";
import type { PreviewFocus, PreviewTab } from "@/lib/types";

// Live preview pane state. Executor calls focus() after each step (BUILD_SPEC §5).

interface PreviewState {
  tab: PreviewTab;
  highlightId?: string;
  driveMode: "browse" | "search";
  driveQuery?: string;
  driveFolderId?: string;
  /** bump per tab to make views refetch */
  version: Record<PreviewTab, number>;
  /** mobile: unseen change badge */
  unseen: boolean;
  setTab: (tab: PreviewTab) => void;
  focus: (f: PreviewFocus) => void;
  refresh: (tab: PreviewTab) => void;
  clearHighlight: () => void;
  openFolder: (id: string) => void;
  exitSearch: () => void;
  markSeen: () => void;
}

export const usePreview = create<PreviewState>((set) => ({
  tab: "calendar",
  driveMode: "browse",
  version: { calendar: 0, reminders: 0, drive: 0, comms: 0, log: 0 },
  unseen: false,
  setTab: (tab) => set({ tab }),
  focus: (f) =>
    set((s) => ({
      tab: f.tab,
      highlightId: f.highlightId,
      driveMode: f.tab === "drive" ? (f.mode ?? "browse") : s.driveMode,
      driveQuery: f.tab === "drive" ? f.query : s.driveQuery,
      driveFolderId: f.tab === "drive" && f.folderId ? f.folderId : s.driveFolderId,
      version: { ...s.version, [f.tab]: s.version[f.tab] + 1, log: s.version.log + 1 },
      unseen: true,
    })),
  refresh: (tab) => set((s) => ({ version: { ...s.version, [tab]: s.version[tab] + 1 } })),
  clearHighlight: () => set({ highlightId: undefined }),
  openFolder: (id) => set({ driveFolderId: id, driveMode: "browse", highlightId: undefined }),
  exitSearch: () => set({ driveMode: "browse", driveQuery: undefined }),
  markSeen: () => set({ unseen: false }),
}));
