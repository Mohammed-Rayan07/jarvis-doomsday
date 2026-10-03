"use client";
import { nanoid } from "nanoid";
import { useQueue } from "@/store/queue";
import { usePreview } from "@/store/preview";
import { toolMeta } from "@/lib/tools/schemas";
import type { ChatTurn, Command, Plan, PlanStep, StepRun, ToolResult } from "@/lib/types";

// Client-side command executor. BUILD_SPEC §5 (lifecycle, queue, interrupt) and D2.
//
//   submit() → queue/interrupt → run() → /api/plan → per step:
//     templates → confirm? → /api/execute | interactive UI → preview.focus → log
//
// Interactive steps and confirmations are resolved by UI components calling
// resolveInteraction(); the executor awaits them as promises.

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const nowIso = () => new Date().toISOString();

let controller: AbortController | undefined;
/** Interrupting command jumps the queue once the aborted one settles. */
let priorityNext: string | undefined;
let attachments: File[] = [];
/** Command being re-planned because Tony kept talking (voice fragment merged into it). */
let replanId: string | undefined;
const waiters = new Map<string, (v: InteractionOutcome) => void>();
/** Step results per command, so templates still resolve when a step is retried later. */
const commandResults = new Map<string, Record<string, ToolResult>>();
/** Commands where Tony chose "Authorise all" — remaining non-destructive steps skip the card. */
const approveAll = new Set<string>();

export type InteractionOutcome =
  | { type: "approve"; args?: Record<string, unknown>; all?: boolean }
  | { type: "skip" }
  | { type: "cancel" }
  | { type: "done"; result: ToolResult };

export function getAttachments() {
  return attachments;
}

/** Args as currently edited in an open ConfirmCard — so a spoken "confirm" keeps Tony's edits. */
const drafts = new Map<string, Record<string, unknown>>();
export const setDraftArgs = (stepKey: string, args: Record<string, unknown>) => drafts.set(stepKey, args);
export const getDraftArgs = (stepKey: string) => drafts.get(stepKey);

/** Called by ConfirmCard / UploadCard. */
export function resolveInteraction(stepKey: string, outcome: InteractionOutcome) {
  waiters.get(stepKey)?.(outcome);
  waiters.delete(stepKey);
  drafts.delete(stepKey);
}

function waitForInteraction(commandId: string, stepId: string, type: "confirm" | "upload", signal: AbortSignal) {
  const key = `${commandId}:${stepId}`;
  useQueue.getState().setPending({ commandId, stepId, type });
  return new Promise<InteractionOutcome>((resolve) => {
    waiters.set(key, resolve);
    signal.addEventListener("abort", () => resolve({ type: "cancel" }), { once: true });
  }).finally(() => useQueue.getState().setPending(undefined));
}

export function submit(text: string, files: File[] = [], opts: { interrupt?: boolean } = {}) {
  const q = useQueue.getState();
  const trimmed = text.trim();
  if (!trimmed && files.length === 0) return;

  const userText = trimmed || `📎 ${files.map((f) => f.name).join(", ")}`;
  if (files.length) attachments = files;

  // Clarification answer → re-plan the pending command with history.
  if (q.awaitingInputFor) {
    const id = q.awaitingInputFor;
    q.setAwaitingInput(undefined);
    q.pushMessage({ id: nanoid(), role: "user", text: userText, at: nowIso(), commandId: id });
    void run(id, trimmed);
    return;
  }

  const cmd: Command = { id: `cmd_${nanoid(6)}`, text: trimmed, status: "queued", steps: [], createdAt: nowIso() };
  q.pushMessage({ id: nanoid(), role: "user", text: userText, at: nowIso(), commandId: cmd.id });
  q.addCommand(cmd);

  const busy = Boolean(q.currentId);
  if (busy && (opts.interrupt || q.mode === "interrupt")) {
    priorityNext = cmd.id;
    interrupt("New orders received — standing down the current operation.");
  } else if (!busy) {
    void run(cmd.id);
  }
}

/**
 * Voice: Tony paused mid-order ("Schedule the team meeting at 6 PM," … "remind me 30 minutes
 * before it"). If the current command is still being planned — or already planned but nothing
 * has run yet (e.g. its first confirmation card is up) — fold the new words into it and re-plan
 * silently instead of queueing a second, broken command. Returns false if there's nothing to amend.
 */
export function amendPlanning(extra: string): boolean {
  const q = useQueue.getState();
  const cmd = q.commands.find((c) => c.id === q.currentId);
  const untouched = cmd?.status === "planning" || (cmd?.status === "running" && !cmd.steps.some((s) => s.status === "done" || s.status === "running"));
  if (!cmd || !untouched || !controller) return false;
  const text = `${cmd.text} ${extra}`.trim();
  q.updateCommand(cmd.id, { text });
  const msg = [...q.messages].reverse().find((m) => m.role === "user" && m.commandId === cmd.id);
  if (msg) q.editMessage(msg.id, text);
  replanId = cmd.id;
  controller.abort();
  return true;
}

export function interrupt(reason = "Operation cancelled, sir.") {
  if (!controller) return;
  controller.abort();
  useQueue.getState().pushMessage({ id: nanoid(), role: "jarvis", text: reason, at: nowIso(), kind: "summary" });
}

/**
 * Conversation context for planning `commandId`: everything before this command's latest
 * user turn, minus turns from commands still waiting in the queue (they haven't happened yet,
 * and would otherwise leak into this plan).
 */
function history(commandId: string): ChatTurn[] {
  const { messages, commands } = useQueue.getState();
  // skip commands still waiting (haven't happened yet) and ones interrupted before anything ran
  // (Tony withdrew them — they'd otherwise be re-planned into this command)
  const queued = new Set(
    commands
      .filter((c) => c.id !== commandId && (c.status === "queued" || (c.status === "cancelled" && !c.steps.some((st) => st.status === "done"))))
      .map((c) => c.id),
  );
  let end = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && messages[i].commandId === commandId) {
      end = i;
      break;
    }
  }
  return messages
    .slice(0, end)
    .filter((m) => !(m.commandId && queued.has(m.commandId)))
    .slice(-12)
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
}

async function run(commandId: string, clarificationAnswer?: string) {
  const q = useQueue.getState();
  const cmd = q.commands.find((c) => c.id === commandId);
  if (!cmd) return;

  controller = new AbortController();
  const signal = controller.signal;
  q.setCurrent(commandId);
  q.updateCommand(commandId, { status: "planning", startedAt: cmd.startedAt ?? nowIso() });

  try {
    const planRes = await fetch("/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jarvis-tz": tz() },
      body: JSON.stringify({
        // Combine original order + answer so the backup brain (no history) can complete it too.
        text: clarificationAnswer ? `${cmd.text} ${clarificationAnswer}` : cmd.text,
        history: history(commandId),
        tz: tz(),
        now: nowIso(),
        attachments: attachments.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      }),
      signal,
    });
    const planJson = await planRes.json();
    if (!planJson.ok) throw new Error(planJson.error?.message ?? "Planner offline");
    const plan = planJson.data as Plan;
    if (signal.aborted) throw new DOMException("Aborted", "AbortError"); // amended / interrupted mid-flight

    q.pushMessage({
      id: nanoid(),
      role: "jarvis",
      text: plan.reply,
      at: nowIso(),
      commandId,
      kind: plan.kind === "clarify" ? "clarify" : "text",
      options: plan.clarification?.options,
      source: plan.source,
      planKind: plan.steps.length ? plan.kind : plan.kind === "execute" ? "answer" : plan.kind,
    });

    if (plan.kind === "clarify") {
      q.updateCommand(commandId, { status: "awaiting_input", plan });
      q.setAwaitingInput(commandId);
      return finish(commandId, false);
    }
    if (plan.kind === "answer" || plan.steps.length === 0) {
      q.updateCommand(commandId, { status: "done", plan, finishedAt: nowIso() });
      return finish(commandId);
    }

    const steps: StepRun[] = plan.steps.map((s) => ({ ...s, status: "pending" }));
    q.updateCommand(commandId, { status: "running", plan, steps });

    commandResults.set(commandId, {});
    await executeSteps(commandId, 0, signal);
    if (replanId === commandId) {
      // amended while its first step awaited confirmation → re-plan with the merged words
      replanId = undefined;
      approveAll.delete(commandId);
      q.updateCommand(commandId, { status: "planning", steps: [], plan: undefined, finishedAt: undefined });
      const stale = [...useQueue.getState().messages].reverse().find((m) => m.role === "jarvis" && m.commandId === commandId && m.kind === "text");
      if (stale) q.dropMessage(stale.id); // superseded reply
      return void run(commandId, clarificationAnswer);
    }
  } catch (err) {
    if (replanId === commandId) {
      replanId = undefined;
      return void run(commandId, clarificationAnswer);
    }
    const aborted = signal.aborted;
    q.updateCommand(commandId, { status: aborted ? "cancelled" : "failed", finishedAt: nowIso() });
    if (!aborted) {
      q.pushMessage({
        id: nanoid(),
        role: "jarvis",
        text: `I've hit a problem, sir: ${err instanceof Error ? err.message : String(err)}`,
        at: nowIso(),
        commandId,
        kind: "error",
      });
    }
  }
  finish(commandId);
}

/** Run a command's steps from `startIndex`, stopping at the first failure (later steps → skipped). */
async function executeSteps(commandId: string, startIndex: number, signal: AbortSignal) {
  const q = useQueue.getState();
  const results = commandResults.get(commandId) ?? {};
  commandResults.set(commandId, results);
  const steps = q.commands.find((c) => c.id === commandId)?.steps ?? [];

  let failed = false;
  for (const step of steps.slice(startIndex)) {
    if (signal.aborted || failed) {
      q.updateStep(commandId, step.id, { status: signal.aborted ? "cancelled" : "skipped" });
      continue;
    }
    const current = useQueue.getState().commands.find((c) => c.id === commandId)?.steps.find((s) => s.id === step.id) ?? step;
    const outcome = await runStep(commandId, current, results, signal);
    if (outcome === "cancelled") continue;
    if (outcome && !outcome.ok) failed = true;
  }

  const final = useQueue.getState().commands.find((c) => c.id === commandId)!;
  const done = final.steps.filter((s) => s.status === "done").length;
  const status = signal.aborted ? "cancelled" : done === final.steps.length ? "done" : done > 0 ? "partial" : "failed";
  q.updateCommand(commandId, { status, finishedAt: nowIso() });
  if (replanId === commandId) return; // being re-planned (amended) — not a real stand-down
  if (final.steps.length > 1 || status !== "done") {
    const failedStep = final.steps.find((s) => s.status === "failed");
    q.pushMessage({
      id: nanoid(),
      role: "jarvis",
      text:
        status === "done"
          ? `${done} of ${final.steps.length} operations completed. All systems nominal, sir.`
          : status === "cancelled"
            ? `Stood down. ${done} of ${final.steps.length} operations had completed before the interrupt.`
            : `${done} of ${final.steps.length} operations completed.${failedStep ? ` "${failedStep.summary}" failed — ${failedStep.result?.message ?? "see above"}` : ""}`,
      at: nowIso(),
      commandId,
      kind: status === "done" || status === "cancelled" ? "summary" : "error", // Tony's own stand-down isn't a failure
    });
  }
  approveAll.delete(commandId);
}

/**
 * Retry a failed step (optionally with corrected args, e.g. a different recipient) and
 * continue with the steps that were skipped after it. Runs as the current command.
 */
export async function retryStep(commandId: string, stepId: string, patch: Record<string, unknown> = {}) {
  const q = useQueue.getState();
  if (q.currentId) {
    q.pushMessage({ id: nanoid(), role: "jarvis", text: "One moment, sir — I'm still busy with the current operation.", at: nowIso(), kind: "summary" });
    return;
  }
  const cmd = q.commands.find((c) => c.id === commandId);
  const index = cmd?.steps.findIndex((s) => s.id === stepId) ?? -1;
  if (!cmd || index < 0) return;
  const step = cmd.steps[index];
  q.updateStep(commandId, stepId, { status: "pending", result: undefined, args: { ...step.args, ...patch } });
  for (const s of cmd.steps.slice(index + 1)) if (s.status === "skipped") q.updateStep(commandId, s.id, { status: "pending" });

  controller = new AbortController();
  q.setCurrent(commandId);
  q.updateCommand(commandId, { status: "running" });
  try {
    await executeSteps(commandId, index, controller.signal);
  } finally {
    finish(commandId);
  }
}

async function runStep(
  commandId: string,
  step: StepRun,
  results: Record<string, ToolResult>,
  signal: AbortSignal,
): Promise<ToolResult | "cancelled" | undefined> {
  const q = useQueue.getState();
  const meta = toolMeta[step.tool];
  let args = resolveTemplates(step.args, results) as Record<string, unknown>;

  // Confirmation gate (BUILD_SPEC §5, 5.2)
  const autoApproved =
    (!meta.consequential && q.autoApprove.reads) ||
    (step.tool.startsWith("reminders.") && !meta.danger && q.autoApprove.reminders) ||
    (approveAll.has(commandId) && !meta.danger);
  if (meta.consequential && !meta.interactive && !autoApproved) {
    q.updateStep(commandId, step.id, { status: "awaiting_confirmation", args });
    const o = await waitForInteraction(commandId, step.id, "confirm", signal);
    if (o.type === "cancel") {
      controller?.abort();
      q.updateStep(commandId, step.id, { status: "cancelled" });
      return "cancelled";
    }
    if (o.type === "skip") {
      q.updateStep(commandId, step.id, { status: "skipped" });
      return undefined;
    }
    if (o.type === "approve" && o.args) args = o.args;
    if (o.type === "approve" && o.all) approveAll.add(commandId);
  }

  q.updateStep(commandId, step.id, { status: "running", startedAt: nowIso(), args });

  let result: ToolResult;
  if (meta.interactive) {
    // drive.upload → UploadCard handles file + folder + progress and resolves with the result.
    const o = await waitForInteraction(commandId, step.id, "upload", signal);
    if (o.type !== "done") {
      q.updateStep(commandId, step.id, { status: "cancelled" });
      return "cancelled";
    }
    result = o.result;
    attachments = [];
  } else {
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "content-type": "application/json", "x-jarvis-tz": tz() },
        body: JSON.stringify({ tool: step.tool, args, tz: tz(), commandId }),
        signal,
      });
      result = (await res.json()) as ToolResult;
    } catch (err) {
      if (signal.aborted) {
        q.updateStep(commandId, step.id, { status: "cancelled", finishedAt: nowIso() });
        q.pushMessage({ id: nanoid(), role: "jarvis", text: `"${step.summary}" was interrupted mid-flight; its outcome may still land.`, at: nowIso(), commandId, kind: "summary" });
        return "cancelled";
      }
      result = { ok: false, message: "Network link lost, sir.", error: { code: "NETWORK", message: String(err) } };
    }
  }

  results[step.id] = result;
  q.updateStep(commandId, step.id, { status: result.ok ? "done" : "failed", result, finishedAt: nowIso() });
  if (result.preview) usePreview.getState().focus(result.preview);
  void logAction(commandId, step, result);
  return result;
}

function finish(commandId: string, dequeue = true) {
  const q = useQueue.getState();
  if (q.currentId === commandId) q.setCurrent(undefined);
  controller = undefined;
  if (!dequeue) return;
  const queued = useQueue.getState().commands.filter((c) => c.status === "queued");
  const next = queued.find((c) => c.id === priorityNext) ?? queued[0];
  priorityNext = undefined;
  if (next) void run(next.id);
}

async function logAction(commandId: string, step: PlanStep, result: ToolResult) {
  const cmd = useQueue.getState().commands.find((c) => c.id === commandId);
  await fetch("/api/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      commandId,
      commandText: cmd?.text,
      tool: step.tool,
      summary: step.summary,
      status: result.ok ? "done" : "failed",
      message: result.message,
      previewTab: result.preview?.tab ?? toolMeta[step.tool].previewTab,
    }),
  }).catch(() => undefined);
  usePreview.getState().refresh("log");
}

/** Replace "{{s1.data.start}}" refs with values from earlier step results. */
export function resolveTemplates(value: unknown, results: Record<string, ToolResult>): unknown {
  if (typeof value === "string") {
    const whole = value.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
    if (whole) return lookup(whole[1], results);
    return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, p: string) => String(lookup(p, results) ?? ""));
  }
  if (Array.isArray(value)) return value.map((v) => resolveTemplates(v, results));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveTemplates(v, results)]));
  return value;
}

function lookup(path: string, results: Record<string, ToolResult>): unknown {
  const [stepId, ...rest] = path.split(".");
  return rest.reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], results[stepId]);
}
