import { nanoid } from "nanoid";
import { COLLECTIONS, storage } from "@/lib/storage";
import { ok, route } from "@/lib/http";
import type { ActionLogEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const all = await storage().getAll<ActionLogEntry>(COLLECTIONS.actions);
  return ok(all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200));
});

export const POST = route(async (req: Request) => {
  const entry = (await req.json()) as Omit<ActionLogEntry, "id" | "at">;
  return ok(await storage().put(COLLECTIONS.actions, { ...entry, id: `act_${nanoid(8)}`, at: new Date().toISOString() }));
});
