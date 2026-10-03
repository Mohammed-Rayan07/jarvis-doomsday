"use client";
import { Bell, Check, Clock, Trash2 } from "lucide-react";
import { usePreview } from "@/store/preview";
import { useFeed } from "@/hooks/useFeed";
import type { Reminder } from "@/lib/types";
import { cn } from "@/lib/cn";
import { FeedError, FeedLoading } from "./FeedState";
import { useNow } from "@/hooks/useNow";

// Reminders preview (BUILD_SPEC 2.2): Overdue / Today / Upcoming / Done, with quick actions.

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const snoozeTarget = () => new Date(Date.now() + 10 * 60_000).toISOString();

export function RemindersView() {
  const version = usePreview((s) => s.version.reminders);
  const highlightId = usePreview((s) => s.highlightId);
  const refresh = usePreview((s) => s.refresh);
  const { data, error, loading, reload } = useFeed<Reminder[]>("/api/reminders?range=all", version, 30_000);
  const now = useNow();

  if (loading && !data) return <FeedLoading label="Loading reminders…" />;
  if (error && !data) return <FeedError error={error} onRetry={reload} />;

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const all = data ?? [];
  const active = all.filter((r) => r.status === "active");
  const groups: [string, Reminder[], string][] = [
    ["Overdue", active.filter((r) => Date.parse(r.dueAt) < now), "var(--red)"],
    ["Today", active.filter((r) => Date.parse(r.dueAt) >= now && Date.parse(r.dueAt) <= endOfToday.getTime()), "var(--gold)"],
    ["Upcoming", active.filter((r) => Date.parse(r.dueAt) > endOfToday.getTime()), "var(--gold)"],
    ["Done", all.filter((r) => r.status === "done").slice(-5).reverse(), "var(--muted)"],
  ];

  const act = async (r: Reminder, action: "done" | "snooze" | "delete") => {
    if (action === "delete") await fetch(`/api/reminders/${r.id}`, { method: "DELETE" });
    else
      await fetch(`/api/reminders/${r.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          action === "done" ? { status: "done" } : { dueAt: snoozeTarget(), firedAt: null },
        ),
      });
    refresh("reminders");
    refresh("calendar");
  };

  if (!all.length)
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-muted">
        <Bell className="size-6 text-gold" />
        <p className="hud-label text-gold">No reminders</p>
        <p className="text-xs">Try: &ldquo;Remind me to check the Mark 50 at 7 PM.&rdquo;</p>
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="hud-label text-gold">
        Personal reminders · {active.length} active
      </p>
      {groups.map(([label, list, color]) =>
        list.length ? (
          <section key={label}>
            <h3 className="hud-label mb-2" style={{ color }}>
              {label} · {list.length}
            </h3>
            <ul className="space-y-1.5">
              {list.map((r) => (
                <li
                  key={r.id}
                  className={cn(
                    "group flex items-center gap-3 rounded-sm border border-l-2 border-line bg-gold/5 px-3 py-2",
                    highlightId === r.id && "highlight-pulse",
                    r.status === "done" && "opacity-50",
                  )}
                  style={{ borderLeftColor: color, ["--hl" as string]: "var(--gold)" }}
                >
                  <Bell className="size-3.5 shrink-0" style={{ color }} />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", r.status === "done" && "line-through")}>{r.text}</p>
                    <p className="font-mono text-[0.65rem] text-muted">
                      {fmt(r.dueAt)}
                      {r.firedAt && r.status === "active" && " · fired"}
                      {r.source === "jarvis" && " · via JARVIS"}
                    </p>
                  </div>
                  {r.status === "active" && (
                    <div className="flex gap-1.5 opacity-70 group-hover:opacity-100">
                      <button onClick={() => act(r, "done")} aria-label="Mark done" title="Done" className="text-muted hover:text-primary">
                        <Check className="size-4" />
                      </button>
                      <button onClick={() => act(r, "snooze")} aria-label="Snooze 10 minutes" title="Snooze 10 min" className="text-muted hover:text-gold">
                        <Clock className="size-4" />
                      </button>
                      <button onClick={() => act(r, "delete")} aria-label="Delete" title="Delete" className="text-muted hover:text-red">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}
