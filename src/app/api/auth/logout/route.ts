import { clearGoogleSession } from "@/lib/session";
import { ok } from "@/lib/http";

export async function POST() {
  await clearGoogleSession();
  return ok({ disconnected: true });
}
