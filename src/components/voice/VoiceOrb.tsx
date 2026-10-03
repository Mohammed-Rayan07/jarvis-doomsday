"use client";
import { useEffect, useRef } from "react";
import { readSpectrum } from "@/engine/voice";

// Arc-reactor voice orb: radial spectrum of whoever is talking (JARVIS = green, Tony = cyan),
// spinning arc segments while thinking, breathing at rest. Pure canvas + rAF, no React re-renders.

const GREEN = "61,255,154";
const CYAN = "77,225,255";
const GOLD = "255,194,75";
const BARS = 56;

export function VoiceOrb({ size = 136, mode, onClick }: { size?: number; mode: "thinking" | "awaiting" | "idle"; onClick?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = size * dpr;
    el.height = size * dpr;
    const c = el.getContext("2d")!;
    c.scale(dpr, dpr);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const buf = new Uint8Array(new ArrayBuffer(128));
    const vals = new Float32Array(BARS);
    let raf = 0;
    let level = 0;

    const draw = (now: number) => {
      const t = reduced ? 0 : now / 1000;
      const who = readSpectrum(buf);
      const m = modeRef.current;
      const rgb = who === "jarvis" ? GREEN : who === "tony" ? CYAN : m === "awaiting" ? GOLD : m === "thinking" ? CYAN : GREEN;
      const cx = size / 2;
      const cy = size / 2;
      const r0 = size * 0.25;

      // smoothed, mirrored spectrum (speech energy lives in the low bins)
      let sum = 0;
      for (let i = 0; i < BARS; i++) {
        const half = i < BARS / 2 ? i : BARS - 1 - i;
        const raw = who === "none" ? 0.05 + 0.035 * Math.sin(t * 2.2 + i * 0.45) : buf[2 + half * 2] / 255;
        vals[i] += (raw - vals[i]) * 0.4;
        sum += vals[i];
      }
      level += (sum / BARS - level) * 0.3;

      c.clearRect(0, 0, size, size);

      // outer tick ring
      c.save();
      c.translate(cx, cy);
      c.rotate(t * 0.15);
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const long = i % 6 === 0;
        c.strokeStyle = `rgba(${rgb},${long ? 0.55 : 0.22})`;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(Math.cos(a) * (size * 0.47), Math.sin(a) * (size * 0.47));
        c.lineTo(Math.cos(a) * (size * (long ? 0.43 : 0.45)), Math.sin(a) * (size * (long ? 0.43 : 0.45)));
        c.stroke();
      }
      c.restore();

      // spinning arc segments — fast while thinking
      const spin = m === "thinking" && who === "none" ? 3.2 : 0.6;
      c.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        const start = t * spin * (k % 2 ? -1 : 1) + (k * Math.PI * 2) / 3;
        c.strokeStyle = `rgba(${rgb},${0.35 + 0.2 * k})`;
        c.beginPath();
        c.arc(cx, cy, size * (0.2 - k * 0.012), start, start + Math.PI * 0.42);
        c.stroke();
      }

      // radial spectrum bars
      c.save();
      c.translate(cx, cy);
      c.rotate(-Math.PI / 2 + t * 0.05);
      c.shadowColor = `rgba(${rgb},0.9)`;
      c.shadowBlur = 8;
      c.lineCap = "round";
      for (let i = 0; i < BARS; i++) {
        const a = (i / BARS) * Math.PI * 2;
        const len = 2 + vals[i] * size * 0.17;
        c.strokeStyle = `rgba(${rgb},${0.35 + vals[i] * 0.65})`;
        c.lineWidth = 2.2;
        c.beginPath();
        c.moveTo(Math.cos(a) * (r0 + 2), Math.sin(a) * (r0 + 2));
        c.lineTo(Math.cos(a) * (r0 + 2 + len), Math.sin(a) * (r0 + 2 + len));
        c.stroke();
      }
      c.restore();

      // reactor core
      const coreR = size * (0.1 + level * 0.09);
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, coreR * 1.8);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.35, `rgba(${rgb},0.85)`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = g;
      c.beginPath();
      c.arc(cx, cy, coreR * 1.8, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = `rgba(${rgb},0.8)`;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(cx, cy, r0 - 4, 0, Math.PI * 2);
      c.stroke();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <button onClick={onClick} aria-label="Interrupt JARVIS / start listening" className="shrink-0 cursor-pointer rounded-full" style={{ width: size, height: size }}>
      <canvas ref={canvas} style={{ width: size, height: size }} />
    </button>
  );
}
