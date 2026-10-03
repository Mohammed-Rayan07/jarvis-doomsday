import { listEvents } from "@/lib/google/calendar";
import { ok, route } from "@/lib/http";

export const dynamic = "force-dynamic";

// Preview pane feed: GET ?from&to (defaults: now → +7 days). BUILD_SPEC §6.
export const GET = route(async (req: Request) => {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString();
  const to = url.searchParams.get("to") ?? new Date(Date.now() + 7 * 86_400_000).toISOString();
  return ok(await listEvents({ from, to }));
});
