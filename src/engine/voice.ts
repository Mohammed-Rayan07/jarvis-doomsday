"use client";
import { create } from "zustand";
import { useQueue } from "@/store/queue";
import { interrupt, resolveInteraction, submit } from "./executor";

// JARVIS voice engine — a module singleton like the executor (no React state at 60 fps).
//
//   say(text) → serial speech queue → POST /api/voice/tts (ElevenLabs, streamed via MediaSource)
//                                   └→ browser speechSynthesis fallback (no key / quota / errors)
//   setLive(true) → half-duplex conversation loop:
//       listen (SpeechRecognition) → hear() → confirm/cancel/stop routing or submit()
//       → JARVIS speaks (recognition paused so it never transcribes itself) → listen again
//
// One <audio> element feeds an AnalyserNode; mic input feeds another. The reactor and the voice
// orb read those spectra in requestAnimationFrame (readSpectrum / bindLevel).

type Provider = "elevenlabs" | "browser";

interface VoiceStore {
  /** spoken replies on (header speaker toggle) */
  output: boolean;
  /** hands-free conversation mode */
  live: boolean;
  speaking: boolean;
  listening: boolean;
  /** Tony's words as recognised so far */
  heard: string;
  /** the line JARVIS is speaking right now */
  caption: string;
  captionAt: number;
  provider: Provider;
  /** why ElevenLabs was dropped for this session, if it was */
  degraded?: string;
  micError?: string;
}

const OUTPUT_KEY = "jarvis-voice";

export const useVoice = create<VoiceStore>(() => ({
  output: false,
  live: false,
  speaking: false,
  listening: false,
  heard: "",
  caption: "",
  captionAt: 0,
  provider: "browser",
}));

const set = useVoice.setState;
const get = useVoice.getState;

/* ─────────────────────────── audio graph ─────────────────────────── */

let ctx: AudioContext | undefined;
let audioEl: HTMLAudioElement | undefined;
let outAnalyser: AnalyserNode | undefined;
let micAnalyser: AnalyserNode | undefined;
let micStream: MediaStream | undefined;

/** Must run inside a user gesture the first time (autoplay policy). */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    audioEl = new Audio();
    audioEl.preload = "auto";
    const src = ctx.createMediaElementSource(audioEl);
    outAnalyser = ctx.createAnalyser();
    outAnalyser.fftSize = 256;
    outAnalyser.smoothingTimeConstant = 0.72;
    src.connect(outAnalyser);
    outAnalyser.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
}

/** Fill `into` with the spectrum of whoever is talking. */
export function readSpectrum(into: Uint8Array<ArrayBuffer>): "jarvis" | "tony" | "none" {
  const s = get();
  if (s.speaking && outAnalyser && !browserSpeaking) {
    outAnalyser.getByteFrequencyData(into);
    return "jarvis";
  }
  if (s.speaking && browserSpeaking) {
    // speechSynthesis can't be analysed — synthesise a plausible envelope
    const t = performance.now() / 1000;
    for (let i = 0; i < into.length; i++) into[i] = Math.max(0, 150 * Math.abs(Math.sin(t * 7 + i * 0.5)) * Math.exp(-i / 22) + Math.random() * 30);
    return "jarvis";
  }
  if (s.listening && micAnalyser) {
    micAnalyser.getByteFrequencyData(into);
    return "tony";
  }
  into.fill(0);
  return "none";
}

/* level → CSS var on registered elements (reactor cores) */
const levelEls = new Set<HTMLElement>();
let raf = 0;
let smooth = 0;
const scratch = new Uint8Array(new ArrayBuffer(128));

export function bindLevel(el: HTMLElement | null) {
  if (!el) return;
  levelEls.add(el);
  loop();
  return () => {
    levelEls.delete(el);
  };
}

function loop() {
  if (raf || typeof window === "undefined") return;
  const tick = () => {
    const who = readSpectrum(scratch);
    let sum = 0;
    for (let i = 2; i < 48; i++) sum += scratch[i];
    const target = who === "none" ? 0 : Math.min(1, sum / 46 / 160);
    smooth += (target - smooth) * 0.35;
    for (const el of levelEls) {
      if (!el.isConnected) levelEls.delete(el);
      else el.style.setProperty("--vl", smooth.toFixed(3));
    }
    raf = levelEls.size ? requestAnimationFrame(tick) : 0;
  };
  raf = requestAnimationFrame(tick);
}

/* ─────────────────────────── sound FX ─────────────────────────── */

/** Tiny synthesised HUD chirps — no assets. */
export function blip(kind: "listen" | "ack" | "end") {
  if (!ctx || ctx.state !== "running") return;
  const notes = kind === "listen" ? [660, 990] : kind === "ack" ? [1320] : [880, 520];
  notes.forEach((f, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    const t = ctx!.currentTime + i * 0.07;
    o.type = "sine";
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(ctx!.destination);
    o.start(t);
    o.stop(t + 0.1);
  });
}

/* ─────────────────────────── speech output ─────────────────────────── */

interface Utterance {
  text: string;
  audio?: Promise<Response | null>;
}

const queue: Utterance[] = [];
let pumping = false;
let generation = 0;
let fetchAbort = new AbortController();
let stopCurrent: (() => void) | undefined;
let browserSpeaking = false;

const enabled = () => get().output || get().live;

/** Queue a line for JARVIS to speak (no-op while voice is off). */
export function say(text: string) {
  const clean = text.trim();
  if (!clean || typeof window === "undefined" || !enabled()) return;
  stopListening(); // half-duplex: never transcribe ourselves
  queue.push({ text: clean });
  prefetch();
  if (!pumping) void pump();
}

/** Shut up now (barge-in / mute). Live mode resumes listening. */
export function hush() {
  generation++;
  queue.length = 0;
  fetchAbort.abort();
  fetchAbort = new AbortController();
  stopCurrent?.();
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

function prefetch() {
  // current + at most one ahead, so a long multi-step narration doesn't burn credits up front
  for (const u of queue.slice(0, 1)) if (!u.audio && get().provider === "elevenlabs") u.audio = fetchTts(u.text, fetchAbort.signal);
}

async function fetchTts(text: string, signal: AbortSignal): Promise<Response | null> {
  try {
    const res = await fetch("/api/voice/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });
    if (res.ok && res.headers.get("content-type")?.includes("audio")) return res;
    const json = await res.json().catch(() => undefined);
    const code: string | undefined = json?.error?.code;
    if (code === "RATE_LIMITED" || code === "NOT_CONFIGURED") {
      set({ provider: "browser", degraded: json?.error?.message ?? code });
    }
    return null;
  } catch {
    return null;
  }
}

async function pump() {
  pumping = true;
  set({ speaking: true });
  while (queue.length) {
    const u = queue.shift()!;
    const gen = generation;
    prefetch();
    try {
      const res = u.audio ? await u.audio : null;
      if (gen !== generation) continue;
      if (res?.body) await playStream(res, u.text, gen);
      else await browserSay(u.text, gen);
    } catch {
      /* a failed line shouldn't kill the queue */
    }
  }
  pumping = false;
  set({ speaking: false, caption: "" });
  if (get().live) {
    announcedListening = false; // chirp = "your turn, sir"
    setTimeout(listen, 280);
  }
}

function showCaption(text: string) {
  set({ caption: text.replace(/J\.A\.R\.V\.I\.S\.?/g, "JARVIS"), captionAt: performance.now() });
}

async function playStream(res: Response, text: string, gen: number) {
  unlockAudio();
  if (ctx!.state !== "running") {
    await Promise.race([ctx!.resume().catch(() => undefined), new Promise((r) => setTimeout(r, 300))]);
    if ((ctx!.state as AudioContextState) !== "running") {
      void res.body?.cancel();
      return browserSay(text, gen); // no user gesture yet — the graph would play silence
    }
  }
  const el = audioEl!;
  const ended = new Promise<void>((resolve) => {
    const done = () => {
      el.removeEventListener("ended", done);
      el.removeEventListener("error", done);
      stopCurrent = undefined;
      resolve();
    };
    el.addEventListener("ended", done);
    el.addEventListener("error", done);
    stopCurrent = () => {
      el.pause();
      done();
    };
  });

  const canStream = typeof MediaSource !== "undefined" && MediaSource.isTypeSupported("audio/mpeg");
  let url: string;
  if (canStream) {
    const ms = new MediaSource();
    url = URL.createObjectURL(ms);
    el.src = url;
    await new Promise((r) => ms.addEventListener("sourceopen", r, { once: true }));
    const sb = ms.addSourceBuffer("audio/mpeg");
    const reader = res.body!.getReader();
    let started = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (gen !== generation) {
        void reader.cancel();
        break;
      }
      if (done) break;
      await new Promise((r) => {
        sb.addEventListener("updateend", r, { once: true });
        sb.appendBuffer(value);
      });
      if (!started) {
        started = true;
        showCaption(text);
        el.play().catch(() => stopCurrent?.());
      }
    }
    if (ms.readyState === "open" && !sb.updating) ms.endOfStream();
    if (!started) stopCurrent?.();
  } else {
    url = URL.createObjectURL(await res.blob());
    el.src = url;
    showCaption(text);
    el.play().catch(() => stopCurrent?.());
  }
  await ended;
  URL.revokeObjectURL(url);
}

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((v) => /en-GB/i.test(v.lang) && /male|daniel|george|arthur|ryan/i.test(v.name)) ??
    voices.find((v) => /en-GB/i.test(v.lang)) ??
    voices.find((v) => /^en/i.test(v.lang))
  );
}

function browserSay(text: string, gen: number) {
  if (typeof speechSynthesis === "undefined" || gen !== generation) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text.replace(/J\.A\.R\.V\.I\.S\.?/g, "Jarvis").replace(/[\p{Extended_Pictographic}]/gu, ""));
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.04;
    u.pitch = 0.9;
    const done = () => {
      browserSpeaking = false;
      resolve();
    };
    u.onend = done;
    u.onerror = done;
    browserSpeaking = true;
    showCaption(text);
    speechSynthesis.speak(u);
  });
}

/* ─────────────────────────── speech input (live mode) ─────────────────────────── */

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

export function recognitionCtor(): (new () => Recognition) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

let rec: Recognition | undefined;
/** Pause after Tony's last word before the order is sent. */
const END_OF_SPEECH_MS = 1100;
let errorStreak: number[] = [];
let announcedListening = false;

function stopListening() {
  if (!rec) return;
  const r = rec;
  rec = undefined;
  r.onend = null;
  r.onresult = null;
  r.abort();
  set({ listening: false, heard: "" });
}

function listen() {
  const s = get();
  if (!s.live || s.speaking || pumping || rec) return;
  const Ctor = recognitionCtor();
  if (!Ctor) {
    set({ live: false, micError: "Speech recognition needs Chrome or Edge, sir." });
    return;
  }
  const r = new Ctor();
  r.lang = "en-IN";
  r.interimResults = true;
  // continuous + our own end-of-speech timer: Chrome's single-shot mode cuts a long
  // multi-step order off at the first breath ("…at 6 PM, [pause] remind me…").
  r.continuous = true;
  r.maxAlternatives = 1;
  let finalText = "";
  let allText = "";
  let silence: ReturnType<typeof setTimeout> | undefined;
  r.onresult = (e) => {
    let text = "";
    let fin = "";
    let pendingInterim = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (e.results[i].isFinal) fin += e.results[i][0].transcript;
      else pendingInterim = true;
    }
    finalText = fin;
    allText = text;
    set({ heard: text });
    clearTimeout(silence);
    silence = setTimeout(() => r.stop(), pendingInterim ? 2200 : END_OF_SPEECH_MS);
  };
  r.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
      setLive(false, "Microphone access was blocked, sir.");
      return;
    }
    if (e.error !== "no-speech" && e.error !== "aborted") {
      const now = Date.now();
      errorStreak = [...errorStreak.filter((t) => now - t < 10_000), now];
      if (errorStreak.length >= 4) setLive(false, `Voice link unstable (${e.error}).`);
    }
  };
  r.onend = () => {
    if (rec !== r) return;
    rec = undefined;
    clearTimeout(silence);
    set({ listening: false });
    const text = (finalText.trim() || allText).trim();
    if (text) {
      blip("ack");
      hear(text);
    }
    set({ heard: "" });
    if (get().live && !pumping) setTimeout(listen, text ? 120 : 60);
  };
  rec = r;
  set({ listening: true });
  if (!announcedListening) {
    announcedListening = true;
    blip("listen");
  }
  try {
    r.start();
  } catch {
    rec = undefined;
    set({ listening: false });
  }
}

const YES = /^(yes|yeah|yep|yup|confirm(ed)?|go ahead|do it|proceed|affirmative|approved?|send it|make it so|sure|ok(ay)?|go|execute|authori[sz]e(d)?)\b/;
const ALL = /\b(all|everything)\b/;
const NO = /^(no|nope|cancel|abort|stop|stand down|negative|don'?t|belay)/;
const STOP = /^(stop|cancel|abort|stand down|belay that|never ?mind|hold on)( that| it| everything)?$/;

/**
 * Route one spoken utterance. Runs BEFORE submit(): during a confirmation `awaitingInputFor`
 * is unset, so "confirm" would otherwise become a brand-new command.
 */
export function hear(raw: string) {
  const text = raw.trim().replace(/^((hey|ok(ay)?|hi)\s+)?jarvis[\s,.!]*/i, "").trim();
  const norm = text.toLowerCase().replace(/[.!?,]/g, "").trim();
  const q = useQueue.getState();

  if (!norm) {
    say("Sir?");
    return;
  }
  if (q.pending) {
    const key = `${q.pending.commandId}:${q.pending.stepId}`;
    if (q.pending.type === "confirm") {
      if (/^skip/.test(norm)) return resolveInteraction(key, { type: "skip" });
      if (NO.test(norm)) return resolveInteraction(key, { type: "cancel" });
      if (YES.test(norm) || /^(approve|confirm|authori[sz]e) all/.test(norm))
        return resolveInteraction(key, { type: "approve", all: ALL.test(norm) });
      say("Say confirm, or cancel, sir.");
      return;
    }
    if (NO.test(norm)) return resolveInteraction(key, { type: "cancel" });
    say("Choose the file on screen, sir.");
    return;
  }
  if (q.currentId && STOP.test(norm)) return interrupt();
  // a bare "yes" / "confirm" / "cancel" with nothing awaiting authorisation is not an order
  if (!q.awaitingInputFor && norm.split(" ").length <= 3 && (YES.test(norm) || NO.test(norm))) return;
  if (/^(mute|silence|quiet|be quiet|shut up)$/.test(norm)) return hush();
  if (/^(stop listening|go to sleep|end (the )?(voice|conversation|link)|that'?s all|goodbye|bye( jarvis)?)$/.test(norm)) {
    say("Standing by, sir.");
    set({ live: false });
    teardownMic();
    return;
  }
  // background noise / stray syllables — unless JARVIS just asked a question
  if (norm.length < 3 && !q.awaitingInputFor) return;
  submit(text);
}

export async function setLive(on: boolean, reason?: string) {
  if (!on) {
    set({ live: false, micError: reason });
    stopListening();
    teardownMic();
    blip("end");
    return;
  }
  unlockAudio(); // inside the click — unlocks autoplay
  set({ live: true, micError: undefined });
  announcedListening = false;
  errorStreak = [];
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    micAnalyser = ctx!.createAnalyser();
    micAnalyser.fftSize = 256;
    micAnalyser.smoothingTimeConstant = 0.6;
    ctx!.createMediaStreamSource(micStream).connect(micAnalyser);
  } catch {
    setLive(false, "Microphone access was blocked, sir.");
    return;
  }
  loop();
  say("Voice link established. I'm listening, sir.");
}

function teardownMic() {
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = undefined;
  micAnalyser = undefined;
}

/** Space / reactor click: cut JARVIS off and hand Tony the floor. */
export function bargeIn() {
  if (get().speaking) {
    hush();
    announcedListening = false;
  } else if (get().live && !rec) {
    listen();
  }
}

/* ─────────────────────────── output toggle + narration ─────────────────────────── */

let gestureHooked = false;

export function initVoice(provider: Provider) {
  let output = false;
  try {
    output = localStorage.getItem(OUTPUT_KEY) === "on";
  } catch {
    /* storage blocked */
  }
  set((s) => ({ output, provider: s.degraded ? "browser" : provider }));
  // Autoplay policy: an AudioContext created outside a gesture stays suspended (silent audio).
  // Unlock on the first interaction anywhere so replies to typed commands are audible too.
  if (!gestureHooked) {
    gestureHooked = true;
    const unlock = () => {
      unlockAudio();
      if (ctx?.state === "running") {
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }
  if (process.env.NODE_ENV !== "production") {
    (window as unknown as Record<string, unknown>).__jarvisVoice = { hear, say, hush, setLive, state: get, store: useVoice };
  }
}

export function setOutput(on: boolean) {
  try {
    localStorage.setItem(OUTPUT_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
  unlockAudio();
  set({ output: on });
  if (on) say("Voice systems online, sir.");
  else if (!get().live) hush();
}
