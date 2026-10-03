"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { bargeIn, setLive, useVoice } from "@/engine/voice";
import { useQueue } from "@/store/queue";
import { cn } from "@/lib/cn";
import { VoiceOrb } from "./VoiceOrb";

// LIVE VOICE LINK: orb + state + Tony's live transcript + JARVIS's caption.
// Half-duplex by design: the mic pauses while JARVIS talks (otherwise it transcribes itself).
// Space / orb click = interrupt JARVIS and take the floor.

export function VoiceDock() {
  const { speaking, listening, heard, caption, captionAt, provider, degraded } = useVoice();
  const running = useQueue((s) => Boolean(s.currentId));
  const pending = useQueue((s) => s.pending?.type);
  const awaitingAnswer = useQueue((s) => Boolean(s.awaitingInputFor));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const t = e.target as HTMLElement | null;
      // only text entry keeps Space; on buttons it would "click" them (e.g. toggle LIVE off)
      if (t && (t.closest("input, textarea, select, [contenteditable=true]") || t.isContentEditable)) return;
      e.preventDefault();
      bargeIn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const state = speaking
    ? { label: "TRANSMITTING", tone: "text-primary" }
    : pending === "confirm"
      ? { label: "AWAITING AUTHORISATION", tone: "text-gold" }
      : listening
        ? { label: awaitingAnswer ? "LISTENING · ANSWER REQUIRED" : "LISTENING", tone: "text-cyan" }
        : running
          ? { label: "PROCESSING", tone: "text-cyan" }
          : { label: "STANDBY", tone: "text-muted" };

  const hint =
    pending === "confirm"
      ? "Say “confirm”, “authorise all”, “skip” or “cancel”"
      : speaking
        ? "Space / tap the core to interrupt"
        : running
          ? "Say “stop” to abort the current operation"
          : "Speak naturally — “Jarvis, what’s on my schedule tomorrow?”";

  return (
    <div className="voice-dock relative overflow-hidden border-t border-line px-3 py-2.5">
      <div className="pointer-events-none absolute inset-0 hud-grid opacity-40" />
      <div className="relative flex items-center gap-3">
        <VoiceOrb mode={pending === "confirm" ? "awaiting" : running ? "thinking" : "idle"} onClick={bargeIn} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={cn("size-1.5 rounded-full", listening ? "mic-live bg-cyan" : speaking ? "bg-primary" : "bg-muted")} />
            <span className={cn("hud-label text-[0.62rem]", state.tone)}>{state.label}</span>
            <span className="hud-label ml-auto text-[0.5rem] text-muted" title={degraded}>
              {provider === "elevenlabs" ? "ELEVENLABS · NEURAL" : "BROWSER VOICE"}
            </span>
            <button onClick={() => void setLive(false)} aria-label="End voice link" title="End voice link" className="text-muted hover:text-red">
              <X className="size-3.5" />
            </button>
          </div>
          <Line who="TONY" tone="text-cyan" text={heard} placeholder={listening ? "…" : ""} cursor={listening} />
          <Line who="JARVIS" tone="text-primary" text={caption} reveal={captionAt} cursor={speaking} />
          <p className="font-mono text-[0.6rem] text-muted/80">{hint}</p>
        </div>
      </div>
    </div>
  );
}

function Line({ who, tone, text, placeholder, cursor, reveal }: { who: string; tone: string; text: string; placeholder?: string; cursor?: boolean; reveal?: number }) {
  const shown = useReveal(text, reveal);
  return (
    <p className="line-clamp-2 min-h-[1.1rem] font-mono text-xs leading-snug">
      <span className="hud-label mr-1.5 text-[0.55rem] text-muted">{who} ›</span>
      <span className={tone}>{shown || placeholder}</span>
      {cursor && <span className={cn("caret ml-0.5 inline-block h-3 w-1.5 translate-y-0.5", tone === "text-cyan" ? "bg-cyan" : "bg-primary")} />}
    </p>
  );
}

/** Typewriter reveal paced roughly to speech (~16 chars/s). */
function useReveal(text: string, startedAt?: number) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (startedAt === undefined || !text) return;
    const id = setInterval(() => {
      const n = Math.floor(((performance.now() - startedAt) / 1000) * 16) + 1;
      setCount(n);
      if (n >= text.length) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [text, startedAt]);
  return startedAt === undefined ? text : text.slice(0, count);
}
