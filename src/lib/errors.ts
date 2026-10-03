import type { ErrorCode, Integration, JarvisErrorShape, ToolResult } from "./types";

export class JarvisError extends Error {
  code: ErrorCode;
  integration?: Integration;
  fix?: JarvisErrorShape["fix"];
  details?: unknown;

  constructor(code: ErrorCode, message: string, opts: Omit<JarvisErrorShape, "code" | "message"> = {}) {
    super(message);
    this.name = "JarvisError";
    this.code = code;
    this.integration = opts.integration;
    this.fix = opts.fix;
    this.details = opts.details;
  }

  toJSON(): JarvisErrorShape {
    return {
      code: this.code,
      message: this.message,
      integration: this.integration,
      fix: this.fix,
      details: this.details,
    };
  }
}

export const errors = {
  notConfigured: (integration: Integration, envVars: string[]) =>
    new JarvisError(
      "NOT_CONFIGURED",
      `The ${label(integration)} link is offline, sir. Missing configuration: ${envVars.join(", ")}.`,
      { integration, fix: { label: "Setup guide", href: "https://github.com/#setup" } },
    ),
  notConnected: (integration: Integration) =>
    new JarvisError("NOT_CONNECTED", `I'm not connected to ${label(integration)} yet, sir.`, {
      integration,
      fix:
        integration === "google"
          ? { label: "Connect Google", href: "/api/auth/google", action: "reconnect_google" }
          : undefined,
    }),
  authExpired: (integration: Integration) =>
    new JarvisError("AUTH_EXPIRED", `My ${label(integration)} credentials have expired, sir. Please re-authorise.`, {
      integration,
      fix: { label: "Reconnect", href: "/api/auth/google", action: "reconnect_google" },
    }),
  missingField: (field: string, hint?: string) =>
    new JarvisError("MISSING_FIELD", hint ?? `I need the ${field} to proceed, sir.`, { details: { field } }),
  notImplemented: (what: string) =>
    new JarvisError("NOT_IMPLEMENTED", `${what} is still being fabricated in the workshop, sir.`),
};

function label(i: Integration) {
  return { google: "Google", telegram: "Telegram", ai: "AI core", storage: "storage", voice: "voice" }[i];
}

export function toErrorShape(err: unknown): JarvisErrorShape {
  if (err instanceof JarvisError) return err.toJSON();
  if (err instanceof Error && err.name === "AbortError") return { code: "CANCELLED", message: "Cancelled, sir." };
  const message = err instanceof Error ? err.message : String(err);
  return { code: "UPSTREAM_ERROR", message: `Something went wrong: ${message}` };
}

export function failure(err: unknown): ToolResult {
  const error = toErrorShape(err);
  return { ok: false, message: error.message, error };
}
