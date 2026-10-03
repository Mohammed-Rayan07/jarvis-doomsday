"use client";
import { Check, CircleDashed, Loader2, Pause, SkipForward, X } from "lucide-react";
import type { StepRun } from "@/lib/types";
import { cn } from "@/lib/cn";
import { ConfirmCard } from "./ConfirmCard";
import { UploadCard } from "./UploadCard";
import { useQueue } from "@/store/queue";

// Per-command step list with live status (BUILD_SPEC 5.1). Hosts confirm/upload cards inline.

const ICON = {
  pending: <CircleDashed className="size-3.5 text-muted" />,
  awaiting_confirmation: <Pause className="size-3.5 text-gold" />,
  running: <Loader2 className="size-3.5 animate-spin text-cyan" />,
  done: <Check className="size-3.5 text-primary" />,
  failed: <X className="size-3.5 text-red" />,
  cancelled: <X className="size-3.5 text-muted" />,
  skipped: <SkipForward className="size-3.5 text-muted" />,
};

export function StepTimeline({ commandId, steps }: { commandId: string; steps: StepRun[] }) {
  const pending = useQueue((s) => s.pending);
  return (
    <ol className="mt-2 space-y-1.5 border-l border-line pl-3">
      {steps.map((st) => (
        <li key={st.id}>
          <div className="flex items-start gap-2 text-sm">
            <span className="mt-0.5">{ICON[st.status]}</span>
            <div className="min-w-0">
              <p className={cn(st.status === "failed" && "text-red", st.status === "cancelled" && "text-muted line-through")}>{st.summary}</p>
              {st.result && <p className={cn("text-xs", st.result.ok ? "text-muted" : "text-red")}>{st.result.message}</p>}
              {st.result?.error?.fix?.href && (
                <a href={st.result.error.fix.href} className="hud-label mt-1 inline-block text-[0.6rem] text-cyan underline">
                  {st.result.error.fix.label} →
                </a>
              )}
            </div>
          </div>
          {pending?.commandId === commandId && pending.stepId === st.id && pending.type === "confirm" && (
            <ConfirmCard commandId={commandId} step={st} />
          )}
          {pending?.commandId === commandId && pending.stepId === st.id && pending.type === "upload" && (
            <UploadCard commandId={commandId} step={st} />
          )}
        </li>
      ))}
    </ol>
  );
}
