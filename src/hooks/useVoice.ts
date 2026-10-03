"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { initVoice, recognitionCtor, say, setOutput, useVoice } from "@/engine/voice";
import { startNarration } from "@/engine/narrator";
import { useStatus } from "@/store/status";

// React glue for the voice engine (src/engine/voice.ts).

/** Speak a line if voice is on (reminder pings etc.). */
export function speak(text: string) {
  say(text);
}

/** Mount once: restores the voice toggle, picks ElevenLabs vs browser, narrates the queue. */
export function useVoiceSystem() {
  const provider = useStatus((s) => s.status?.voice?.provider);
  useEffect(() => {
    initVoice(provider ?? "browser");
  }, [provider]);
  useEffect(() => startNarration(), []);
}

export function useVoiceToggle() {
  const on = useVoice((s) => s.output);
  const [supported, setSupported] = useState(false); // decided after mount to avoid hydration mismatch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported("speechSynthesis" in window || "AudioContext" in window);
  }, []);
  const toggle = useCallback(() => setOutput(!useVoice.getState().output), []);
  return { on, toggle, supported };
}

export function useLiveSupported() {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(!!recognitionCtor() && !!navigator.mediaDevices?.getUserMedia);
  }, []);
  return supported;
}

/** Push-to-talk dictation. Calls onFinal with the transcript when speech ends. */
export function useDictation(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const rec = useRef<{ stop: () => void } | null>(null);
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
