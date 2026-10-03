import { aiInfo } from "@/lib/ai/provider";
import { googleConfigured, telegramConfigured, voiceConfigured } from "@/lib/env";
import { budget } from "@/lib/voice/elevenlabs";
import { getMe } from "@/lib/telegram/bot";
import { readGoogleSession } from "@/lib/session";
import { storage } from "@/lib/storage";
import { ok } from "@/lib/http";
import type { SystemStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const ai = aiInfo();
  const session = googleConfigured() ? await readGoogleSession() : undefined;

  let telegram: SystemStatus["telegram"] = { configured: telegramConfigured(), ok: false };
  if (telegram.configured) {
    try {
      const me = await getMe();
      telegram = { ...telegram, ok: true, botUsername: me.username };
    } catch (err) {
      telegram = { ...telegram, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const status: SystemStatus = {
    ai: { configured: ai.configured, provider: ai.provider, model: ai.model, mode: ai.configured ? "llm" : "backup" },
    google: {
      configured: googleConfigured(),
      connected: Boolean(session?.refresh_token || session?.access_token),
      email: session?.email,
    },
    telegram,
    storage: { adapter: storage().kind },
    voice: voiceConfigured() ? { provider: "elevenlabs", budgetLeft: (await budget()).left } : { provider: "browser" },
  };
  return ok(status);
}
