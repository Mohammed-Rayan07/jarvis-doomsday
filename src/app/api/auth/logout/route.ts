import { clearGoogleSession } from "@/lib/session";
import { ok } from "@/lib/http";
import { clearEventCache } from "@/lib/google/calendar";
import { forgetGoogleClients } from "@/lib/google/auth";

export async function POST() {
  await clearGoogleSession();
  clearEventCache();
  forgetGoogleClients();
  return ok({ disconnected: true });
}
