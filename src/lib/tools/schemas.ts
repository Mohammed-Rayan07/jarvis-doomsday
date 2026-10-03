import { z } from "zod";
import type { PreviewTab, ToolName } from "../types";

// Per-tool argument schemas + metadata. Shared by the planner prompt (catalogue),
// /api/execute (validation) and the client executor (confirmation policy).
// See BUILD_SPEC.md §4.

const iso = z.string().describe("ISO 8601 datetime with offset, e.g. 2026-10-04T17:00:00+05:30");

export const toolSchemas = {
  "calendar.create_event": z.object({
    title: z.string().min(1),
    start: iso,
    end: iso.optional(),
    durationMinutes: z.number().int().positive().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    attendees: z.array(z.string().email()).optional(),
  }),
  "calendar.list_events": z.object({ from: iso, to: iso, query: z.string().optional() }),
  "calendar.update_event": z.object({
    eventId: z.string().min(1),
    title: z.string().optional(),
    start: iso.optional(),
    end: iso.optional(),
    description: z.string().optional(),
  }),
  "calendar.delete_event": z.object({ eventId: z.string().min(1) }),

  "reminders.create": z.object({
    text: z.string().min(1),
    dueAt: iso,
    notifyTelegram: z.boolean().optional(),
  }),
  "reminders.list": z.object({
    range: z.enum(["today", "tomorrow", "upcoming", "overdue", "all"]).default("upcoming"),
  }),
  "reminders.complete": z.object({ id: z.string().min(1) }),
  "reminders.snooze": z.object({ id: z.string().min(1), until: iso }),
  "reminders.delete": z.object({ id: z.string().min(1) }),

  "drive.upload": z.object({
    folderId: z.string().optional(),
    folderName: z.string().optional(),
    createFolder: z.boolean().optional(),
    fileHint: z.string().optional(),
  }),
  "drive.search": z.object({ query: z.string().min(1), mimeType: z.string().optional() }),
  "drive.list_folder": z.object({ folderId: z.string().optional() }),
  "drive.create_folder": z.object({ name: z.string().min(1), parentId: z.string().optional() }),

  "telegram.send": z.object({ recipient: z.string().min(1), text: z.string().min(1) }),
  "telegram.list_contacts": z.object({}),
  "comms.history": z.object({ limit: z.number().int().positive().optional() }),
  "system.status": z.object({}),
} satisfies Record<ToolName, z.ZodType>;

export type ToolArgs<T extends ToolName> = z.infer<(typeof toolSchemas)[T]>;

export interface ToolMeta {
  description: string;
  consequential: boolean; // requires ConfirmCard unless auto-approved
  danger?: boolean; // destructive — always confirm, red styling
  interactive?: boolean; // executor renders UI instead of calling /api/execute directly
  previewTab?: PreviewTab;
}

export const toolMeta: Record<ToolName, ToolMeta> = {
  "calendar.create_event": { description: "Create a Google Calendar event", consequential: true, previewTab: "calendar" },
  "calendar.list_events": { description: "List calendar events in a time range", consequential: false, previewTab: "calendar" },
  "calendar.update_event": { description: "Reschedule / rename / edit an existing event", consequential: true, previewTab: "calendar" },
  "calendar.delete_event": { description: "Delete a calendar event", consequential: true, danger: true, previewTab: "calendar" },
  "reminders.create": { description: "Create a personal reminder (not a calendar event)", consequential: false, previewTab: "reminders" },
  "reminders.list": { description: "List personal reminders", consequential: false, previewTab: "reminders" },
  "reminders.complete": { description: "Mark a reminder done", consequential: false, previewTab: "reminders" },
  "reminders.snooze": { description: "Push a reminder to a later time", consequential: false, previewTab: "reminders" },
  "reminders.delete": { description: "Delete a reminder", consequential: true, danger: true, previewTab: "reminders" },
  "drive.upload": { description: "Upload a file from Tony's device to Google Drive (opens upload panel)", consequential: true, interactive: true, previewTab: "drive" },
  "drive.search": { description: "Search Google Drive for files", consequential: false, previewTab: "drive" },
  "drive.list_folder": { description: "List a Drive folder's contents", consequential: false, previewTab: "drive" },
  "drive.create_folder": { description: "Create a Drive folder", consequential: true, previewTab: "drive" },
  "telegram.send": { description: "Send a Telegram message to a contact or group", consequential: true, previewTab: "comms" },
  "telegram.list_contacts": { description: "List known Telegram contacts", consequential: false, previewTab: "comms" },
  "comms.history": { description: "Show recent communications sent by JARVIS", consequential: false, previewTab: "comms" },
  "system.status": { description: "Report integration health", consequential: false },
};
