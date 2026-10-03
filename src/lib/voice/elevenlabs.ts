import "server-only";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../env";
import { JarvisError } from "../errors";
import { storage } from "../storage";
import { DATA_DIR } from "../storage/json";

// JARVIS's voice: ElevenLabs streaming TTS, proxied so the key never reaches the browser.
//  - disk cache keyed by (voice, model, text): stock lines ("Right away, sir.") cost nothing after the first take
//  - character budget persisted in _meta: the free tier can't report its own quota (key lacks user_read)
//  - library voices are paid-only; on `free_users_not_allowed` fall back to a premade British voice for good

/** Premade voices are available on every tier. Daniel = deep British broadcaster; George = warm British. */
const PREMADE = { daniel: "onwK4e9ZLuTAKqWW03F9", george: "JBFqnCBsd6RMkjVDRZzb" };
const MAX_CHARS = 420;
const CACHE_DIR = path.join(DATA_DIR, "tts");
const META_KEY = "voice.charsUsed";

let voiceOverride: string | undefined;

export const voiceId = () => voiceOverride ?? env.elevenVoice ?? PREMADE.daniel;

const MONTHS: Record<string, string> = { Jan: "January", Feb: "February", Mar: "March", Apr: "April", Jun: "June", Jul: "July", Aug: "August", Sep: "September", Sept: "September", Oct: "October", Nov: "November", Dec: "December" };
const DAYS: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

/** Turn chat text into something that sounds right out loud, and cap it. */
export function speakable(raw: string) {
  let t = raw
    .replace(/J\.A\.R\.V\.I\.S\.?/g, "Jarvis")
    .replace(/https?:\/\/\S+/g, "the link")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[“”"«»*_`#>]/g, "")
    .replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/g, (_, d: string) => `${DAYS[d]},`)
    .replace(/\b(\d{1,2}) (Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\b/g, (_, n: string, m: string) => `${n} ${MONTHS[m]}`)
    .replace(/(\d)\s?(am|pm)\b/gi, (_, d: string, ap: string) => `${d} ${ap.toUpperCase()}`)
    .replace(/:00 /g, " ")
    .replace(/\s*·\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (t.length > MAX_CHARS) {
    const cut = t.slice(0, MAX_CHARS);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf("? "));
    t = (end > 120 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "")) + " The rest is on screen, sir.";
  }
  return t;
}

const cacheFile = (text: string) =>
  path.join(CACHE_DIR, `${createHash("sha256").update(`${voiceId()}|${env.elevenModel}|${text}`).digest("hex").slice(0, 32)}.mp3`);

export async function cached(text: string) {
  try {
    return await fs.readFile(cacheFile(text));
  } catch {
    return undefined;
  }
}

export async function budget() {
  const used = (await storage().getMeta<number>(META_KEY)) ?? 0;
  return { used, limit: env.elevenBudget, left: Math.max(0, env.elevenBudget - used) };
}

/** Stream speech for `text`. Returns a body that is also tee'd into the cache. */
export async function synthesize(text: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  if (!env.elevenKey) throw new JarvisError("NOT_CONFIGURED", "ElevenLabs isn't configured (ELEVENLABS_API_KEY).");
  const { left } = await budget();
  if (text.length > left) throw new JarvisError("RATE_LIMITED", "Voice budget spent — switching to backup voice.", { details: { reason: "budget" } });

  let res = await request(text, signal);
  if (res.status === 400 || res.status === 402) {
    const body = await res.text();
    if (/free_users_not_allowed|paid_plan_required|creator tier/i.test(body) && voiceId() !== PREMADE.daniel) {
      voiceOverride = PREMADE.daniel; // remembered: don't pay a failed round-trip on every line
      console.warn("[voice] configured voice needs a paid ElevenLabs plan — using premade 'Daniel'");
      res = await request(text, signal);
    } else {
      throw upstream(res.status, body);
    }
  }
  if (!res.ok || !res.body) throw upstream(res.status, await res.text().catch(() => ""));

  await storage().setMeta(META_KEY, ((await storage().getMeta<number>(META_KEY)) ?? 0) + text.length);

  const [toClient, toCache] = res.body.tee();
  void persist(text, toCache);
  return toClient;
}

function request(text: string, signal?: AbortSignal) {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId()}/stream?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": env.elevenKey!, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: env.elevenModel,
      // Measured, dry, slightly brisk — butler, not narrator.
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 1.04 },
    }),
    signal,
  });
}

async function persist(text: string, stream: ReadableStream<Uint8Array>) {
  try {
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const file = cacheFile(text);
    await fs.writeFile(`${file}.tmp`, Buffer.concat(chunks));
    await fs.rename(`${file}.tmp`, file);
  } catch {
    /* aborted mid-stream or read-only fs — just don't cache */
  }
}

function upstream(status: number, body: string) {
  const quota = /quota|credits|limit/i.test(body);
  if (status === 401 && !quota) return new JarvisError("NOT_CONFIGURED", "ElevenLabs rejected the API key.", { details: { status } });
  if (status === 429 || quota) return new JarvisError("RATE_LIMITED", "ElevenLabs is rate-limiting or out of credits.", { details: { status } });
  return new JarvisError("UPSTREAM_ERROR", `ElevenLabs error ${status}.`, { details: { status, body: body.slice(0, 200) } });
}
