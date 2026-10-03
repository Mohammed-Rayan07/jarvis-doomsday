"use client";
import { useState } from "react";
import { resolveInteraction } from "@/engine/executor";
import { toolMeta } from "@/lib/tools/schemas";
import type { StepRun } from "@/lib/types";
import { cn } from "@/lib/cn";

// Confirmation gate for consequential actions with editable string fields (BUILD_SPEC 5.2).
// TODO(P6): typed field editors (datetime picker, contact select), keyboard Enter/Esc.

export function ConfirmCard({ commandId, step }: { commandId: string; step: StepRun }) {
  const [args, setArgs] = useState<Record<string, unknown>>(step.args);
  const danger = toolMeta[step.tool].danger;
  const key = `${commandId}:${step.id}`;

  return (
    <div className={cn("hud-panel mt-2 p-3", danger && "border-red/60")}>
      <p className={cn("hud-label mb-2", danger ? "text-red" : "text-gold")}>
        {danger ? "⚠ Confirm destructive action" : "Authorisation required"}
      </p>
      <div className="space-y-1.5">
        {Object.entries(args).map(([k, v]) => (
          <label key={k} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 font-mono text-muted">{k}</span>
            {typeof v === "string" ? (
              <input
                value={v}
                onChange={(e) => setArgs({ ...args, [k]: e.target.value })}
                className="w-full rounded-sm border border-line bg-black/40 px-2 py-1 font-mono text-text outline-none focus:border-primary"
              />
            ) : (
              <span className="font-mono">{JSON.stringify(v)}</span>
            )}
          </label>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => resolveInteraction(key, { type: "approve", args })} className="hud-label rounded-sm border border-primary bg-primary/10 px-3 py-1.5 text-primary hover:bg-primary/20">
          Authorise
        </button>
        <button onClick={() => resolveInteraction(key, { type: "skip" })} className="hud-label rounded-sm border border-line px-3 py-1.5 text-muted hover:text-text">
          Skip
        </button>
        <button onClick={() => resolveInteraction(key, { type: "cancel" })} className="hud-label ml-auto rounded-sm border border-red/50 px-3 py-1.5 text-red hover:bg-red/10">
          Abort
        </button>
      </div>
    </div>
  );
}
