import { env } from "@/lib/env";
import { refreshUpcoming } from "@/lib/google/calendar";
import { warmDrive } from "@/lib/google/drive";

export const dynamic = "force-dynamic";

/**
 * Called the moment Tony starts speaking: opens (or refreshes) the keep-alive TLS connections to
 * ElevenLabs and Gemini so the reply doesn't pay a ~0.6 s handshake each, and refreshes the cached
 * calendar context the planner reads. Fire-and-forget, free.
 */
export async function POST() {
  const pings: Promise<unknown>[] = [];
  if (env.elevenKey) pings.push(fetch("https://api.elevenlabs.io/v1/models", { headers: { "xi-api-key": env.elevenKey } }).then((r) => r.arrayBuffer()));
  if (env.googleAiKey)
    pings.push(fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": env.googleAiKey } }).then((r) => r.arrayBuffer()));
  pings.push(refreshUpcoming()); // fresh planner context by the time Tony stops talking
  pings.push(warmDrive()); // folder paths for search results (cached 2 min)
  await Promise.allSettled(pings);
  return new Response(null, { status: 204 });
}
