import { syncContacts } from "@/lib/telegram/bot";
import { ok, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = route(async () => ok(await syncContacts()));
