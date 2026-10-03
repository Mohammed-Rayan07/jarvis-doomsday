import { plan } from "@/lib/ai/planner";
import { ok, route } from "@/lib/http";
import { listReminders } from "@/lib/reminders/service";
import { listEvents } from "@/lib/google/calendar";
import { COLLECTIONS, storage } from "@/lib/storage";
import type { Contact, PlanRequest } from "@/lib/types";
import type { PlannerContext } from "@/lib/ai/prompt";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const body = (await req.json()) as PlanRequest;
  const tz = body.tz || "Asia/Kolkata";

  // Context so the planner can resolve names and ids (BUILD_SPEC §4 "Resolution").
  const now = Date.now();
  const [contacts, reminders, events] = await Promise.all([
    storage().getAll<Contact>(COLLECTIONS.contacts).catch(() => []),
    listReminders("upcoming", tz).catch(() => []),
    listEvents({ from: new Date(now - 86_400_000).toISOString(), to: new Date(now + 14 * 86_400_000).toISOString() }).catch(() => []),
  ]);
  const ctx: PlannerContext = {
    now: body.now || new Date().toISOString(),
    tz,
    contacts: contacts.map((c) => ({ name: c.name, aliases: c.aliases })),
    events: events.map((e) => ({ id: e.id, title: e.title, start: e.start })),
    reminders: reminders.map((r) => ({ id: r.id, text: r.text, dueAt: r.dueAt })),
    attachments: body.attachments ?? [],
  };

  return ok(await plan({ ...body, tz, history: (body.history ?? []).slice(-12), attachments: ctx.attachments }, ctx));
});
