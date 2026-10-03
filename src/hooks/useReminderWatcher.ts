"use client";
import { useEffect } from "react";
import { toast } from "sonner";
import { usePreview } from "@/store/preview";
import type { Reminder } from "@/lib/types";
import { speak } from "./useVoice";

// "Don't let Tony forget" (BUILD_SPEC 2.2 bonus): poll for due reminders while the tab is open,
// fire a toast + browser notification + spoken line, then mark them fired.
// The server also pings Tony on Telegram when the reminder was created with notifyTelegram.

const POLL_MS = 20_000;

export function useReminderWatcher() {
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      // Ask lazily on first user interaction so the browser doesn't block the prompt.
      const ask = () => void Notification.requestPermission().catch(() => undefined);
      window.addEventListener("pointerdown", ask, { once: true });
    }

    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch("/api/reminders?due=1", { cache: "no-store" });
        const json = await res.json();
        if (!json.ok || stopped) return;
        for (const r of json.data as Reminder[]) fire(r);
        if ((json.data as Reminder[]).length) {
          usePreview.getState().refresh("reminders");
          usePreview.getState().refresh("calendar");
        }
      } catch {
        /* offline — try again next tick */
      }
    };

    void check();
    const id = setInterval(check, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);
}

function fire(r: Reminder) {
  const line = `Sir, a reminder: ${r.text}.`;
  toast(`⏰ ${r.text}`, {
    description: "Reminder from J.A.R.V.I.S.",
    duration: 15_000,
    action: {
      label: "Done",
      onClick: () =>
        void fetch(`/api/reminders/${r.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "done" }),
        }).then(() => usePreview.getState().refresh("reminders")),
    },
  });
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification("J.A.R.V.I.S. reminder", { body: r.text, tag: r.id });
    } catch {
      /* some browsers disallow constructor notifications */
    }
  }
  speak(line);
  void fetch(`/api/reminders/${r.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ firedAt: new Date().toISOString(), fire: true }),
  });
}
