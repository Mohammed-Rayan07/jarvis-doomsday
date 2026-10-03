"use client";
import { useEffect, useState } from "react";
import { ArcReactor, type ReactorState } from "./ArcReactor";
import { useStatus } from "@/store/status";
import { useQueue } from "@/store/queue";
import { cn } from "@/lib/cn";
import { Volume2, VolumeX } from "lucide-react";
import { useVoiceToggle } from "@/hooks/useVoice";

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
  const voice = useVoiceToggle();

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
        <Chip
          label={status?.voice?.provider === "elevenlabs" ? "VOICE · NEURAL" : "VOICE · BASIC"}
          state={status?.voice?.provider === "elevenlabs" ? "ok" : "warn"}
          title={status?.voice?.provider === "elevenlabs" ? `ElevenLabs · ${status.voice.budgetLeft ?? "?"} chars of budget left` : "Browser speech synthesis"}
        />
        <Chip label="TELEGRAM" state={status?.telegram.ok ? "ok" : status?.telegram.configured ? "warn" : "off"} title={status?.telegram.error} />
      </div>
      {status?.google.configured && !status.google.connected && (
        <a href="/api/auth/google" className="hud-label ml-auto rounded-sm border border-cyan/60 px-2 py-1.5 text-[0.6rem] text-cyan hover:bg-cyan/10 md:ml-2">
          Connect Google
        </a>
      )}
      {status?.google.connected && (
        <span className="hud-label hidden text-[0.55rem] text-muted xl:inline" title="Google account">{status.google.email}</span>
      )}
      {voice.supported && (
        <button
          onClick={voice.toggle}
          aria-label={voice.on ? "Mute JARVIS voice" : "Enable JARVIS voice"}
          title={voice.on ? "Voice replies on" : "Voice replies off"}
          className={cn("ml-auto rounded-sm border p-1.5 md:ml-2", voice.on ? "border-cyan/60 text-cyan" : "border-line text-muted hover:text-text")}
        >
          {voice.on ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
        </button>
      )}
      <span className="font-mono text-xs text-muted md:ml-1">{clock}</span>
    </header>
  );
}
