"use client";
import { create } from "zustand";
import type { SystemStatus } from "@/lib/types";

interface StatusState {
  status?: SystemStatus;
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
}

export const useStatus = create<StatusState>((set) => ({
  loading: true,
  refresh: async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      const json = await res.json();
      set({ status: json.data, loading: false, error: undefined });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "offline" });
    }
  },
}));
