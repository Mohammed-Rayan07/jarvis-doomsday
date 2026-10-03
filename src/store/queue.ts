"use client";
import { create } from "zustand";
import type { Command, CommandStatus, StepRun, StepStatus } from "@/lib/types";

// Command queue + chat transcript. The executor (src/engine/executor.ts) drives it.
// BUILD_SPEC §5.

export type QueueMode = "queue" | "interrupt";

export interface ChatMessage {
  id: string;
  role: "user" | "jarvis";
  text: string;
  at: string;
  commandId?: string;
  kind?: "text" | "clarify" | "error" | "summary";
  options?: string[];
  /** which brain produced the plan — surfaced so a silent LLM fallback is visible */
  source?: "llm" | "backup";
  /** for plan replies: the plan kind, so voice can skip "fetching…" preambles on execute plans */
  planKind?: "execute" | "clarify" | "answer";
}

/** Pending user decision the executor is awaiting (confirm card / upload card). */
export interface PendingInteraction {
  commandId: string;
  stepId: string;
  type: "confirm" | "upload";
}

interface QueueState {
  mode: QueueMode;
  commands: Command[]; // history + queued + current
  currentId?: string;
  messages: ChatMessage[];
  pending?: PendingInteraction;
  /** commandId awaiting a clarification answer */
  awaitingInputFor?: string;
  autoApprove: { reminders: boolean; reads: boolean };

  setMode: (m: QueueMode) => void;
  addCommand: (c: Command) => void;
  updateCommand: (id: string, patch: Partial<Command>) => void;
  setCommandStatus: (id: string, status: CommandStatus) => void;
  updateStep: (commandId: string, stepId: string, patch: Partial<StepRun> & { status?: StepStatus }) => void;
  removeQueued: (id: string) => void;
  setCurrent: (id?: string) => void;
  pushMessage: (m: ChatMessage) => void;
  setPending: (p?: PendingInteraction) => void;
  setAwaitingInput: (id?: string) => void;
  editMessage: (id: string, text: string) => void;
}

export const useQueue = create<QueueState>((set) => ({
  mode: "queue",
  commands: [],
  messages: [],
  autoApprove: { reminders: true, reads: true },

  setMode: (mode) => set({ mode }),
  addCommand: (c) => set((s) => ({ commands: [...s.commands, c] })),
  updateCommand: (id, patch) =>
    set((s) => ({ commands: s.commands.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  setCommandStatus: (id, status) =>
    set((s) => ({ commands: s.commands.map((c) => (c.id === id ? { ...c, status } : c)) })),
  updateStep: (commandId, stepId, patch) =>
    set((s) => ({
      commands: s.commands.map((c) =>
        c.id === commandId ? { ...c, steps: c.steps.map((st) => (st.id === stepId ? { ...st, ...patch } : st)) } : c,
      ),
    })),
  removeQueued: (id) =>
    set((s) => ({ commands: s.commands.filter((c) => !(c.id === id && c.status === "queued")) })),
  setCurrent: (currentId) => set({ currentId }),
  pushMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  setPending: (pending) => set({ pending }),
  setAwaitingInput: (awaitingInputFor) => set({ awaitingInputFor }),
  editMessage: (id, text) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, text } : m)) })),
}));

export const selectQueued = (s: QueueState) => s.commands.filter((c) => c.status === "queued");
export const selectCurrent = (s: QueueState) => s.commands.find((c) => c.id === s.currentId);
