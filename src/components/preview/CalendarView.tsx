"use client";
import { useMemo, useState } from "react";
import { useNow } from "@/hooks/useNow";
import { Bell, CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { usePreview } from "@/store/preview";
import { useFeed } from "@/hooks/useFeed";
import type { CalendarEvent, Reminder } from "@/lib/types";
import { cn } from "@/lib/cn";
import { FeedError, FeedLoading } from "./FeedState";

// Calendar preview (BUILD_SPEC 2.1): next 7 days grouped by day, NOW marker,
// personal reminders overlaid in gold so events vs reminders are visibly distinct (2.2).

type Item =
  | { kind: "event"; at: number; ev: CalendarEvent }
  | { kind: "reminder"; at: number; r: Reminder };

const dayKey = (d: Date) => d.toLocaleDateString("en-CA");
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

function dayLabel(d: Date) {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (dayKey(d) === dayKey(today)) return "Today";
  if (dayKey(d) === dayKey(tomorrow)) return "Tomorrow";
  return d.toLocaleDateString("en-IN", { weekday: "long" });
}

export function CalendarView() {
  const version = usePreview((s) => s.version.calendar);
  const remVersion = usePreview((s) => s.version.reminders);
  const highlightId = usePreview((s) => s.highlightId);

  const [range] = useState(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from: from.toISOString(), to: to.toISOString() };
  });

  const events = useFeed<CalendarEvent[]>(`/api/calendar/events?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`, version, 60_000);
  const reminders = useFeed<Reminder[]>("/api/reminders?range=upcoming", version + remVersion);

  const now = useNow();

  const days = useMemo(() => {
    const items: Item[] = [
      ...(events.data ?? []).map((ev) => ({ kind: "event" as const, at: Date.parse(ev.start), ev })),
      ...(reminders.data ?? [])
        .filter((r) => Date.parse(r.dueAt) < Date.parse(range.to))
        .map((r) => ({ kind: "reminder" as const, at: Date.parse(r.dueAt), r })),
    ].sort((a, b) => a.at - b.at);
    const map = new Map<string, Item[]>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(range.from);
      d.setDate(d.getDate() + i);
      map.set(dayKey(d), []);
    }
    for (const it of items) map.get(dayKey(new Date(it.at)))?.push(it);
    return [...map.entries()];
  }, [events.data, reminders.data, range]);

  if (events.loading && !events.data) return <FeedLoading label="Syncing Stark calendar…" />;
  if (events.error && !events.data) return <FeedError error={events.error} onRetry={events.reload} />;

  const total = events.data?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="hud-label text-cyan">Next 7 days · {total} event{total === 1 ? "" : "s"}</span>
        <span className="ml-auto flex items-center gap-1">
          <CalendarDays className="size-3 text-cyan" /> Calendar event
        </span>
        <span className="flex items-center gap-1">
          <Bell className="size-3 text-gold" /> Personal reminder
        </span>
      </div>

      {days.map(([key, items]) => {
        const d = new Date(`${key}T00:00:00`);
        const isToday = key === dayKey(new Date());
        let nowShown = !isToday;
        return (
          <section key={key}>
            <h3 className={cn("hud-label mb-2 flex items-baseline gap-2", isToday ? "text-primary" : "text-muted")}>
              {dayLabel(d)}
              <span className="font-mono text-[0.6rem] tracking-normal text-muted">
                {d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            </h3>
            {items.length === 0 && <p className="mb-1 pl-3 text-xs text-muted/60">— clear —</p>}
            <ul className="space-y-1.5">
              {items.map((it) => {
                const marker =
                  !nowShown && it.at > now ? (
                    (nowShown = true) && (
                      <li key="now" className="flex items-center gap-2 text-[0.6rem] text-red">
                        <span className="hud-label">Now</span>
                        <span className="h-px flex-1 bg-red/60" />
                      </li>
                    )
                  ) : null;
                const id = it.kind === "event" ? it.ev.id : it.r.id;
                const hl = highlightId === id;
                const past = it.at < now;
                return [
                  marker,
                  it.kind === "event" ? (
                    <li
                      key={id}
                      className={cn("rounded-sm border border-l-2 border-line border-l-cyan bg-cyan/5 px-3 py-2", hl && "highlight-pulse", past && "opacity-50")}
                      style={{ ["--hl" as string]: "var(--cyan)" }}
                    >
                      <div className="flex items-start gap-2">
                        <span className="w-16 shrink-0 font-mono text-xs text-cyan">{it.ev.allDay ? "ALL DAY" : time(it.ev.start)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{it.ev.title}</p>
                          {!it.ev.allDay && <p className="font-mono text-[0.65rem] text-muted">until {time(it.ev.end)}</p>}
                          {it.ev.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{it.ev.description}</p>}
                          {it.ev.location && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                              <MapPin className="size-3" /> {it.ev.location}
                            </p>
                          )}
                        </div>
                        {it.ev.htmlLink && (
                          <a href={it.ev.htmlLink} target="_blank" rel="noreferrer" aria-label="Open in Google Calendar" className="text-muted hover:text-cyan">
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </div>
                    </li>
                  ) : (
                    <li
                      key={id}
                      className={cn("flex items-center gap-2 rounded-sm border border-dashed border-gold/40 px-3 py-1.5", hl && "highlight-pulse", past && "opacity-50")}
                      style={{ ["--hl" as string]: "var(--gold)" }}
                    >
                      <span className="w-16 shrink-0 font-mono text-xs text-gold">{time(it.r.dueAt)}</span>
                      <Bell className="size-3 text-gold" />
                      <span className="text-sm text-gold/90">{it.r.text}</span>
                    </li>
                  ),
                ];
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
