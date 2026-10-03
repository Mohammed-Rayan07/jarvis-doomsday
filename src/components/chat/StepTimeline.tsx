"use client";
import { Check, CircleDashed, Loader2, Pause, RotateCcw, SkipForward, X } from "lucide-react";
import type { ErrorCode, StepRun } from "@/lib/types";
import { cn } from "@/lib/cn";
import { ConfirmCard } from "./ConfirmCard";
import { UploadCard } from "./UploadCard";
import { useQueue } from "@/store/queue";
import { retryStep } from "@/engine/executor";

// Per-command step list with live status (BUILD_SPEC 5.1). Hosts confirm/upload cards inline,
// and failed steps offer recovery: pick another recipient, retry, or reconnect (5.2).

const ICON = {
  pending: <CircleDashed className="size-3.5 text-muted" />,
  awaiting_confirmation: <Pause className="size-3.5 text-gold" />,
  running: <Loader2 className="size-3.5 animate-spin text-cyan" />,
  done: <Check className="size-3.5 text-primary" />,
  failed: <X className="size-3.5 text-red" />,
  cancelled: <X className="size-3.5 text-muted" />,
  skipped: <SkipForward className="size-3.5 text-muted" />,
};

const LABEL: Partial<Record<StepRun["status"], string>> = {
  awaiting_confirmation: "awaiting authorisation",
  running: "running",
  skipped: "skipped",
  cancelled: "cancelled",
};

const RETRYABLE: ErrorCode[] = ["NETWORK", "UPSTREAM_ERROR", "RATE_LIMITED", "NOT_FOUND", "AMBIGUOUS", "PERMISSION_DENIED"];

export function StepTimeline({ commandId, steps }: { commandId: string; steps: StepRun[] }) {
  const pending = useQueue((s) => s.pending);
  const busy = useQueue((s) => Boolean(s.currentId));

  return (
    <ol className="mt-2 space-y-1.5 border-l border-line pl-3">
      {steps.map((st, i) => {
        const err = st.status === "failed" ? st.result?.error : undefined;
        const options = (err?.details as { options?: string[] } | undefined)?.options;
        const recipientStep = st.tool === "telegram.send";
        return (
          <li key={st.id}>
            <div className="flex items-start gap-2 text-sm">
              <span className="mt-0.5">{ICON[st.status]}</span>
              <div className="min-w-0 flex-1">
                <p className={cn(st.status === "failed" && "text-red", st.status === "cancelled" && "text-muted line-through")}>
                  <span className="mr-1.5 font-mono text-[0.6rem] text-muted">{i + 1}.</span>
                  {st.summary}
                  {LABEL[st.status] && <span className="hud-label ml-2 text-[0.5rem] text-muted">{LABEL[st.status]}</span>}
                </p>
                {st.result && <p className={cn("text-xs", st.result.ok ? "text-muted" : "text-red/90")}>{st.result.message}</p>}

                {err && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {recipientStep &&
                      options?.map((o) => (
                        <button
                          key={o}
                          disabled={busy}
                          onClick={() => retryStep(commandId, st.id, { recipient: o })}
                          className="rounded-sm border border-telegram/50 px-2 py-0.5 text-xs text-telegram hover:bg-telegram/10 disabled:opacity-40"
                        >
                          Send to {o}
                        </button>
                      ))}
                    {err.fix?.href && (
                      <a href={err.fix.href} target={err.fix.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="hud-label rounded-sm border border-cyan/50 px-2 py-0.5 text-[0.55rem] text-cyan hover:bg-cyan/10">
                        {err.fix.label} →
                      </a>
                    )}
                    {RETRYABLE.includes(err.code) && (
                      <button
                        disabled={busy}
                        onClick={() => retryStep(commandId, st.id)}
                        className="hud-label flex items-center gap-1 rounded-sm border border-line px-2 py-0.5 text-[0.55rem] text-muted hover:text-text disabled:opacity-40"
                      >
                        <RotateCcw className="size-3" /> Retry{steps.slice(i + 1).some((s) => s.status === "skipped") ? " & continue" : ""}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            {pending?.commandId === commandId && pending.stepId === st.id && pending.type === "confirm" && (
              <ConfirmCard commandId={commandId} step={st} remaining={steps.slice(i + 1).filter((s) => s.status === "pending").length} />
            )}
            {pending?.commandId === commandId && pending.stepId === st.id && pending.type === "upload" && <UploadCard commandId={commandId} step={st} />}
          </li>
        );
      })}
    </ol>
  );
}
