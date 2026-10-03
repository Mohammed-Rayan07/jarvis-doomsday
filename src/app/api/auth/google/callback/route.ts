import { cookies } from "next/headers";
import { oauthClient } from "@/lib/google/auth";
import { OAUTH_STATE_COOKIE, writeGoogleSession } from "@/lib/session";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get(OAUTH_STATE_COOKIE)?.value;
  jar.delete(OAUTH_STATE_COOKIE);

  const back = (q: string) => Response.redirect(`${env.appUrl}/?${q}`, 302);
  if (url.searchParams.get("error")) return back(`auth_error=${encodeURIComponent(url.searchParams.get("error")!)}`);
  if (!code || !state || state !== expected) return back("auth_error=state_mismatch");

  try {
    const client = oauthClient();
    const { tokens } = await client.getToken(code);
    let email: string | undefined;
    if (tokens.id_token) {
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.googleClientId });
      email = ticket.getPayload()?.email;
    }
    await writeGoogleSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      email,
    });
    return back("connected=google");
  } catch (err) {
    console.error("[oauth] callback failed", err);
    return back("auth_error=exchange_failed");
  }
}
