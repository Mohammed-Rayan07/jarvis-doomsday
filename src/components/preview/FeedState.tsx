"use client";
import { AlertTriangle, Link2, Loader2 } from "lucide-react";
import type { JarvisErrorShape } from "@/lib/types";

// Shared loading / error / not-connected states for preview feeds (BUILD_SPEC 5.2, 5.3).

export function FeedLoading({ label }: { label: string }) {
  return (
    <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function FeedError({ error, onRetry }: { error: JarvisErrorShape; onRetry?: () => void }) {
  const connect = error.code === "NOT_CONNECTED" || error.code === "AUTH_EXPIRED";
  const color = connect ? "var(--cyan)" : error.code === "NOT_CONFIGURED" ? "var(--gold)" : "var(--red)";
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <span style={{ color }}>{connect ? <Link2 className="size-6" /> : <AlertTriangle className="size-6" />}</span>
      <p className="hud-label" style={{ color }}>
        {error.code.replace(/_/g, " ")}
      </p>
      <p className="max-w-sm text-sm text-muted">{error.message}</p>
      <div className="flex gap-2">
        {error.fix?.href && (
          <a href={error.fix.href} className="hud-label rounded-sm border px-3 py-1.5" style={{ borderColor: color, color }}>
            {error.fix.label}
          </a>
        )}
        {onRetry && !connect && (
          <button onClick={onRetry} className="hud-label rounded-sm border border-line px-3 py-1.5 text-muted hover:text-text">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
