import { createReminder, dueReminders, listReminders, type ReminderRange } from "@/lib/reminders/service";
import { ok, route, tzOf } from "@/lib/http";
import { toolSchemas } from "@/lib/tools/schemas";
import { JarvisError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const url = new URL(req.url);
  if (url.searchParams.get("due") === "1") return ok(await dueReminders());
  const range = (url.searchParams.get("range") ?? "all") as ReminderRange;
  return ok(await listReminders(range, tzOf(req)));
});

export const POST = route(async (req: Request) => {
  const parsed = toolSchemas["reminders.create"].safeParse(await req.json());
  if (!parsed.success) throw new JarvisError("VALIDATION", "Reminder needs text and a valid time, sir.");
  return ok(await createReminder({ ...parsed.data, source: "manual" }));
});
