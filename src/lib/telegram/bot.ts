import "server-only";
import { nanoid } from "nanoid";
import { env, telegramConfigured } from "../env";
import { errors, JarvisError } from "../errors";
import { COLLECTIONS, storage } from "../storage";
import type { CommsEntry, Contact } from "../types";

// BUILD_SPEC §8.4 — Telegram Bot API over fetch. Contacts are learned from getUpdates
// (anyone who pressed Start / messaged the bot, and groups the bot was added to).

const api = (method: string) => `https://api.telegram.org/bot${env.telegramToken}/${method}`;

export async function tg<T>(method: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  if (!telegramConfigured()) throw errors.notConfigured("telegram", ["TELEGRAM_BOT_TOKEN"]);
  let res: Response;
  try {
    res = await fetch(api(method), {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
      cache: "no-store",
    });
  } catch (err) {
    throw new JarvisError("NETWORK", "I can't reach Telegram's servers, sir.", { integration: "telegram", details: String(err) });
  }
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: T;
    description?: string;
    error_code?: number;
    parameters?: { retry_after?: number };
  };
  if (!json.ok) {
    const d = json.description ?? res.statusText;
    if (json.error_code === 401) throw new JarvisError("NOT_CONFIGURED", "Telegram rejected my bot token, sir. Check TELEGRAM_BOT_TOKEN.", { integration: "telegram" });
    if (json.error_code === 429)
      throw new JarvisError("RATE_LIMITED", `Telegram is rate-limiting me. Retry in ${json.parameters?.retry_after ?? "a few"} seconds, sir.`, { integration: "telegram" });
    if (/chat not found/i.test(d))
      throw new JarvisError("PERMISSION_DENIED", "Telegram won't let me message that chat — they need to press Start on the bot first, sir.", {
        integration: "telegram",
        fix: { label: "Copy bot invite link", href: await inviteLink(), action: "sync_telegram" },
      });
    if (/blocked by the user|user is deactivated|kicked/i.test(d))
      throw new JarvisError("PERMISSION_DENIED", "That contact has blocked the bot or removed it, sir.", { integration: "telegram" });
    throw new JarvisError("UPSTREAM_ERROR", `Telegram says: ${d}`, { integration: "telegram", details: json });
  }
  return json.result as T;
}

let meCache: { username: string; first_name: string } | undefined;
export async function getMe(): Promise<{ username: string; first_name: string }> {
  if (!meCache) meCache = await tg<{ username: string; first_name: string }>("getMe");
  return meCache;
}

async function inviteLink() {
  try {
    return `https://t.me/${(await getMe()).username}`;
  } catch {
    return "https://t.me/";
  }
}

// ── contacts ──────────────────────────────────────────────────────────

interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}
interface TgUpdate {
  update_id: number;
  message?: { chat: TgChat; text?: string; from?: { first_name?: string } };
  edited_message?: { chat: TgChat };
  channel_post?: { chat: TgChat };
  my_chat_member?: { chat: TgChat; new_chat_member?: { status?: string } };
}

const TEAM_WORDS = /team|stark|squad|avengers|crew|gang/i;

function contactFromChat(chat: TgChat, existing?: Contact): Contact {
  const name =
    chat.type === "private" ? [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || `User ${chat.id}` : chat.title ?? `Group ${chat.id}`;
  const auto = new Set<string>(existing?.aliases ?? []);
  if (chat.type === "private") {
    if (chat.first_name) auto.add(chat.first_name.toLowerCase());
    if (chat.username) auto.add(chat.username.toLowerCase());
  } else {
    auto.add(name.toLowerCase());
    if (TEAM_WORDS.test(name)) auto.add("team");
  }
  return {
    id: `tg_${chat.id}`,
    chatId: chat.id,
    name,
    aliases: [...auto],
    type: chat.type,
    username: chat.username,
    lastSeenAt: new Date().toISOString(),
  };
}

export async function listContacts(): Promise<Contact[]> {
  return storage().getAll<Contact>(COLLECTIONS.contacts);
}

/** Pull new updates from Telegram and upsert every chat we see as a contact. */
export async function syncContacts(): Promise<Contact[]> {
  const offset = (await storage().getMeta<number>("telegram.offset")) ?? 0;
  const updates = await tg<TgUpdate[]>("getUpdates", {
    offset: offset + 1,
    timeout: 0,
    allowed_updates: ["message", "edited_message", "channel_post", "my_chat_member"],
  });
  const existing = new Map((await listContacts()).map((c) => [c.chatId, c]));
  const greeted = new Set<number>();
  let maxId = offset;

  for (const u of updates) {
    maxId = Math.max(maxId, u.update_id);
    const chat = u.message?.chat ?? u.edited_message?.chat ?? u.channel_post?.chat ?? u.my_chat_member?.chat;
    if (!chat) continue;
    const removed = u.my_chat_member?.new_chat_member?.status === "left" || u.my_chat_member?.new_chat_member?.status === "kicked";
    if (removed) {
      await storage().remove(COLLECTIONS.contacts, `tg_${chat.id}`);
      existing.delete(chat.id);
      continue;
    }
    const isNew = !existing.has(chat.id);
    const contact = contactFromChat(chat, existing.get(chat.id));
    existing.set(chat.id, contact);
    await storage().put(COLLECTIONS.contacts, contact);
    if (isNew && /^\/start/.test(u.message?.text ?? "") && !greeted.has(chat.id)) {
      greeted.add(chat.id);
      void tg("sendMessage", {
        chat_id: chat.id,
        text: `J.A.R.V.I.S. online. You're registered on Mr. Stark's comms grid as "${contact.name}".`,
      }).catch(() => undefined);
    }
  }
  if (maxId > offset) await storage().setMeta("telegram.offset", maxId);
  return [...existing.values()];
}

function match(recipient: string, contacts: Contact[]): Contact[] {
  const q = recipient.toLowerCase().replace(/^@/, "").trim();
  const exact = contacts.filter((c) => c.name.toLowerCase() === q || c.aliases.includes(q) || c.username?.toLowerCase() === q);
  if (exact.length) return exact;
  const first = q.split(/\s+/)[0];
  return contacts.filter((c) => c.name.toLowerCase().split(/\s+/)[0] === first || c.name.toLowerCase().includes(q));
}

export async function resolveContact(recipient: string): Promise<Contact> {
  let candidates = match(recipient, await listContacts());
  if (!candidates.length) candidates = match(recipient, await syncContacts().catch(() => listContacts()));
  if (candidates.length === 1) return candidates[0];

  const all = await listContacts();
  if (candidates.length > 1)
    throw new JarvisError("AMBIGUOUS", `"${recipient}" matches ${candidates.map((c) => c.name).join(", ")}. Which one, sir?`, {
      integration: "telegram",
      details: { options: candidates.map((c) => c.name) },
    });
  throw new JarvisError(
    "NOT_FOUND",
    all.length
      ? `${recipient} isn't on my comms grid, sir. Known contacts: ${all.map((c) => c.name).join(", ")}. They can join via ${await inviteLink()}.`
      : `No Telegram contacts yet, sir. Ask ${recipient} to press Start on ${await inviteLink()}.`,
    { integration: "telegram", fix: { label: "Bot invite link", href: await inviteLink(), action: "sync_telegram" }, details: { options: all.map((c) => c.name) } },
  );
}

// ── messaging ─────────────────────────────────────────────────────────

const summarise = (text: string) => (text.length > 80 ? `${text.slice(0, 77)}…` : text);

async function logComms(entry: Omit<CommsEntry, "id" | "sentAt" | "channel" | "summary">) {
  return storage().put<CommsEntry>(COLLECTIONS.comms, {
    ...entry,
    id: `msg_${nanoid(8)}`,
    channel: "telegram",
    summary: summarise(entry.text),
    sentAt: new Date().toISOString(),
  });
}

export async function sendMessage(recipient: string, text: string, commandId?: string): Promise<CommsEntry> {
  if (!text.trim()) throw errors.missingField("message", `What should I tell ${recipient}, sir?`);
  let contact: Contact;
  try {
    contact = await resolveContact(recipient);
  } catch (err) {
    await logComms({ recipientName: recipient, text, status: "failed", error: err instanceof Error ? err.message : String(err), commandId });
    throw err;
  }
  try {
    const sent = await tg<{ message_id: number }>("sendMessage", { chat_id: contact.chatId, text });
    return logComms({ recipientName: contact.name, chatId: contact.chatId, text, status: "sent", telegramMessageId: sent.message_id, commandId });
  } catch (err) {
    await logComms({ recipientName: contact.name, chatId: contact.chatId, text, status: "failed", error: err instanceof Error ? err.message : String(err), commandId });
    throw err;
  }
}

/** Tony's own chat, for reminder pings: env override, else the contact marked as owner. */
export async function ownerChatId(): Promise<number | undefined> {
  if (env.telegramOwnerChatId && /^-?\d+$/.test(env.telegramOwnerChatId)) return Number(env.telegramOwnerChatId);
  return storage().getMeta<number>("telegram.owner");
}

export async function setOwner(chatId: number) {
  await storage().setMeta("telegram.owner", chatId);
}
