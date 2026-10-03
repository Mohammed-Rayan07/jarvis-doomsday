import "server-only";
import { calendar, type calendar_v3 } from "@googleapis/calendar";
import type { CalendarEvent } from "../types";
import type { ToolArgs } from "../tools/schemas";
import { errors, JarvisError } from "../errors";
import { getGoogleClient, mapGoogleError } from "./auth";

// BUILD_SPEC §8.2

async function api() {
  return calendar({ version: "v3", auth: await getGoogleClient() });
}

function toEvent(e: calendar_v3.Schema$Event): CalendarEvent {
  const allDay = Boolean(e.start?.date && !e.start?.dateTime);
  return {
    id: e.id!,
    title: e.summary ?? "(untitled)",
    start: e.start?.dateTime ?? `${e.start?.date}T00:00:00`,
    end: e.end?.dateTime ?? `${e.end?.date}T00:00:00`,
    allDay,
    description: e.description ?? undefined,
    location: e.location ?? undefined,
    htmlLink: e.htmlLink ?? undefined,
  };
}

async function call<T>(fn: () => Promise<T>, what: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const mapped = mapGoogleError(err);
    if (mapped instanceof JarvisError) throw mapped;
    const e = err as { message?: string; status?: number; code?: number };
    if (e.status === 404 || e.code === 404) throw new JarvisError("NOT_FOUND", `I couldn't find that event, sir.`, { integration: "google" });
    if (e.status === 403 || e.code === 403)
      throw new JarvisError("PERMISSION_DENIED", `Google refused to let me ${what}. Reconnect and grant Calendar access, sir.`, {
        integration: "google",
        fix: { label: "Reconnect Google", href: "/api/auth/google", action: "reconnect_google" },
      });
    throw new JarvisError("UPSTREAM_ERROR", `I couldn't ${what}: ${e.message ?? "Google Calendar error"}.`, { integration: "google" });
  }
}

export async function createEvent(args: ToolArgs<"calendar.create_event">, tz: string): Promise<CalendarEvent> {
  const start = new Date(args.start);
  if (Number.isNaN(start.getTime())) throw errors.missingField("start time", "When should the event start, sir?");
  const end = args.end ? new Date(args.end) : new Date(start.getTime() + (args.durationMinutes ?? 60) * 60_000);
  if (end <= start) throw new JarvisError("VALIDATION", "The event would end before it starts, sir.");

  const cal = await api();
  const res = await call(
    () =>
      cal.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: args.title,
          description: args.description ? `${args.description}\n\n— scheduled by J.A.R.V.I.S.` : "Scheduled by J.A.R.V.I.S.",
          location: args.location,
          start: { dateTime: start.toISOString(), timeZone: tz },
          end: { dateTime: end.toISOString(), timeZone: tz },
          attendees: args.attendees?.map((email) => ({ email })),
          reminders: { useDefault: true },
        },
      }),
    "create the event",
  );
  return toEvent(res.data);
}

export async function listEvents(args: ToolArgs<"calendar.list_events">): Promise<CalendarEvent[]> {
  const cal = await api();
  const res = await call(
    () =>
      cal.events.list({
        calendarId: "primary",
        timeMin: new Date(args.from).toISOString(),
        timeMax: new Date(args.to).toISOString(),
        q: args.query,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 50,
      }),
    "read your calendar",
  );
  return (res.data.items ?? []).filter((e) => e.status !== "cancelled").map(toEvent);
}

export async function updateEvent(args: ToolArgs<"calendar.update_event">, tz: string): Promise<CalendarEvent> {
  const cal = await api();
  const patch: calendar_v3.Schema$Event = {};
  if (args.title) patch.summary = args.title;
  if (args.description) patch.description = args.description;
  if (args.start) {
    // keep the original duration when only the start moves
    const current = await call(() => cal.events.get({ calendarId: "primary", eventId: args.eventId }), "find the event");
    const s = new Date(args.start);
    const oldStart = new Date(current.data.start?.dateTime ?? current.data.start?.date ?? args.start);
    const oldEnd = new Date(current.data.end?.dateTime ?? current.data.end?.date ?? args.start);
    const e = args.end ? new Date(args.end) : new Date(s.getTime() + Math.max(oldEnd.getTime() - oldStart.getTime(), 30 * 60_000));
    patch.start = { dateTime: s.toISOString(), timeZone: tz };
    patch.end = { dateTime: e.toISOString(), timeZone: tz };
  } else if (args.end) {
    patch.end = { dateTime: new Date(args.end).toISOString(), timeZone: tz };
  }
  const res = await call(() => cal.events.patch({ calendarId: "primary", eventId: args.eventId, requestBody: patch }), "update the event");
  return toEvent(res.data);
}

export async function deleteEvent(args: ToolArgs<"calendar.delete_event">): Promise<void> {
  const cal = await api();
  await call(() => cal.events.delete({ calendarId: "primary", eventId: args.eventId }), "delete the event");
}
