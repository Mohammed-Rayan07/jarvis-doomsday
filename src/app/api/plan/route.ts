import { plan } from "@/lib/ai/planner";
import { fallbackPlan } from "@/lib/ai/fallback";
import { ok, route } from "@/lib/http";
import { listReminders } from "@/lib/reminders/service";
import { upcomingEvents } from "@/lib/google/calendar";
import { COLLECTIONS, storage } from "@/lib/storage";
import type { Contact, PlanRequest } from "@/lib/types";
import type { PlannerContext } from "@/lib/ai/prompt";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const body = (await req.json()) as PlanRequest;
  const tz = body.tz || "Asia/Kolkata";
  // Dev-only: exercise the rule-based backup brain without unsetting the AI key.
  if (process.env.NODE_ENV !== "production" && req.headers.get("x-jarvis-brain") === "backup") {
    return ok({ ...fallbackPlan({ ...body, tz }), source: "backup" });
  }

  // Context so the planner can resolve names and ids (BUILD_SPEC §4 "Resolution").
  const now = Date.now();
  const [contacts, reminders, events] = await Promise.all([
    storage().getAll<Contact>(COLLECTIONS.contacts).catch(() => []),
    listReminders("upcoming", tz).catch(() => []),
    upcomingEvents().catch(() => []), // cached (SWR) — the Calendar round-trip was the biggest latency chunk
  ]);
  console.info(`[plan] context ${Date.now() - now}ms`);
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
