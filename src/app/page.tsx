"use client";
import { useState } from "react";
import { StatusBar } from "@/components/hud/StatusBar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { PreviewPane } from "@/components/preview/PreviewPane";
import { usePreview } from "@/store/preview";
import { cn } from "@/lib/cn";

// Command centre: split-screen chat ⇄ live preview; segmented toggle on mobile (BUILD_SPEC §9.1).

export default function CommandCentre() {
  const [mobileView, setMobileView] = useState<"chat" | "preview">("chat");
  const unseen = usePreview((s) => s.unseen);
  const markSeen = usePreview((s) => s.markSeen);

  return (
    <main className="mx-auto flex h-dvh max-w-[1600px] flex-col gap-3 p-2 md:p-4">
      <StatusBar />

      <div className="flex gap-1 lg:hidden" role="tablist">
        {(["chat", "preview"] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={mobileView === v}
            onClick={() => {
              setMobileView(v);
              if (v === "preview") markSeen();
            }}
            className={cn("hud-label relative flex-1 border py-2", mobileView === v ? "border-primary text-primary" : "border-line text-muted")}
          >
            {v === "chat" ? "Comms link" : "Live preview"}
            {v === "preview" && unseen && mobileView !== "preview" && <span className="absolute top-1.5 right-3 size-2 rounded-full bg-gold" />}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className={cn("min-h-0 flex-col lg:flex lg:w-[46%]", mobileView === "chat" ? "flex w-full" : "hidden")}>
          <ChatPanel />
        </div>
        <div className={cn("min-h-0 flex-col lg:flex lg:w-[54%]", mobileView === "preview" ? "flex w-full" : "hidden")}>
          <PreviewPane />
        </div>
      </div>
    </main>
  );
}
