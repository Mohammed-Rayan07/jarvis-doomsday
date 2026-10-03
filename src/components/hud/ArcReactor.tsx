"use client";
import { cn } from "@/lib/cn";

export type ReactorState = "online" | "processing" | "awaiting" | "degraded" | "offline";

const COLORS: Record<ReactorState, string> = {
  online: "var(--primary)",
  processing: "var(--cyan)",
  awaiting: "var(--gold)",
  degraded: "var(--gold)",
  offline: "var(--red)",
};

/** Animated arc-reactor orb. Ring speed reflects activity (BUILD_SPEC §9.2). */
export function ArcReactor({ state = "online", size = 40, className }: { state?: ReactorState; size?: number; className?: string }) {
  const color = COLORS[state];
  const speed = state === "processing" ? "1.2s" : "6s";
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }} aria-hidden>
      <div
        className="absolute inset-0 rounded-full border-2 border-dashed"
        style={{ borderColor: color, opacity: 0.7, animation: `spin ${speed} linear infinite` }}
      />
      <div
        className="absolute inset-[18%] rounded-full border"
        style={{ borderColor: color, opacity: 0.5, animation: `spin-rev ${speed} linear infinite` }}
      />
      <div
        className="absolute inset-[32%] rounded-full"
        style={{ background: `radial-gradient(circle, #fff 0%, ${color} 45%, transparent 75%)`, boxShadow: `0 0 18px ${color}` }}
      />
    </div>
  );
}
