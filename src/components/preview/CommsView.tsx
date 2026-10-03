"use client";
import { useState } from "react";
import { Check, Copy, RefreshCw, Send, Star, Users, X } from "lucide-react";
import { usePreview } from "@/store/preview";
import { useFeed } from "@/hooks/useFeed";
import type { CommsEntry, Contact } from "@/lib/types";
import { cn } from "@/lib/cn";
import { FeedError, FeedLoading } from "./FeedState";

// Stark Communications (BUILD_SPEC 4.1 / 4.2): transmission history + contact grid.

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", second: "2-digit" });

export function CommsView() {
  const version = usePreview((s) => s.version.comms);
  const highlightId = usePreview((s) => s.highlightId);
  const history = useFeed<CommsEntry[]>("/api/telegram/history", version, 30_000);
  const [expanded, setExpanded] = useState<string>();

  return (
    <div className="space-y-5">
      <ContactGrid version={version} />

      <section>
        <h3 className="hud-label mb-2 flex items-center gap-2 text-telegram">
          <Send className="size-3.5" /> Transmission log
        </h3>
        {history.loading && !history.data ? (
          <FeedLoading label="Loading transmissions…" />
        ) : history.error && !history.data ? (
          <FeedError error={history.error} onRetry={history.reload} />
        ) : !history.data?.length ? (
          <p className="text-sm text-muted">No messages sent yet. Try: &ldquo;Send Bruce a message saying the experiment is postponed.&rdquo;</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="hud-label text-[0.55rem] text-muted">
                <tr className="border-b border-line">
                  <th className="py-1.5 pr-3 font-normal">Recipient</th>
                  <th className="py-1.5 pr-3 font-normal">Message</th>
                  <th className="py-1.5 pr-3 font-normal">Sent</th>
                  <th className="py-1.5 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => setExpanded(expanded === m.id ? undefined : m.id)}
                    className={cn("cursor-pointer border-b border-line/60 align-top hover:bg-white/[0.02]", highlightId === m.id && "highlight-pulse")}
                    style={{ ["--hl" as string]: "var(--telegram)" }}
                  >
                    <td className="py-2 pr-3 whitespace-nowrap">{m.recipientName}</td>
                    <td className="py-2 pr-3">
                      <p className={expanded === m.id ? "whitespace-pre-wrap" : "line-clamp-1"}>{expanded === m.id ? m.text : m.summary}</p>
                      {m.error && <p className="text-xs text-red">{m.error}</p>}
                      <p className="hud-label mt-0.5 text-[0.5rem] text-muted">via J.A.R.V.I.S. · Telegram</p>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap text-muted">{fmt(m.sentAt)}</td>
                    <td className="py-2">
                      <span
                        className={cn(
                          "hud-label inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[0.55rem]",
                          m.status === "sent" ? "border-primary/50 text-primary" : "border-red/50 text-red",
                        )}
                      >
                        {m.status === "sent" ? <Check className="size-3" /> : <X className="size-3" />}
                        {m.status === "sent" ? "Delivered" : "Failed"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ContactGrid({ version }: { version: number }) {
  const [syncTick, setSyncTick] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const feed = useFeed<{ contacts: Contact[]; ownerChatId?: number; botUsername?: string }>("/api/telegram/contacts", version + syncTick);

  const sync = async () => {
    setSyncing(true);
    await fetch("/api/telegram/sync", { method: "POST" }).catch(() => undefined);
    setSyncing(false);
    setSyncTick((t) => t + 1);
  };
  const markOwner = async (c: Contact) => {
    await fetch("/api/telegram/contacts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: c.id, owner: true }) });
    setSyncTick((t) => t + 1);
  };

  if (feed.error && !feed.data) return <FeedError error={feed.error} onRetry={feed.reload} />;
  const contacts = feed.data?.contacts ?? [];
  const link = feed.data?.botUsername ? `https://t.me/${feed.data.botUsername}` : undefined;

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="hud-label flex items-center gap-2 text-telegram">
          <Users className="size-3.5" /> Comms grid · {contacts.length}
        </h3>
        {link && (
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="ml-auto flex items-center gap-1 font-mono text-xs text-muted hover:text-telegram"
            title="Share this link — people must press Start before JARVIS can message them"
          >
            <Copy className="size-3" /> {copied ? "copied" : link.replace("https://", "")}
          </button>
        )}
        <button onClick={sync} className={cn("hud-label flex items-center gap-1 rounded-sm border border-telegram/50 px-2 py-1 text-[0.6rem] text-telegram hover:bg-telegram/10", !link && "ml-auto")}>
          <RefreshCw className={cn("size-3", syncing && "animate-spin")} /> Sync
        </button>
      </div>
      {contacts.length === 0 ? (
        <p className="text-xs text-muted">No contacts yet. Ask your team to open {link ?? "the bot"} and press Start, then hit Sync.</p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {contacts.map((c) => {
            const isOwner = feed.data?.ownerChatId === c.chatId;
            return (
              <li key={c.id} className="flex items-center gap-2 rounded-sm border border-line bg-telegram/5 px-2.5 py-1.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c.name}</span>
                  <span className="block truncate font-mono text-[0.6rem] text-muted">
                    {c.type !== "private" ? `${c.type} · ` : ""}
                    {c.aliases.join(", ")}
                  </span>
                </span>
                {c.type === "private" && (
                  <button
                    onClick={() => markOwner(c)}
                    title={isOwner ? "Tony's own chat (reminder pings go here)" : "Mark as me (receive reminder pings)"}
                    className={isOwner ? "text-gold" : "text-muted/50 hover:text-gold"}
                  >
                    <Star className="size-3.5" fill={isOwner ? "currentColor" : "none"} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
