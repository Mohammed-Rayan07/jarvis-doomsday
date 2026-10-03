import "server-only";
import { OAuth2Client } from "google-auth-library";
import { env, googleConfigured } from "../env";
import { errors } from "../errors";
import { clearGoogleSession, readGoogleSession, writeGoogleSession } from "../session";

// BUILD_SPEC §8.1

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive",
];

export const redirectUri = () => `${env.appUrl}/api/auth/google/callback`;

export function oauthClient() {
  if (!googleConfigured()) throw errors.notConfigured("google", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
  return new OAuth2Client(env.googleClientId, env.googleClientSecret, redirectUri());
}

export function consentUrl(state: string) {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: GOOGLE_SCOPES,
    state,
  });
}

/** Authenticated client for the current browser session, or throws NOT_CONFIGURED / NOT_CONNECTED. */
export async function getGoogleClient() {
  const client = oauthClient();
  const session = await readGoogleSession();
  if (!session?.refresh_token && !session?.access_token) throw errors.notConnected("google");
  client.setCredentials(session);
  // Persist refreshed tokens back into the cookie.
  client.on("tokens", (tokens) => {
    void writeGoogleSession({ ...session, ...tokens, refresh_token: tokens.refresh_token ?? session.refresh_token });
  });
  return client;
}

/** Map googleapis errors to JarvisErrors. */
export function mapGoogleError(err: unknown): unknown {
  const e = err as { message?: string; code?: number | string; status?: number; response?: { status?: number } };
  const status = e?.response?.status ?? e?.status ?? (typeof e?.code === "number" ? e.code : undefined);
  if (e?.message?.includes("invalid_grant") || status === 401) {
    // Revoked / expired refresh token: drop the dead cookie so the UI shows "Connect Google" again.
    void clearGoogleSession().catch(() => undefined);
    return errors.authExpired("google");
  }
  return err;
}
