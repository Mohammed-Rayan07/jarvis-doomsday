import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { TOOL_NAMES, type Plan, type PlanRequest } from "../types";
import { markUnhealthy, modelChain } from "./provider";
import { systemPrompt, type PlannerContext } from "./prompt";
import { fallbackPlan } from "./fallback";

// BUILD_SPEC §7. Args are a loose record here; strict per-tool validation happens in /api/execute.

export const PlanSchema = z.object({
  kind: z.enum(["execute", "clarify", "answer"]),
  reply: z.string(),
  steps: z.array(
    z.object({
      id: z.string(),
      tool: z.enum(TOOL_NAMES),
      args: z.record(z.string(), z.unknown()),
      summary: z.string(),
    }),
  ),
  clarification: z
    .object({
      question: z.string(),
      missing: z.array(z.string()),
      options: z.array(z.string()).optional(),
    })
    .optional(),
});

const PER_MODEL_TIMEOUT_MS = 12_000;
const TOTAL_BUDGET_MS = 25_000;

export async function plan(req: PlanRequest, ctx: PlannerContext): Promise<Plan> {
  const chain = modelChain();
  if (!chain.length) return { ...fallbackPlan(req), source: "backup" };

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const system = systemPrompt(ctx);
  const messages = [...req.history, { role: "user" as const, content: req.text }];

  for (const { id, model } of chain) {
    const remaining = deadline - Date.now();
    if (remaining < 2_000) break;
    const started = Date.now();
    try {
      const { output } = await generateText({
        model,
        system,
        messages,
        output: Output.object({ schema: PlanSchema }),
        temperature: 0,
        maxRetries: 0, // we fail over to the next model instead of waiting on retries
        // Planning is a fast structured task — keep Gemini "thinking" minimal for latency.
        // (Flash-Lite accepts "minimal"; full Flash models only go down to "low".)
        providerOptions: { google: { thinkingConfig: { thinkingLevel: id.includes("lite") ? "minimal" : "low" } } },
        abortSignal: AbortSignal.timeout(Math.min(PER_MODEL_TIMEOUT_MS, remaining)),
      });
      console.info(`[planner] ${id} ok in ${Date.now() - started}ms`);
      return rollForwardPastTimes({ ...(output as Plan), source: "llm" }, req.now);
    } catch (err) {
      markUnhealthy(id);
      console.warn(`[planner] ${id} failed after ${Date.now() - started}ms:`, err instanceof Error ? err.message : err);
    }
  }
  console.error("[planner] all models failed, using backup brain");
  return { ...fallbackPlan(req), source: "backup" };
}

/**
 * Models sometimes resolve a bare "at 7 PM" to today even after 7 PM has passed.
 * Push new reminders/events that landed in the (same-day) past to the next day.
 */
const TIME_ARGS: Record<string, string[]> = {
  "reminders.create": ["dueAt"],
  "calendar.create_event": ["start", "end"],
};

export function rollForwardPastTimes(plan: Plan, nowIso: string): Plan {
  const now = Date.parse(nowIso) || Date.now();
  for (const step of plan.steps) {
    const keys = TIME_ARGS[step.tool];
    const primary = keys && step.args[keys[0]];
    if (typeof primary !== "string") continue;
    const t = Date.parse(primary);
    if (Number.isNaN(t) || t >= now - 60_000 || now - t > 86_400_000) continue;
    for (const k of keys) {
      const v = step.args[k];
      if (typeof v === "string" && !Number.isNaN(Date.parse(v))) step.args[k] = new Date(Date.parse(v) + 86_400_000).toISOString();
    }
    step.summary += " (tomorrow — that time has passed today)";
  }
  return plan;
}
