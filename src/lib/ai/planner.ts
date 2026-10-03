import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { TOOL_NAMES, type Plan, type PlanRequest } from "../types";
import { languageModel } from "./provider";
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

const TIMEOUT_MS = 15_000;

export async function plan(req: PlanRequest, ctx: PlannerContext): Promise<Plan> {
  const model = languageModel();
  if (!model) return { ...fallbackPlan(req), source: "backup" };

  try {
    const { output } = await generateText({
      model,
      system: systemPrompt(ctx),
      messages: [...req.history, { role: "user" as const, content: req.text }],
      output: Output.object({ schema: PlanSchema }),
      temperature: 0,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ...(output as Plan), source: "llm" };
  } catch (err) {
    console.error("[planner] LLM failed, using backup brain:", err);
    return { ...fallbackPlan(req), source: "backup" };
  }
}
