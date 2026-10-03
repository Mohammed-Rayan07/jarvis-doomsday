import "server-only";
import type { CalendarEvent } from "../types";
import type { ToolArgs } from "../tools/schemas";
import { errors } from "../errors";

// BUILD_SPEC §8.2 — implemented in P2.

export async function createEvent(_args: ToolArgs<"calendar.create_event">, _tz: string): Promise<CalendarEvent> {
  throw errors.notImplemented("Calendar event creation");
}

export async function listEvents(_args: ToolArgs<"calendar.list_events">): Promise<CalendarEvent[]> {
  throw errors.notImplemented("Calendar listing");
}

export async function updateEvent(_args: ToolArgs<"calendar.update_event">, _tz: string): Promise<CalendarEvent> {
  throw errors.notImplemented("Calendar editing");
}

export async function deleteEvent(_args: ToolArgs<"calendar.delete_event">): Promise<void> {
  throw errors.notImplemented("Calendar deletion");
}
