import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { env } from "../env";

// BUILD_SPEC §7 — provider switch + model fallback chain. No key → backup brain.
// Free-tier models get overloaded (503) or rate-limited (429), so we try the next
// model in the chain and briefly skip ones that just failed.

const DEFAULT_CHAINS = {
  anthropic: ["claude-sonnet-5-5", "claude-haiku-4-5"],
  google: ["gemini-flash-latest", "gemini-3.8-flash", "gemini-flash-lite-latest"],
  openai: ["gpt-4.1-mini"],
} as const;

const COOLDOWN_MS = 60_000;
const cooldown = new Map<string, number>();

export function aiInfo() {
  const provider = env.aiProvider;
  const chain: string[] = env.aiModel ? [env.aiModel] : [...DEFAULT_CHAINS[provider]];
  const configured =
    (provider === "anthropic" && !!env.anthropicKey) ||
    (provider === "google" && !!env.googleAiKey) ||
    (provider === "openai" && !!env.openaiKey);
  return { provider, model: chain[0], chain, configured };
}

function build(provider: typeof env.aiProvider, model: string): LanguageModel {
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey: env.anthropicKey })(model);
    case "google":
      return createGoogleGenerativeAI({ apiKey: env.googleAiKey })(model);
    case "openai":
      return createOpenAI({ apiKey: env.openaiKey })(model);
  }
}

/** Models to try in order, skipping ones that failed recently (unless all have). */
export function modelChain(): { id: string; model: LanguageModel }[] {
  const { provider, chain, configured } = aiInfo();
  if (!configured) return [];
  const now = Date.now();
  const healthy = chain.filter((m) => (cooldown.get(m) ?? 0) < now);
  return (healthy.length ? healthy : chain).map((id) => ({ id, model: build(provider, id) }));
}

export function markUnhealthy(modelId: string) {
  cooldown.set(modelId, Date.now() + COOLDOWN_MS);
}
