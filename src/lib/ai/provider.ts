import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { env } from "../env";

// BUILD_SPEC §7 — provider switch. Returns undefined when no key → backup brain.

const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-5-5",
  google: "gemini-flash-latest",
  openai: "gpt-4.1-mini",
} as const;

export function aiInfo() {
  const provider = env.aiProvider;
  const model = env.aiModel ?? DEFAULT_MODELS[provider];
  const configured =
    (provider === "anthropic" && !!env.anthropicKey) ||
    (provider === "google" && !!env.googleAiKey) ||
    (provider === "openai" && !!env.openaiKey);
  return { provider, model, configured };
}

export function languageModel() {
  const { provider, model, configured } = aiInfo();
  if (!configured) return undefined;
  switch (provider) {
    case "anthropic":
      return anthropic(model);
    case "google":
      return google(model);
    case "openai":
      return openai(model);
  }
}
