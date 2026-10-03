import "server-only";

// Centralised, typed access to configuration. Every value is optional so the
// app boots with zero env vars and reports what's missing instead of crashing.

const v = (key: string) => {
  // Strip inline "# comments" defensively (copied from .env.example).
  const value = process.env[key]?.replace(/(^|\s+)#.*$/, "").trim();
  return value ? value : undefined;
};

export const env = {
  appUrl: v("APP_URL") ?? "http://localhost:3000",
  sessionSecret: v("SESSION_SECRET") ?? "dev-only-insecure-secret-change-me",

  aiProvider: (v("AI_PROVIDER") ?? "anthropic") as "anthropic" | "google" | "openai",
  aiModel: v("AI_MODEL"),
  anthropicKey: v("ANTHROPIC_API_KEY"),
  googleAiKey: v("GOOGLE_GENERATIVE_AI_API_KEY"),
  openaiKey: v("OPENAI_API_KEY"),

  googleClientId: v("GOOGLE_CLIENT_ID"),
  googleClientSecret: v("GOOGLE_CLIENT_SECRET"),

  telegramToken: v("TELEGRAM_BOT_TOKEN"),
  telegramOwnerChatId: v("TELEGRAM_OWNER_CHAT_ID"),

  upstashUrl: v("UPSTASH_REDIS_REST_URL"),
  upstashToken: v("UPSTASH_REDIS_REST_TOKEN"),
};

export const googleConfigured = () => Boolean(env.googleClientId && env.googleClientSecret);
export const telegramConfigured = () => Boolean(env.telegramToken);
