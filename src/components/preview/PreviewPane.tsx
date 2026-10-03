"use client";
import { useEffect, useState } from "react";
import { Archive, Bell, CalendarDays, MessageSquare, ScrollText } from "lucide-react";
import { usePreview } from "@/store/preview";
import type { ActionLogEntry, PreviewTab } from "@/lib/types";
import { cn } from "@/lib/cn";
import { CalendarView } from "./CalendarView";
import { RemindersView } from "./RemindersView";

// LIVE INTEGRATION PREVIEW PANE (BUILD_SPEC 1.1, §9). Each view is filled in its phase:
// Calendar P2 · Reminders P3 · Archive P4 · Comms P5. LOG works now.

const TABS: { id: PreviewTab; label: string; icon: React.ReactNode; color: string }[] = [
  { id: "calendar", label: "Calendar", icon: <CalendarDays className="size-3.5" />, color: "var(--cyan)" },
  { id: "reminders", label: "Reminders", icon: <Bell className="size-3.5" />, color: "var(--gold)" },
  { id: "drive", label: "Archive", icon: <Archive className="size-3.5" />, color: "var(--violet)" },
  { id: "comms", label: "Comms", icon: <MessageSquare className="size-3.5" />, color: "var(--telegram)" },
  { id: "log", label: "Log", icon: <ScrollText className="size-3.5" />, color: "var(--primary)" },
];

export function PreviewPane() {
  const tab = usePreview((s) => s.tab);
  const setTab = usePreview((s) => s.setTab);

  return (
    <section className="hud-panel flex min-h-0 flex-1 flex-col">
      <nav className="flex overflow-x-auto border-b border-line" role="tablist" aria-label="Live preview">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn("hud-label flex items-center gap-1.5 border-b-2 px-3 py-2.5 whitespace-nowrap transition-colors", tab === t.id ? "text-text" : "border-transparent text-muted hover:text-text")}
            style={tab === t.id ? { borderColor: t.color, color: t.color } : undefined}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
        <span className="hud-label ml-auto hidden items-center px-3 text-[0.55rem] text-muted lg:flex">Live preview</span>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "calendar" ? (
          <CalendarView />
        ) : tab === "reminders" ? (
          <RemindersView />
        ) : tab === "log" ? (
          <ActionLogView />
        ) : (
          <Placeholder tab={tab} />
        )}
      </div>
    </section>
  );
}

function Placeholder({ tab }: { tab: PreviewTab }) {
  const t = TABS.find((x) => x.id === tab)!;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted">
      <span style={{ color: t.color }}>{t.icon}</span>
      <p className="hud-label" style={{ color: t.color }}>{t.label} feed</p>
      <p className="text-xs">Awaiting uplink. Connect integrations to see live data here.</p>
    </div>
  );
}

function ActionLogView() {
  const version = usePreview((s) => s.version.log);
  const [entries, setEntries] = useState<ActionLogEntry[]>([]);
  useEffect(() => {
    fetch("/api/actions")
      .then((r) => r.json())
      .then((j) => j.ok && setEntries(j.data))
      .catch(() => undefined);
  }, [version]);

  if (!entries.length) return <p className="text-sm text-muted">No actions performed yet, sir.</p>;
  return (
    <ul className="space-y-2">
      {entries.map((e) => (
        <li key={e.id} className="rounded-sm border border-line bg-black/30 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className={cn("hud-label text-[0.55rem]", e.status === "done" ? "text-primary" : "text-red")}>{e.status}</span>
            <span className="font-mono text-[0.65rem] text-muted">{e.tool}</span>
            <span className="ml-auto font-mono text-[0.65rem] text-muted">{new Date(e.at).toLocaleTimeString()}</span>
          </div>
          <p>{e.summary}</p>
          <p className="text-xs text-muted">{e.message}</p>
        </li>
      ))}
    </ul>
  );
}
