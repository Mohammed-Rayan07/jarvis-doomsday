import { COLLECTIONS, storage } from "@/lib/storage";
import { ok, route } from "@/lib/http";
import { JarvisError } from "@/lib/errors";
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = route(async () => ok(await storage().getAll<Contact>(COLLECTIONS.contacts)));

// PATCH { id, aliases } — edit aliases (e.g. map "team" → group chat).
export const PATCH = route(async (req: Request) => {
  const { id, aliases } = (await req.json()) as { id: string; aliases: string[] };
  const contact = await storage().get<Contact>(COLLECTIONS.contacts, id);
  if (!contact) throw new JarvisError("NOT_FOUND", "Unknown contact.");
  return ok(await storage().put(COLLECTIONS.contacts, { ...contact, aliases: aliases.map((a) => a.toLowerCase().trim()).filter(Boolean) }));
});
