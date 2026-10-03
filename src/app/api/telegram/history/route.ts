import { COLLECTIONS, storage } from "@/lib/storage";
import { ok, route } from "@/lib/http";
import type { CommsEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const all = await storage().getAll<CommsEntry>(COLLECTIONS.comms);
  return ok(all.sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 100));
});
