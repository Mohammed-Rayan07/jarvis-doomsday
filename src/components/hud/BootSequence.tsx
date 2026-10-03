"use client";
import { useEffect, useState } from "react";
import { ArcReactor } from "./ArcReactor";
import { useStatus } from "@/store/status";

// One-time-per-session boot overlay (BUILD_SPEC §9.2). Click / any key skips. ≤ ~2 s.

const KEY = "jarvis-booted";

export function BootSequence() {
  const status = useStatus((s) => s.status);
  const [show, setShow] = useState(false);
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(KEY) === "1";
    } catch {
      /* storage blocked — just boot */
    }
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setShow(true), 0);
    return () => clearTimeout(t);
  }, []);

  const lines: [string, string, "ok" | "warn" | "off"][] = [
    ["Initialising J.A.R.V.I.S. core", "OK", "ok"],
    ["AI cognition matrix", status ? (status.ai.mode === "llm" ? "ONLINE" : "BACKUP") : "…", status?.ai.mode === "llm" ? "ok" : "warn"],
    ["Stark calendar uplink", status ? (status.google.connected ? "LINKED" : "STANDBY") : "…", status?.google.connected ? "ok" : "warn"],
    ["Stark Archive (Drive)", status ? (status.google.connected ? "LINKED" : "STANDBY") : "…", status?.google.connected ? "ok" : "warn"],
    ["Comms grid (Telegram)", status ? (status.telegram.ok ? "LINKED" : "OFFLINE") : "…", status?.telegram.ok ? "ok" : "off"],
    ["Doomsday protocol", "ARMED", "ok"],
  ];

  useEffect(() => {
    if (!show) return;
    const tick = setInterval(() => setVisible((v) => v + 1), 230);
    const done = setTimeout(close, 230 * (lines.length + 3));
    const skip = () => close();
    window.addEventListener("keydown", skip);
    return () => {
      clearInterval(tick);
      clearTimeout(done);
      window.removeEventListener("keydown", skip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  function close() {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  if (!show) return null;
  return (
    <div onClick={close} className="boot-fade fixed inset-0 z-40 flex cursor-pointer items-center justify-center backdrop-blur-sm" style={{ background: "rgba(2, 7, 5, 0.97)" }}>
      <div className="w-[min(92vw,440px)] space-y-5">
        <div className="flex items-center gap-4">
          <ArcReactor state="processing" size={64} />
          <div>
            <p className="font-display text-2xl font-black tracking-[0.35em] text-primary glow">J.A.R.V.I.S.</p>
            <p className="hud-label text-muted">Doomsday edition · Stark Industries</p>
          </div>
        </div>
        <ul className="space-y-1.5 font-mono text-xs">
          {lines.slice(0, visible).map(([label, value, tone]) => (
            <li key={label} className="msg-in flex items-center gap-2">
              <span className="text-muted">›</span>
              <span>{label}</span>
              <span className="mx-1 flex-1 border-b border-dotted border-line" />
              <span className={tone === "ok" ? "text-primary" : tone === "warn" ? "text-gold" : "text-red"}>{value}</span>
            </li>
          ))}
        </ul>
        <div className="h-0.5 overflow-hidden bg-white/5">
          <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${Math.min(100, (visible / lines.length) * 100)}%`, boxShadow: "0 0 10px var(--primary)" }} />
        </div>
        <p className="hud-label text-center text-[0.55rem] text-muted">Click or press any key to skip</p>
      </div>
    </div>
  );
}
