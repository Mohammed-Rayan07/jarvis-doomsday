import "server-only";
import { env, telegramConfigured } from "../env";
import { errors, JarvisError } from "../errors";
import type { CommsEntry, Contact } from "../types";

// BUILD_SPEC §8.4 — sync/send implemented in P5.

const api = (method: string) => `https://api.telegram.org/bot${env.telegramToken}/${method}`;

export async function tg<T>(method: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  if (!telegramConfigured()) throw errors.notConfigured("telegram", ["TELEGRAM_BOT_TOKEN"]);
  const res = await fetch(api(method), {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: T;
    description?: string;
    error_code?: number;
  };
  if (!json.ok) {
    const code =
      json.error_code === 429 ? "RATE_LIMITED" : json.error_code === 401 ? "NOT_CONFIGURED" : "UPSTREAM_ERROR";
    throw new JarvisError(code, `Telegram says: ${json.description ?? res.statusText}`, {
      integration: "telegram",
      details: json,
    });
  }
  return json.result as T;
}

export async function getMe(): Promise<{ username: string; first_name: string }> {
  return tg("getMe");
}

export async function syncContacts(): Promise<Contact[]> {
  throw errors.notImplemented("Telegram contact sync");
}

export async function sendMessage(_recipient: string, _text: string, _commandId?: string): Promise<CommsEntry> {
  throw errors.notImplemented("Telegram messaging");
}
