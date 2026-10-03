"use client";
import { useEffect, useState } from "react";
import { ArcReactor, type ReactorState } from "./ArcReactor";
import { useStatus } from "@/store/status";
import { useQueue } from "@/store/queue";
import { cn } from "@/lib/cn";

// Header: orb + JARVIS state + per-integration health chips + clock (BUILD_SPEC 1.1 / 5.3).

function Chip({ label, state, title }: { label: string; state: "ok" | "warn" | "off"; title?: string }) {
  const color = state === "ok" ? "var(--primary)" : state === "warn" ? "var(--gold)" : "var(--red)";
  return (
    <span title={title} className="hud-label inline-flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-[0.6rem]" style={{ color }}>
      <span className="size-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </span>
  );
}

export function StatusBar() {
  const { status, refresh, error } = useStatus();
  const running = useQueue((s) => Boolean(s.currentId));
  const awaiting = useQueue((s) => Boolean(s.pending || s.awaitingInputFor));
  const [clock, setClock] = useState("");

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 60_000);
    const tick = setInterval(() => setClock(new Date().toLocaleTimeString("en-IN", { hour12: false })), 1000);
    return () => {
      clearInterval(id);
      clearInterval(tick);
    };
  }, [refresh]);

  const degraded = status && (!status.google.connected || !status.telegram.ok || status.ai.mode === "backup");
  const state: ReactorState = error ? "offline" : awaiting ? "awaiting" : running ? "processing" : degraded ? "degraded" : "online";
  const label = { online: "ONLINE", processing: "PROCESSING", awaiting: "AWAITING INPUT", degraded: "ONLINE · PARTIAL", offline: "OFFLINE" }[state];

  return (
    <header className="hud-panel flex items-center gap-3 px-3 py-2 md:px-4">
      <ArcReactor state={state} size={36} />
      <div className="min-w-0">
        <h1 className="font-display text-base font-bold tracking-[0.3em] text-primary glow md:text-lg">J.A.R.V.I.S.</h1>
        <p className={cn("hud-label text-[0.6rem]", state === "offline" ? "text-red" : state === "online" ? "text-primary" : "text-gold")}>
          ● {label}
        </p>
      </div>
      <div className="ml-auto hidden flex-wrap items-center gap-1.5 md:flex">
        <Chip label={status?.ai.mode === "llm" ? "AI CORE" : "AI · BACKUP"} state={status?.ai.mode === "llm" ? "ok" : "warn"} title={status ? `${status.ai.provider}/${status.ai.model}` : undefined} />
        <Chip label="CALENDAR" state={status?.google.connected ? "ok" : status?.google.configured ? "warn" : "off"} />
        <Chip label="ARCHIVE" state={status?.google.connected ? "ok" : status?.google.configured ? "warn" : "off"} />
        <Chip label="TELEGRAM" state={status?.telegram.ok ? "ok" : status?.telegram.configured ? "warn" : "off"} title={status?.telegram.error} />
      </div>
      <span className="ml-auto font-mono text-xs text-muted md:ml-3">{clock}</span>
    </header>
  );
}
