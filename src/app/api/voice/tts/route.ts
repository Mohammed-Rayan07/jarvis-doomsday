import { budget, cached, speakable, synthesize } from "@/lib/voice/elevenlabs";
import { voiceConfigured } from "@/lib/env";
import { errors, JarvisError } from "@/lib/errors";
import { ok, route } from "@/lib/http";

export const dynamic = "force-dynamic";

const AUDIO_HEADERS = { "content-type": "audio/mpeg", "cache-control": "no-store" };

/** POST {text} → audio/mpeg stream (cache hit or live ElevenLabs stream). Errors → JSON envelope. */
export const POST = route(async (req: Request) => {
  if (!voiceConfigured()) throw errors.notConfigured("voice", ["ELEVENLABS_API_KEY"]);
  const { text: raw } = (await req.json().catch(() => ({}))) as { text?: string };
  const text = speakable(String(raw ?? ""));
  if (!text) throw new JarvisError("VALIDATION", "Nothing to say.");

  const hit = await cached(text);
  if (hit) return new Response(new Uint8Array(hit), { headers: { ...AUDIO_HEADERS, "x-jarvis-tts": "cache" } });

  const stream = await synthesize(text, req.signal);
  return new Response(stream, { headers: { ...AUDIO_HEADERS, "x-jarvis-tts": "live" } });
});

export const GET = route(async () => ok({ configured: voiceConfigured(), ...(await budget()) }));
