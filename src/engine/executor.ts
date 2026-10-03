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
const waiters = new Map<string, (v: InteractionOutcome) => void>();

export type InteractionOutcome =
  | { type: "approve"; args?: Record<string, unknown> }
  | { type: "skip" }
  | { type: "cancel" }
  | { type: "done"; result: ToolResult };

export function getAttachments() {
  return attachments;
}

/** Called by ConfirmCard / UploadCard. */
export function resolveInteraction(stepKey: string, outcome: InteractionOutcome) {
  waiters.get(stepKey)?.(outcome);
  waiters.delete(stepKey);
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

  q.pushMessage({ id: nanoid(), role: "user", text: trimmed || `📎 ${files.map((f) => f.name).join(", ")}`, at: nowIso() });
  if (files.length) attachments = files;

  // Clarification answer → re-plan the pending command with history.
  if (q.awaitingInputFor) {
    const id = q.awaitingInputFor;
    q.setAwaitingInput(undefined);
    void run(id, trimmed);
    return;
  }

  const cmd: Command = { id: `cmd_${nanoid(6)}`, text: trimmed, status: "queued", steps: [], createdAt: nowIso() };
  q.addCommand(cmd);

  const busy = Boolean(q.currentId);
  if (busy && (opts.interrupt || q.mode === "interrupt")) {
    priorityNext = cmd.id;
    interrupt("New orders received — standing down the current operation.");
  } else if (!busy) {
    void run(cmd.id);
  }
}

export function interrupt(reason = "Operation cancelled, sir.") {
  if (!controller) return;
  controller.abort();
  useQueue.getState().pushMessage({ id: nanoid(), role: "jarvis", text: reason, at: nowIso(), kind: "summary" });
}

function history(): ChatTurn[] {
  return useQueue
    .getState()
    .messages.slice(-12)
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
        text: clarificationAnswer ?? cmd.text,
        history: history().slice(0, -1),
        tz: tz(),
        now: nowIso(),
        attachments: attachments.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      }),
      signal,
    });
    const planJson = await planRes.json();
    if (!planJson.ok) throw new Error(planJson.error?.message ?? "Planner offline");
    const plan = planJson.data as Plan;

    q.pushMessage({
      id: nanoid(),
      role: "jarvis",
      text: plan.reply,
      at: nowIso(),
      commandId,
      kind: plan.kind === "clarify" ? "clarify" : "text",
      options: plan.clarification?.options,
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

    const results: Record<string, ToolResult> = {};
    let failed = false;
    for (const step of steps) {
      if (signal.aborted || failed) {
        q.updateStep(commandId, step.id, { status: signal.aborted ? "cancelled" : "skipped" });
        continue;
      }
      const outcome = await runStep(commandId, step, results, signal);
      if (outcome === "cancelled") continue;
      if (outcome && !outcome.ok) failed = true;
    }

    const final = useQueue.getState().commands.find((c) => c.id === commandId)!;
    const done = final.steps.filter((s) => s.status === "done").length;
    const status = signal.aborted ? "cancelled" : done === final.steps.length ? "done" : done > 0 ? "partial" : "failed";
    q.updateCommand(commandId, { status, finishedAt: nowIso() });
    if (final.steps.length > 1 || status !== "done") {
      q.pushMessage({
        id: nanoid(),
        role: "jarvis",
        text: `${done} of ${final.steps.length} operations completed${status === "done" ? ". All systems nominal, sir." : "."}`,
        at: nowIso(),
        commandId,
        kind: "summary",
      });
    }
  } catch (err) {
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
    (!meta.consequential && q.autoApprove.reads) || (step.tool.startsWith("reminders.") && !meta.danger && q.autoApprove.reminders);
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
