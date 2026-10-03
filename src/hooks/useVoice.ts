"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueue } from "@/store/queue";

// Voice I/O (BUILD_SPEC §9.2, stretch): Web Speech recognition for input, speechSynthesis for
// JARVIS replies. Both degrade silently where the browser lacks support.

const KEY = "jarvis-voice";

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function recognitionCtor(): (new () => Recognition) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((v) => /en-GB/i.test(v.lang) && /male|daniel|george|arthur|ryan/i.test(v.name)) ??
    voices.find((v) => /en-GB/i.test(v.lang)) ??
    voices.find((v) => /^en/i.test(v.lang))
  );
}

export function speak(text: string) {
  if (typeof speechSynthesis === "undefined") return;
  try {
    if (localStorage.getItem(KEY) !== "on") return;
  } catch {
    return;
  }
  const u = new SpeechSynthesisUtterance(text.replace(/J\.A\.R\.V\.I\.S\./g, "Jarvis"));
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = 1.04;
  u.pitch = 0.9;
  speechSynthesis.speak(u);
}

/** Speaks each new JARVIS chat message while voice output is on. */
export function useSpeakReplies() {
  const lastSpoken = useRef<string | undefined>(undefined);
  useEffect(
    () =>
      useQueue.subscribe((s) => {
        const last = s.messages.at(-1);
        if (!last || last.role !== "jarvis" || last.id === lastSpoken.current) return;
        lastSpoken.current = last.id;
        speak(last.text);
      }),
    [],
  );
}

export function useVoiceToggle() {
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(false); // decided after mount to avoid hydration mismatch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported("speechSynthesis" in window);
    try {
      setOn(localStorage.getItem(KEY) === "on");
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = useCallback(() => {
    setOn((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(KEY, next ? "on" : "off");
      } catch {
        /* ignore */
      }
      if (next) speak("Voice systems online, sir.");
      else speechSynthesis?.cancel();
      return next;
    });
  }, []);
  return { on, toggle, supported };
}

/** Push-to-talk dictation. Calls onFinal with the transcript when speech ends. */
export function useDictation(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const rec = useRef<Recognition | null>(null);
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(!!recognitionCtor());
  }, []);

  const stop = useCallback(() => rec.current?.stop(), []);
  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "en-IN";
    r.interimResults = true;
    r.continuous = false;
    let finalText = "";
    r.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText = text;
      }
      setInterim(text);
    };
    r.onerror = () => setListening(false);
    r.onend = () => {
      setListening(false);
      setInterim("");
      if (finalText.trim()) onFinal(finalText.trim());
    };
    rec.current = r;
    setListening(true);
    r.start();
  }, [onFinal]);

  return { supported, listening, interim, start, stop };
}
