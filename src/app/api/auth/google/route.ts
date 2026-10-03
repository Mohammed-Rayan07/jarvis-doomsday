import { cookies } from "next/headers";
import { consentUrl } from "@/lib/google/auth";
import { OAUTH_STATE_COOKIE } from "@/lib/session";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const state = crypto.randomUUID();
  (await cookies()).set(OAUTH_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return Response.redirect(consentUrl(state), 302);
});
