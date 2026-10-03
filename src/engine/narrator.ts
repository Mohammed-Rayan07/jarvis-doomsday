"use client";
import { useQueue } from "@/store/queue";
import { toolMeta } from "@/lib/tools/schemas";
import type { Command, StepRun } from "@/lib/types";
import { offerAll, say } from "./voice";
import { answerFor, confirmFor, doneFor, isRead, wrapUp } from "./speech";

// What JARVIS says out loud — conversation, not narration:
//  - answer / clarify plans: the LLM's reply (+ short clickable options read out as a choice)
//  - execute plans: NO "fetching your schedule…" preamble; JARVIS speaks once, with the result:
//      lookups → a composed natural answer, writes → "Done. …", multi-step → one wrap-up line
//  - confirmations: one natural question ("Shall I send the team: …?"); multi-step asks once for all
//  - failures: the error, plainly
// Stock lines are separate utterances so the server's TTS cache makes them free after one take.

const TERMINAL = new Set(["done", "partial", "failed"]);

export function startNarration() {
  const spokenMsgs = new Set(useQueue.getState().messages.map((m) => m.id));
  const spokenSteps = new Set<string>();
  const finished = new Set(useQueue.getState().commands.filter((c) => TERMINAL.has(c.status)).map((c) => c.id + c.finishedAt));
  const asked = new Set<string>();

  return useQueue.subscribe((s, prev) => {
    if (s.messages !== prev.messages) {
      for (const m of s.messages) {
        if (spokenMsgs.has(m.id)) continue;
        spokenMsgs.add(m.id);
        if (m.role !== "jarvis") continue;
        if (m.kind === "clarify") {
          const opts = m.options?.filter((o) => o.split(" ").length <= 3) ?? [];
          say(opts.length >= 2 && opts.length === m.options?.length ? `${m.text} ${opts.slice(0, -1).join(", ")}, or ${opts.at(-1)}?` : m.text);
        } else if (m.kind === "text") {
          if (m.planKind !== "execute") say(m.text);
        } else if (/^(Stood down|Operation cancelled|New orders received)/.test(m.text)) {
          say("Standing down, sir.");
        } else if (m.kind === "error" && !/^\d+ of \d+ operations/.test(m.text)) {
          say(m.text); // planner / network failure (step failures are voiced by narrateOutcome)
        }
      }
    }
    if (s.commands !== prev.commands) {
      for (const c of s.commands) {
        for (const st of c.steps) narrateStep(c, st, spokenSteps, asked);
        const key = c.id + c.finishedAt;
        if (c.plan?.kind === "execute" && TERMINAL.has(c.status) && !finished.has(key)) {
          finished.add(key);
          narrateOutcome(c);
        }
      }
    }
  });
}

function narrateStep(c: Command, st: StepRun, spoken: Set<string>, asked: Set<string>) {
  const key = `${c.id}:${st.id}:${st.status}:${st.startedAt ?? ""}`;
  if (spoken.has(key)) return;
  spoken.add(key);
  if (st.status === "awaiting_confirmation") {
    if (asked.has(c.id)) return; // "all of it" was already asked for this command
    const { text, all } = confirmFor(c, st);
    if (all) {
      asked.add(c.id);
      offerAll(c.id);
    }
    say(text);
  } else if (st.status === "running" && toolMeta[st.tool].interactive) {
    say("Choose the file and the destination folder on screen, sir.");
  }
}

function narrateOutcome(c: Command) {
  const failed = c.steps.find((s) => s.status === "failed");
  if (failed) {
    const done = c.steps.filter((s) => s.status === "done");
    const prefix = done.length ? `${wrapUp({ ...c, steps: done })} But ` : "";
    say(`${prefix}I couldn't ${failed.summary.charAt(0).toLowerCase()}${failed.summary.slice(1)}. ${failed.result?.message ?? ""}`.trim());
    return;
  }
  const done = c.steps.filter((s) => s.status === "done");
  if (!done.length) return;
  const writes = done.filter((s) => !isRead(s.tool));
  if (!writes.length) say(answerFor(c));
  else if (done.length === 1) say(doneFor(writes[0]));
  else say(wrapUp(c));
}
