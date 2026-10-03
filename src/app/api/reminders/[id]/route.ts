import { deleteReminder, updateReminder } from "@/lib/reminders/service";
import { ownerChatId, tg } from "@/lib/telegram/bot";
import { ok, route } from "@/lib/http";
import type { Reminder } from "@/lib/types";

export const dynamic = "force-dynamic";

// PATCH { status?, dueAt?, firedAt?, fire? } — complete / snooze / mark fired.
// `fire: true` (sent by the client watcher) also pings Tony on Telegram if the reminder asked for it.
export const PATCH = route(async (req: Request, ctx: RouteContext<"/api/reminders/[id]">) => {
  const { id } = await ctx.params;
  const { fire, ...body } = (await req.json()) as Partial<Pick<Reminder, "status" | "dueAt" | "firedAt">> & { fire?: boolean };
  const reminder = await updateReminder(id, body);
  if (fire && reminder.notifyTelegram) {
    const chatId = await ownerChatId();
    if (chatId) await tg("sendMessage", { chat_id: chatId, text: `⏰ Reminder, sir: ${reminder.text}` }).catch(() => undefined);
  }
  return ok(reminder);
});

export const DELETE = route(async (_req: Request, ctx: RouteContext<"/api/reminders/[id]">) => {
  const { id } = await ctx.params;
  await deleteReminder(id);
  return ok({ id });
});
