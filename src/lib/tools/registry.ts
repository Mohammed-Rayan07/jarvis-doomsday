import "server-only";
import type { ToolName, ToolResult } from "../types";
import { toolSchemas, type ToolArgs } from "./schemas";
import { failure, JarvisError } from "../errors";
import * as calendar from "../google/calendar";
import * as drive from "../google/drive";
import * as reminders from "../reminders/service";
import * as telegram from "../telegram/bot";
import { COLLECTIONS, storage } from "../storage";
import { formatInTz } from "../time";
import type { CommsEntry } from "../types";

// Server-side tool dispatch for /api/execute. BUILD_SPEC §4.

interface Ctx {
  tz: string;
  commandId?: string;
}

type Handler<T extends ToolName> = (args: ToolArgs<T>, ctx: Ctx) => Promise<ToolResult>;

const handlers: { [T in ToolName]: Handler<T> } = {
  "calendar.create_event": async (args, { tz }) => {
    const ev = await calendar.createEvent(args, tz);
    return {
      ok: true,
      data: ev,
      message: `"${ev.title}" is on your calendar for ${formatInTz(ev.start, tz)}, sir.`,
      preview: { tab: "calendar", highlightId: ev.id },
    };
  },
  "calendar.list_events": async (args, { tz }) => {
    const events = await calendar.listEvents(args);
    return {
      ok: true,
      data: events,
      message: events.length
        ? `You have ${events.length} event${events.length > 1 ? "s" : ""}: ${events.map((e) => `${e.title} (${formatInTz(e.start, tz)})`).join("; ")}.`
        : "Your calendar is clear for that period, sir.",
      preview: { tab: "calendar" },
    };
  },
  "calendar.update_event": async (args, { tz }) => {
    const ev = await calendar.updateEvent(args, tz);
    return { ok: true, data: ev, message: `Updated "${ev.title}", sir.`, preview: { tab: "calendar", highlightId: ev.id } };
  },
  "calendar.delete_event": async (args) => {
    await calendar.deleteEvent(args);
    return { ok: true, message: "Event removed from your calendar, sir.", preview: { tab: "calendar" } };
  },

  "reminders.create": async (args, { tz, commandId }) => {
    const r = await reminders.createReminder({ ...args, commandId });
    return {
      ok: true,
      data: r,
      message: `I'll remind you to ${r.text} at ${formatInTz(r.dueAt, tz)}, sir.`,
      preview: { tab: "reminders", highlightId: r.id },
    };
  },
  "reminders.list": async (args, { tz }) => {
    const list = await reminders.listReminders(args.range, tz);
    return {
      ok: true,
      data: list,
      message: list.length
        ? `${list.length} reminder${list.length > 1 ? "s" : ""}: ${list.map((r) => `${r.text} (${formatInTz(r.dueAt, tz)})`).join("; ")}.`
        : "No reminders for that period, sir.",
      preview: { tab: "reminders" },
    };
  },
  "reminders.complete": async ({ id }) => {
    const r = await reminders.updateReminder(id, { status: "done" });
    return { ok: true, data: r, message: `Marked "${r.text}" as done.`, preview: { tab: "reminders", highlightId: r.id } };
  },
  "reminders.snooze": async ({ id, until }, { tz }) => {
    const r = await reminders.updateReminder(id, { dueAt: new Date(until).toISOString(), firedAt: undefined });
    return { ok: true, data: r, message: `Snoozed until ${formatInTz(r.dueAt, tz)}.`, preview: { tab: "reminders", highlightId: r.id } };
  },
  "reminders.delete": async ({ id }) => {
    await reminders.deleteReminder(id);
    return { ok: true, message: "Reminder deleted, sir.", preview: { tab: "reminders" } };
  },

  "drive.upload": async () => {
    // Interactive: the client UploadCard performs the upload; this should never be hit.
    throw new JarvisError("VALIDATION", "Uploads are handled by the upload panel.");
  },
  "drive.search": async ({ query, mimeType }) => {
    const files = await drive.searchFiles(query, mimeType);
    return {
      ok: true,
      data: files,
      message: files.length
        ? `Found ${files.length} match${files.length > 1 ? "es" : ""} in the Stark Archive. Top hit: "${files[0].name}" (${files[0].typeLabel}) in ${files[0].folderPath}.`
        : `Nothing in the archive matches "${query}", sir.`,
      preview: { tab: "drive", mode: "search", query },
    };
  },
  "drive.list_folder": async ({ folderId }) => {
    const { folder, items } = await drive.listFolder(folderId);
    return { ok: true, data: items, message: `${folder.path} holds ${items.length} item${items.length === 1 ? "" : "s"}, sir.`, preview: { tab: "drive", folderId: folder.id } };
  },
  "drive.create_folder": async ({ name, parentId }) => {
    const f = await drive.createFolder(name, parentId);
    return { ok: true, data: f, message: `Folder "${f.name}" created at ${f.folderPath}, sir.`, preview: { tab: "drive", highlightId: f.id, folderId: f.parentId } };
  },

  "telegram.send": async ({ recipient, text }, { commandId }) => {
    const entry = await telegram.sendMessage(recipient, text, commandId);
    return { ok: true, data: entry, message: `Message delivered to ${entry.recipientName}, sir.`, preview: { tab: "comms", highlightId: entry.id } };
  },
  "telegram.list_contacts": async () => {
    const contacts = await telegram.syncContacts();
    return { ok: true, data: contacts, message: `${contacts.length} contacts on the comms grid.`, preview: { tab: "comms" } };
  },
  "comms.history": async ({ limit }) => {
    const all = await storage().getAll<CommsEntry>(COLLECTIONS.comms);
    const recent = all.sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, limit ?? 10);
    return { ok: true, data: recent, message: `Showing the last ${recent.length} transmissions.`, preview: { tab: "comms" } };
  },
  "system.status": async () => ({ ok: true, message: "All systems reporting, sir." }),
};

// Plain-English prompts for missing/invalid fields (BUILD_SPEC 5.2 "required field missing").
const FIELD_QUESTIONS: Record<string, string> = {
  title: "What should I call the event, sir?",
  start: "I need a valid start date and time for that event, sir.",
  end: "That end time doesn't look right, sir.",
  attendees: "One of those attendee emails isn't valid, sir.",
  eventId: "Which event do you mean, sir?",
  text: "What should the message say, sir?",
  recipient: "Who should receive it, sir?",
  dueAt: "When should I remind you, sir?",
  until: "Until when should I snooze it, sir?",
  id: "Which item do you mean, sir?",
  query: "What should I search the archive for, sir?",
  name: "What should the folder be called, sir?",
};

export async function executeTool(tool: ToolName, rawArgs: unknown, ctx: Ctx): Promise<ToolResult> {
  const schema = toolSchemas[tool];
  if (!schema) return failure(new JarvisError("VALIDATION", `Unknown tool ${tool}`));
  const parsed = schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    return failure(
      new JarvisError("MISSING_FIELD", FIELD_QUESTIONS[field] ?? `Something's missing for that request (${field || "input"}), sir.`, {
        details: { field, issues: parsed.error.issues },
      }),
    );
  }
  try {
    return await (handlers[tool] as Handler<ToolName>)(parsed.data as never, ctx);
  } catch (err) {
    return failure(err);
  }
}
