"use client";
import { useQueue } from "@/store/queue";
import { toolMeta } from "@/lib/tools/schemas";
import type { Command, StepRun } from "@/lib/types";
import { say, useVoice } from "./voice";

// What JARVIS says out loud. Chat messages (plan replies, clarifying questions, errors, summaries)
// are spoken as they appear; the *answers* to read requests live in step results, so those are
// spoken too. Write-step results are only spoken for single-step commands — for multi-step plans
// the final summary covers them (saves voice credits).
//
// Stock lines are separate utterances so the server's TTS cache makes them free after one take.

const ASK = "Say confirm, or cancel, sir.";
const ASK_ALL = "Say confirm, authorise all, or cancel, sir.";

export function startNarration() {
  const spokenMsgs = new Set(useQueue.getState().messages.map((m) => m.id));
  const spokenSteps = new Set<string>();

  return useQueue.subscribe((s, prev) => {
    if (s.messages !== prev.messages) {
      for (const m of s.messages) {
        if (spokenMsgs.has(m.id)) continue;
        spokenMsgs.add(m.id);
        if (m.role !== "jarvis") continue;
        const cmd = s.commands.find((c) => c.id === m.commandId);
        // "2 of 2 operations completed" after a pure lookup is noise — the answers were already spoken
        if (m.kind === "summary" && cmd && cmd.steps.every((st) => st.status === "done" && !toolMeta[st.tool].consequential)) continue;
        say(m.text);
      }
    }
    if (s.commands !== prev.commands) {
      for (const c of s.commands) for (const st of c.steps) narrateStep(c, st, spokenSteps);
    }
  });
}

function narrateStep(c: Command, st: StepRun, spoken: Set<string>) {
  const key = `${c.id}:${st.id}:${st.status}:${st.finishedAt ?? st.startedAt ?? ""}`;
  if (spoken.has(key)) return;
  spoken.add(key);
  const meta = toolMeta[st.tool];
  const live = useVoice.getState().live;

  if (st.status === "awaiting_confirmation" && live) {
    say(confirmLine(st));
    const more = c.steps.some((o) => o.status === "pending" && toolMeta[o.tool].consequential && !toolMeta[o.tool].interactive);
    say(more ? ASK_ALL : ASK);
  } else if (st.status === "running" && meta.interactive && live) {
    say("Choose the file and the destination folder on screen, sir.");
  } else if (st.status === "done" && st.result?.message) {
    if (!meta.consequential || c.steps.length === 1) say(st.result.message);
  }
}

function confirmLine(st: StepRun) {
  const a = st.args as Record<string, unknown>;
  if (st.tool === "telegram.send") return `Message for ${a.recipient}: ${String(a.text ?? "")}`;
  if (st.tool === "calendar.create_event" && typeof a.start === "string")
    return `${String(a.title ?? "The event")}, ${new Date(a.start).toLocaleString("en-GB", { weekday: "long", hour: "numeric", minute: "2-digit", hour12: true })}.`;
  return `${st.summary}.`;
}
