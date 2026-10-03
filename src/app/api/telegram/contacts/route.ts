import { COLLECTIONS, storage } from "@/lib/storage";
import { getMe, listContacts, ownerChatId, setOwner } from "@/lib/telegram/bot";
import { ok, route } from "@/lib/http";
import { JarvisError } from "@/lib/errors";
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const [contacts, owner, me] = await Promise.all([listContacts(), ownerChatId(), getMe().catch(() => undefined)]);
  return ok({ contacts, ownerChatId: owner, botUsername: me?.username });
});

// PATCH { id, aliases?, owner? } — edit aliases (e.g. map "team" → group chat) or mark as Tony's own chat.
export const PATCH = route(async (req: Request) => {
  const { id, aliases, owner } = (await req.json()) as { id: string; aliases?: string[]; owner?: boolean };
  const contact = await storage().get<Contact>(COLLECTIONS.contacts, id);
  if (!contact) throw new JarvisError("NOT_FOUND", "Unknown contact.");
  if (owner) await setOwner(contact.chatId);
  if (!aliases) return ok(contact);
  return ok(
    await storage().put(COLLECTIONS.contacts, {
      ...contact,
      aliases: aliases.map((a) => a.toLowerCase().trim()).filter(Boolean),
    }),
  );
});
