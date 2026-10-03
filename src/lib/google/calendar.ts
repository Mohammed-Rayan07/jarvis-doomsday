import "server-only";
import { calendar, type calendar_v3 } from "@googleapis/calendar";
import type { CalendarEvent } from "../types";
import type { ToolArgs } from "../tools/schemas";
import { errors, JarvisError } from "../errors";
import { after } from "next/server";
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
  const ev = toEvent(res.data);
  patchCache((list) => [...list, ev].sort((a, b) => a.start.localeCompare(b.start)));
  return ev;
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
  const ev = toEvent(res.data);
  patchCache((list) => list.map((e) => (e.id === ev.id ? ev : e)));
  return ev;
}

export async function deleteEvent(args: ToolArgs<"calendar.delete_event">): Promise<void> {
  const cal = await api();
  await call(() => cal.events.delete({ calendarId: "primary", eventId: args.eventId }), "delete the event");
  patchCache((list) => list.filter((e) => e.id !== args.eventId));
}

/* ── Planner context cache ───────────────────────────────────────────────────
 * Every plan needs "upcoming events" (to resolve "move the meeting", "before it", ids…), and the
 * Calendar round-trip costs 0.4–2.8 s — the single biggest chunk of voice latency. Serve it
 * stale-while-revalidate: our own writes patch the cache in place, and /api/voice/warm refreshes
 * it the moment Tony starts talking. Single-user app → one cache (cleared on logout). */

const FRESH_MS = 30_000;
const MAX_AGE_MS = 10 * 60_000;
let upcoming: { at: number; from: number; to: number; events: CalendarEvent[] } | undefined;

function patchCache(fn: (list: CalendarEvent[]) => CalendarEvent[]) {
  if (upcoming) upcoming = { ...upcoming, events: fn(upcoming.events) };
}

export function clearEventCache() {
  upcoming = undefined;
}

export async function refreshUpcoming() {
  const now = Date.now();
  const from = now - 86_400_000;
  const to = now + 14 * 86_400_000;
  const events = await listEvents({ from: new Date(from).toISOString(), to: new Date(to).toISOString() });
  upcoming = { at: Date.now(), from, to, events };
  return events;
}

/**
 * "What do I have tomorrow?" — answered from the warm cache when it covers the range and is fresh
 * (refreshed by /api/voice/warm while Tony was speaking, patched by our own writes).
 */
export async function listEventsFast(args: ToolArgs<"calendar.list_events">): Promise<CalendarEvent[]> {
  const from = Date.parse(args.from);
  const to = Date.parse(args.to);
  if (upcoming && !args.query && Date.now() - upcoming.at < 45_000 && from >= upcoming.from && to <= upcoming.to) {
    return upcoming.events.filter((e) => Date.parse(e.end) > from && Date.parse(e.start) < to);
  }
  return listEvents(args);
}

export async function upcomingEvents(): Promise<CalendarEvent[]> {
  const age = upcoming ? Date.now() - upcoming.at : Infinity;
  if (upcoming && age < MAX_AGE_MS) {
    if (age > FRESH_MS) after(() => refreshUpcoming().catch(() => undefined));
    return upcoming.events;
  }
  return refreshUpcoming();
}
