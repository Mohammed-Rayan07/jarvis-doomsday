"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Mic, Paperclip, Send, Square, X } from "lucide-react";
import { useQueue, selectQueued } from "@/store/queue";
import { interrupt, submit } from "@/engine/executor";
import { StepTimeline } from "./StepTimeline";
import { cn } from "@/lib/cn";
import { useShallow } from "zustand/react/shallow";
import { useDictation, useLiveSupported } from "@/hooks/useVoice";
import { hear, setLive, useVoice } from "@/engine/voice";
import { VoiceDock } from "@/components/voice/VoiceDock";

// COMMS LINK: transcript + step timelines + queue strip + command bar (BUILD_SPEC 1.1, 1.2, §5).

const SUGGESTIONS = [
  "Schedule a meeting with Bruce tomorrow at 5 PM.",
  "Remind me to check the reactor at 8 PM.",
  "Upload this document to my Drive.",
  "Find the reactor design report.",
  "Send Bruce a message saying the experiment is postponed.",
  "What do I have scheduled for tomorrow?",
  "Schedule the Stark team meeting for tomorrow at 6 PM, remind me 30 minutes before it, and send Bruce a Telegram message about it.",
];

export function ChatPanel() {
  const messages = useQueue((s) => s.messages);
  const commands = useQueue((s) => s.commands);
  const scroller = useRef<HTMLDivElement>(null);
  const live = useVoice((s) => s.live);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, commands]);

  return (
    <section className="hud-panel flex min-h-0 flex-1 flex-col">
      <div className="hud-label border-b border-line px-4 py-2 text-muted">Comms link · Tony ⇄ JARVIS</div>
      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="font-display text-sm text-primary glow">Good evening, sir. All systems are at your disposal.</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => submit(s)} className="rounded-sm border border-line bg-black/30 px-2.5 py-1.5 text-left text-xs text-muted hover:border-primary hover:text-text">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => {
          const cmd = m.role === "jarvis" && m.kind !== "summary" ? commands.find((c) => c.id === m.commandId) : undefined;
          return (
            <div key={m.id} className={cn("msg-in max-w-[92%]", m.role === "user" ? "ml-auto text-right" : "")}>
              <p className="hud-label mb-1 text-[0.55rem] text-muted">
                {m.role === "user" ? "Tony" : "JARVIS"}
                {m.source && <span className={cn("ml-2", m.source === "llm" ? "text-cyan" : "text-gold")}>[{m.source}]</span>}
              </p>
              <div
                className={cn(
                  "inline-block rounded-sm border px-3 py-2 text-left text-sm",
                  m.role === "user" ? "border-line-bright bg-primary/5" : "border-line bg-black/30",
                  m.kind === "error" && "border-red/60 text-red",
                  m.kind === "clarify" && "border-gold/60",
                )}
              >
                {m.text}
                {m.options && m.options.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.options.map((o) => (
                      <button key={o} onClick={() => submit(o)} className="rounded-sm border border-gold/50 px-2 py-1 text-xs text-gold hover:bg-gold/10">
                        {o}
                      </button>
                    ))}
                  </div>
                )}
                {cmd && cmd.steps.length > 0 && <StepTimeline commandId={cmd.id} steps={cmd.steps} />}
              </div>
            </div>
          );
        })}
      </div>
      <QueueStrip />
      {live && <VoiceDock />}
      <CommandInput />
    </section>
  );
}

function QueueStrip() {
  const current = useQueue((s) => s.commands.find((c) => c.id === s.currentId));
  const queued = useQueue(useShallow(selectQueued));
  const remove = useQueue((s) => s.removeQueued);
  if (!current && queued.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2 text-xs">
      {current && (
        <span className="flex items-center gap-1.5 text-cyan">
          <span className="size-1.5 animate-pulse rounded-full bg-cyan" /> NOW: <span className="max-w-48 truncate">{current.text}</span>
        </span>
      )}
      {queued.map((c, i) => (
        <span key={c.id} className="flex items-center gap-1 rounded-sm border border-line px-2 py-0.5 text-muted">
          #{i + 1} <span className="max-w-32 truncate">{c.text}</span>
          <button onClick={() => remove(c.id)} aria-label="Remove from queue">
            <X className="size-3" />
          </button>
        </span>
      ))}
      {current && (
        <button onClick={() => interrupt()} className="hud-label ml-auto flex items-center gap-1 text-red">
          <Square className="size-3" /> Stop
        </button>
      )}
    </div>
  );
}

function CommandInput() {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const mode = useQueue((s) => s.mode);
  const setMode = useQueue((s) => s.setMode);
  const fileInput = useRef<HTMLInputElement>(null);
  // spoken input goes through hear() so "confirm" / "cancel" / "stop" work by voice too
  const dictation = useDictation(useCallback((spoken: string) => hear(spoken), []));
  const live = useVoice((s) => s.live);
  const liveSupported = useLiveSupported();

  const send = (interruptNow = false) => {
    submit(text, files, { interrupt: interruptNow });
    setText("");
    setFiles([]);
  };

  return (
    <div className="border-t border-line p-3">
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5 text-xs text-violet">
          {files.map((f) => (
            <span key={f.name} className="rounded-sm border border-violet/40 px-2 py-0.5">📎 {f.name}</span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input ref={fileInput} type="file" hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        <button onClick={() => fileInput.current?.click()} aria-label="Attach file" className="text-muted hover:text-violet">
          <Paperclip className="size-4" />
        </button>
        <input
          value={dictation.listening ? dictation.interim || "Listening…" : text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(e.ctrlKey || e.metaKey);
            }
          }}
          placeholder="Give the order, sir…  (Ctrl+Enter = interrupt)"
          className="min-w-0 flex-1 rounded-sm border border-line bg-black/40 px-3 py-2 text-sm outline-none placeholder:text-muted/70 focus:border-primary"
          aria-label="Command input"
        />
        {liveSupported && (
          <button
            onClick={() => void setLive(!live)}
            aria-label={live ? "End voice link" : "Start live voice link"}
            title={live ? "End live voice link" : "LIVE: talk to JARVIS hands-free"}
            className={cn(
              "hud-label relative flex items-center gap-1 overflow-hidden rounded-sm border px-2 py-2 text-[0.6rem]",
              live ? "live-sweep border-cyan bg-cyan/10 text-cyan" : "border-line text-muted hover:border-cyan/60 hover:text-cyan",
            )}
          >
            <AudioLines className="size-3.5" /> Live
          </button>
        )}
        {dictation.supported && !live && (
          <button
            onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
            aria-label={dictation.listening ? "Stop listening" : "Speak a command"}
            title={dictation.listening ? "Listening… click to stop" : "Speak a command"}
            className={cn("rounded-full p-1", dictation.listening ? "mic-live bg-red/20 text-red" : "text-muted hover:text-cyan")}
          >
            <Mic className="size-4" />
          </button>
        )}
        <button
          onClick={() => setMode(mode === "queue" ? "interrupt" : "queue")}
          title="QUEUE: new commands wait. INTERRUPT: new commands cancel the running one."
          className={cn("hud-label rounded-sm border px-2 py-2 text-[0.6rem]", mode === "queue" ? "border-cyan/60 text-cyan" : "border-red/60 text-red")}
        >
          {mode}
        </button>
        <button onClick={() => send()} aria-label="Send" className="rounded-sm border border-primary bg-primary/10 p-2 text-primary hover:bg-primary/20">
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}
