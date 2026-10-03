import "server-only";
import { EncryptJWT, jwtDecrypt } from "jose";
import { cookies } from "next/headers";
import { env } from "./env";

// Encrypted httpOnly cookie holding Google OAuth tokens (BUILD_SPEC D4).

export const GOOGLE_COOKIE = "jarvis_g";
export const OAUTH_STATE_COOKIE = "jarvis_oauth_state";
const MAX_AGE = 60 * 60 * 24 * 30;

export interface GoogleSession {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  email?: string;
}

async function key() {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.sessionSecret));
  return new Uint8Array(digest);
}

export async function sealSession(data: GoogleSession): Promise<string> {
  return new EncryptJWT({ ...data })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .encrypt(await key());
}

export async function unsealSession(token: string): Promise<GoogleSession | undefined> {
  try {
    const { payload } = await jwtDecrypt(token, await key());
    return payload as GoogleSession;
  } catch {
    return undefined;
  }
}

export async function readGoogleSession(): Promise<GoogleSession | undefined> {
  const token = (await cookies()).get(GOOGLE_COOKIE)?.value;
  return token ? unsealSession(token) : undefined;
}

export async function writeGoogleSession(data: GoogleSession) {
  (await cookies()).set(GOOGLE_COOKIE, await sealSession(data), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.appUrl.startsWith("https://"),
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearGoogleSession() {
  (await cookies()).delete(GOOGLE_COOKIE);
}
