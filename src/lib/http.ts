import "server-only";
import { toErrorShape } from "./errors";

// Helpers for route handlers: consistent { ok, data } / { ok:false, error } envelopes.

const STATUS: Record<string, number> = {
  NOT_CONFIGURED: 503,
  NOT_CONNECTED: 401,
  AUTH_EXPIRED: 401,
  MISSING_FIELD: 400,
  VALIDATION: 400,
  NOT_FOUND: 404,
  AMBIGUOUS: 409,
  PERMISSION_DENIED: 403,
  RATE_LIMITED: 429,
  NOT_IMPLEMENTED: 501,
};

export const ok = <T>(data: T, init?: ResponseInit) => Response.json({ ok: true, data }, init);

export function fail(err: unknown) {
  const error = toErrorShape(err);
  return Response.json({ ok: false, error }, { status: STATUS[error.code] ?? 500 });
}

/** Wrap a handler so thrown JarvisErrors become JSON envelopes. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      return fail(err);
    }
  };
}

export const tzOf = (req: Request) => req.headers.get("x-jarvis-tz") ?? "Asia/Kolkata";
