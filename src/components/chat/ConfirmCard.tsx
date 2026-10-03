"use client";
import { useEffect, useRef, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { resolveInteraction, setDraftArgs } from "@/engine/executor";
import { toolMeta } from "@/lib/tools/schemas";
import type { StepRun } from "@/lib/types";
import { cn } from "@/lib/cn";

// Confirmation gate for consequential actions (BUILD_SPEC 5.2). Fields are editable:
// datetimes get a native picker, long text a textarea. Enter = authorise, Esc = abort.

const LABELS: Record<string, string> = {
  title: "Title",
  start: "Starts",
  end: "Ends",
  durationMinutes: "Duration (min)",
  description: "Notes",
  location: "Location",
  attendees: "Attendees",
  recipient: "To",
  text: "Message",
  name: "Folder name",
  eventId: "Event",
  id: "Item",
  dueAt: "When",
};

const HEADINGS: Partial<Record<StepRun["tool"], string>> = {
  "calendar.create_event": "Create calendar event?",
  "calendar.update_event": "Update calendar event?",
  "calendar.delete_event": "Delete this event?",
  "telegram.send": "Send Telegram message?",
  "drive.create_folder": "Create Drive folder?",
  "reminders.delete": "Delete this reminder?",
};

const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);

/** ISO (any offset) → value for <input type="datetime-local"> in the browser's timezone. */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ConfirmCard({ commandId, step, remaining = 0 }: { commandId: string; step: StepRun; remaining?: number }) {
  const [args, setArgs] = useState<Record<string, unknown>>(step.args);
  const meta = toolMeta[step.tool];
  const danger = meta.danger;
  const key = `${commandId}:${step.id}`;
  const ref = useRef<HTMLDivElement>(null);

  // keep latest args for the keyboard handler
  const argsRef = useRef(args);
  useEffect(() => {
    argsRef.current = args;
    setDraftArgs(key, args);
  }, [args, key]);

  const approve = (all = false) => resolveInteraction(key, { type: "approve", args, all });

  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLInputElement && e.target.getAttribute("aria-label") === "Command input");
      if (e.key === "Escape") resolveInteraction(key, { type: "cancel" });
      if (e.key === "Enter" && !e.shiftKey && !typing) {
        e.preventDefault();
        resolveInteraction(key, { type: "approve", args: argsRef.current });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key]);

  return (
    <div ref={ref} className={cn("hud-panel mt-2 p-3", danger && "border-red/60")} role="dialog" aria-label="Confirm action">
      <p className={cn("hud-label mb-2 flex items-center gap-1.5", danger ? "text-red" : "text-gold")}>
        {danger ? <ShieldAlert className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
        {HEADINGS[step.tool] ?? "Authorisation required"}
      </p>
      <div className="space-y-1.5">
        {Object.entries(args).map(([k, v]) => (
          <label key={k} className="flex items-start gap-2 text-xs">
            <span className="w-24 shrink-0 pt-1.5 text-muted">{LABELS[k] ?? k}</span>
            {isIso(v) ? (
              <input
                type="datetime-local"
                value={toLocalInput(v)}
                onChange={(e) => e.target.value && setArgs({ ...args, [k]: new Date(e.target.value).toISOString() })}
                className="w-full rounded-sm border border-line bg-black/40 px-2 py-1 font-mono text-text [color-scheme:dark] outline-none focus:border-primary"
              />
            ) : typeof v === "string" && (k === "text" || k === "description" || v.length > 60) ? (
              <textarea
                value={v}
                rows={Math.min(5, Math.ceil(v.length / 50) + 1)}
                onChange={(e) => setArgs({ ...args, [k]: e.target.value })}
                className="w-full resize-y rounded-sm border border-line bg-black/40 px-2 py-1 text-text outline-none focus:border-primary"
              />
            ) : typeof v === "string" || typeof v === "number" ? (
              <input
                value={String(v)}
                onChange={(e) => setArgs({ ...args, [k]: typeof v === "number" ? Number(e.target.value) || v : e.target.value })}
                className="w-full rounded-sm border border-line bg-black/40 px-2 py-1 font-mono text-text outline-none focus:border-primary"
              />
            ) : (
              <span className="pt-1.5 font-mono">{JSON.stringify(v)}</span>
            )}
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          autoFocus
          onClick={() => approve()}
          className={cn(
            "hud-label rounded-sm border px-3 py-1.5",
            danger ? "border-red bg-red/10 text-red hover:bg-red/20" : "border-primary bg-primary/10 text-primary hover:bg-primary/20",
          )}
        >
          {danger ? "Confirm delete" : "Authorise"} ⏎
        </button>
        {remaining > 0 && !danger && (
          <button onClick={() => approve(true)} className="hud-label rounded-sm border border-primary/40 px-3 py-1.5 text-primary/80 hover:bg-primary/10" title="Approve this and the remaining steps of this command">
            Authorise all ({remaining + 1})
          </button>
        )}
        <button onClick={() => resolveInteraction(key, { type: "skip" })} className="hud-label rounded-sm border border-line px-3 py-1.5 text-muted hover:text-text">
          Skip
        </button>
        <button onClick={() => resolveInteraction(key, { type: "cancel" })} className="hud-label ml-auto rounded-sm border border-red/50 px-3 py-1.5 text-red hover:bg-red/10">
          Abort · Esc
        </button>
      </div>
    </div>
  );
}
