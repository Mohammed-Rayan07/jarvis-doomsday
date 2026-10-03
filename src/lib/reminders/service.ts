import "server-only";
import { nanoid } from "nanoid";
import { COLLECTIONS, storage } from "../storage";
import { errors, JarvisError } from "../errors";
import type { Reminder } from "../types";
import { dayRange } from "../time";

// BUILD_SPEC §8.5

export type ReminderRange = "today" | "tomorrow" | "upcoming" | "overdue" | "all";

export async function listReminders(range: ReminderRange = "upcoming", tz = "UTC"): Promise<Reminder[]> {
  const all = await storage().getAll<Reminder>(COLLECTIONS.reminders);
  const now = Date.now();
  const sorted = all.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  switch (range) {
    case "all":
      return sorted;
    case "overdue":
      return sorted.filter((r) => r.status === "active" && Date.parse(r.dueAt) < now);
    case "upcoming":
      return sorted.filter((r) => r.status === "active");
    case "today":
    case "tomorrow": {
      const [from, to] = dayRange(range === "today" ? 0 : 1, tz);
      return sorted.filter((r) => {
        const t = Date.parse(r.dueAt);
        return t >= from.getTime() && t < to.getTime();
      });
    }
  }
}

export async function dueReminders(): Promise<Reminder[]> {
  const all = await storage().getAll<Reminder>(COLLECTIONS.reminders);
  const now = Date.now();
  return all.filter((r) => r.status === "active" && !r.firedAt && Date.parse(r.dueAt) <= now);
}

export async function createReminder(input: {
  text: string;
  dueAt: string;
  notifyTelegram?: boolean;
  source?: Reminder["source"];
  commandId?: string;
}): Promise<Reminder> {
  if (Number.isNaN(Date.parse(input.dueAt))) throw errors.missingField("time", "When should I remind you, sir?");
  const reminder: Reminder = {
    id: `rem_${nanoid(8)}`,
    text: input.text,
    dueAt: new Date(input.dueAt).toISOString(),
    createdAt: new Date().toISOString(),
    status: "active",
    notifyTelegram: input.notifyTelegram ?? false,
    source: input.source ?? "jarvis",
    commandId: input.commandId,
  };
  return storage().put(COLLECTIONS.reminders, reminder);
}

export async function updateReminder(id: string, patch: Partial<Reminder>): Promise<Reminder> {
  const existing = await storage().get<Reminder>(COLLECTIONS.reminders, id);
  if (!existing) throw new JarvisError("NOT_FOUND", "I can't find that reminder, sir.");
  return storage().put(COLLECTIONS.reminders, { ...existing, ...patch, id });
}

export async function deleteReminder(id: string): Promise<void> {
  await storage().remove(COLLECTIONS.reminders, id);
}
