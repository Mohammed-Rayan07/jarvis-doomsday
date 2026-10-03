import { deleteReminder, updateReminder } from "@/lib/reminders/service";
import { ok, route } from "@/lib/http";
import type { Reminder } from "@/lib/types";

export const dynamic = "force-dynamic";

// PATCH { status?, dueAt?, firedAt? } — complete / snooze / mark fired.
export const PATCH = route(async (req: Request, ctx: RouteContext<"/api/reminders/[id]">) => {
  const { id } = await ctx.params;
  const body = (await req.json()) as Partial<Pick<Reminder, "status" | "dueAt" | "firedAt">>;
  return ok(await updateReminder(id, body));
});

export const DELETE = route(async (_req: Request, ctx: RouteContext<"/api/reminders/[id]">) => {
  const { id } = await ctx.params;
  await deleteReminder(id);
  return ok({ id });
});
