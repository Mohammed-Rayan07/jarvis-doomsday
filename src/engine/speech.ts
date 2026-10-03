"use client";
import type { CalendarEvent, Command, CommsEntry, DriveFile, Reminder, StepRun, ToolName } from "@/lib/types";

// Spoken-language composer: turns step results into what a human assistant would actually say.
// "You have 2 events: X (Sun, 4 Oct, 4:00 pm); Y (…)" → "Tomorrow you've got X at 4, then Y at 6."
// Deterministic and instant — no second LLM round-trip on the voice path.

/** Lookups answer a question; everything else changes the world (incl. auto-approved reminders). */
const READS = new Set<ToolName>(["calendar.list_events", "reminders.list", "drive.search", "drive.list_folder", "comms.history", "telegram.list_contacts", "system.status"]);
export const isRead = (tool: ToolName) => READS.has(tool);

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const num = (n: number) => WORDS[n] ?? String(n);

function dayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz(), year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "4 PM", "5:30 PM" */
export function clock(iso: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz(), hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date(iso));
  const h = parts.find((p) => p.type === "hour")?.value;
  const m = parts.find((p) => p.type === "minute")?.value;
  const ap = parts.find((p) => p.type === "dayPeriod")?.value?.toUpperCase();
  return m === "00" ? `${h} ${ap}` : `${h}:${m} ${ap}`;
}

/** "today" | "tonight" | "tomorrow" | "on Monday" | "on 12 October" */
export function day(iso: string, now = new Date()) {
  const d = new Date(iso);
  const diff = Math.round((Date.parse(dayKey(d)) - Date.parse(dayKey(now))) / 86_400_000);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz(), hour: "numeric", hour12: false }).format(d));
  if (diff === 0) return hour >= 18 ? "tonight" : "today";
  if (diff === 1) return "tomorrow";
  if (diff > 1 && diff < 7) return `on ${new Intl.DateTimeFormat("en-GB", { timeZone: tz(), weekday: "long" }).format(d)}`;
  return `on ${new Intl.DateTimeFormat("en-GB", { timeZone: tz(), day: "numeric", month: "long" }).format(d)}`;
}

/** "tomorrow at 6 PM", "tonight at 8 PM" */
export const when = (iso: string) => `${day(iso)} at ${clock(iso)}`;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function list(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const who = (name: string) => (/^(the )?team$/i.test(name) ? "the team" : cap(name.split(" ")[0]));

function ago(iso?: string) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 14 ? `${days} days ago` : `on ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(new Date(iso))}`;
}

/* ─────────────── answers to read requests ─────────────── */

function schedule(eventsStep?: StepRun, remindersStep?: StepRun) {
  const events = (eventsStep?.result?.data as CalendarEvent[] | undefined) ?? [];
  const from = typeof eventsStep?.args.from === "string" ? eventsStep.args.from : events[0]?.start;
  const to = typeof eventsStep?.args.to === "string" ? Date.parse(eventsStep.args.to) : NaN;
  // reminders.list ranges are coarse ("upcoming") — keep only those inside the asked-about window
  const reminders = ((remindersStep?.result?.data as Reminder[] | undefined) ?? []).filter(
    (r) => r.status !== "done" && (!from || Number.isNaN(to) || (Date.parse(r.dueAt) >= Date.parse(from) && Date.parse(r.dueAt) < to)),
  );
  const multiDay = from && !Number.isNaN(to) && to - Date.parse(from) > 36 * 3_600_000;
  const label = !from ? "" : multiDay ? "coming up" : day(from).replace("tonight", "today");
  const at = (iso: string) => (multiDay ? when(iso) : `at ${clock(iso)}`);

  const parts: string[] = [];
  if (!events.length) parts.push(eventsStep ? `Your calendar's clear ${label || "for then"}, sir.` : "");
  else if (events.length === 1) parts.push(`${cap(label)} you've just the one: ${events[0].title} ${at(events[0].start)}.`);
  else {
    const items = events.slice(0, 4).map((e) => `${e.title} ${at(e.start)}`);
    parts.push(`${cap(label)} you have ${num(events.length)} things: ${list(items)}${events.length > 4 ? ", and more on screen" : ""}.`);
  }
  if (reminders.length === 1) parts.push(`${events.length ? "There's also" : "You do have"} a reminder ${at(reminders[0].dueAt)}: ${reminders[0].text}.`);
  else if (reminders.length > 1) parts.push(`Plus ${num(reminders.length)} reminders, the first ${at(reminders[0].dueAt)}: ${reminders[0].text}.`);
  return parts.filter(Boolean).join(" ");
}

function search(st: StepRun) {
  const files = (st.result?.data as DriveFile[] | undefined) ?? [];
  const q = String(st.args.query ?? "that");
  if (!files.length) return `I couldn't find anything matching ${q} in the archive, sir.`;
  const f = files[0];
  const where = f.folderPath && f.folderPath !== "My Drive" ? `in ${f.folderPath.replace(/^My Drive\//, "")}` : "in My Drive";
  const edited = f.modifiedTime ? `, last edited ${ago(f.modifiedTime)}` : "";
  if (files.length === 1) return `Found it, sir. ${f.name}, a ${f.typeLabel.toLowerCase()} ${where}${edited}.`;
  return `I found ${num(files.length)} matches. The best is ${f.name}, ${where}${edited}. The rest are on screen.`;
}

function comms(st: StepRun) {
  const items = (st.result?.data as CommsEntry[] | undefined) ?? [];
  if (!items.length) return "No transmissions on record yet, sir.";
  const last = items[0];
  return `${num(items.length)} recent transmissions. The latest went to ${who(last.recipientName)} ${ago(last.sentAt)}: ${last.text}`;
}

/** What to say when a command made only of lookups finishes. */
export function answerFor(c: Command) {
  const done = c.steps.filter((s) => s.status === "done");
  const ev = done.find((s) => s.tool === "calendar.list_events");
  const rem = done.find((s) => s.tool === "reminders.list");
  const parts: string[] = [];
  if (ev || rem) parts.push(schedule(ev, rem));
  for (const s of done) {
    if (s === ev || s === rem) continue;
    if (s.tool === "drive.search") parts.push(search(s));
    else if (s.tool === "comms.history") parts.push(comms(s));
    else if (s.result?.message) parts.push(s.result.message);
  }
  return parts.join(" ");
}

/* ─────────────── writes ─────────────── */

/** Short clause for multi-step wrap-ups: "the meeting's booked for tomorrow at 6 PM". */
function clause(st: StepRun) {
  const a = st.args as Record<string, unknown>;
  const d = st.result?.data as Record<string, unknown> | undefined;
  switch (st.tool) {
    case "calendar.create_event":
      return `${String(d?.title ?? a.title ?? "the event")} is booked for ${when(String(d?.start ?? a.start))}`;
    case "reminders.create":
      return `I'll remind you ${when(String(d?.dueAt ?? a.dueAt))}`;
    case "telegram.send":
      return `${cap(who(String(d?.recipientName ?? a.recipient)))} has the message`;
    case "drive.upload":
      return "the file is in the archive";
    case "calendar.delete_event":
      return "the event is off your calendar";
    default:
      return st.summary.charAt(0).toLowerCase() + st.summary.slice(1);
  }
}

/** Single consequential step finished. */
export function doneFor(st: StepRun) {
  const d = st.result?.data as Record<string, unknown> | undefined;
  switch (st.tool) {
    case "calendar.create_event":
      return `Done. ${String(d?.title ?? st.args.title)} is on your calendar ${when(String(d?.start ?? st.args.start))}.`;
    case "reminders.create":
      return `Very good. I'll remind you ${when(String(d?.dueAt ?? st.args.dueAt))}, sir.`;
    case "telegram.send":
      return `Sent. ${cap(who(String(d?.recipientName ?? st.args.recipient)))} has it, sir.`;
    case "calendar.delete_event":
      return "Done. It's off your calendar, sir.";
    case "drive.upload":
      return `Uploaded, sir. ${st.result?.message ?? ""}`.trim();
    default:
      return st.result?.message ?? "Done, sir.";
  }
}

export function wrapUp(c: Command) {
  const done = c.steps.filter((s) => s.status === "done" && !isRead(s.tool));
  if (!done.length) return answerFor(c);
  const reads = c.steps.some((s) => s.status === "done" && isRead(s.tool)) ? ` ${answerFor(c)}` : "";
  return `All done, sir. ${cap(list(done.map(clause)))}.${reads}`;
}

/* ─────────────── confirmation prompts ─────────────── */

function ask(st: StepRun) {
  const a = st.args as Record<string, unknown>;
  switch (st.tool) {
    case "telegram.send":
      return `Shall I send ${who(String(a.recipient))}: ${String(a.text ?? "").replace(/[.!?\s]+$/, "")}?`;
    case "calendar.create_event":
      return typeof a.start === "string" ? `Shall I book ${String(a.title ?? "it")} for ${when(a.start)}?` : `${st.summary}?`;
    case "calendar.delete_event":
      return `${st.summary}. Are you sure, sir?`;
    default:
      return `${st.summary}. Shall I proceed?`;
  }
}

function short(st: StepRun) {
  const a = st.args as Record<string, unknown>;
  switch (st.tool) {
    case "calendar.create_event":
      return `book ${String(a.title ?? "the meeting")}`;
    case "reminders.create":
      return "set a reminder";
    case "telegram.send":
      return `message ${who(String(a.recipient))}`;
    case "drive.upload":
      return "upload the file";
    default:
      return st.summary.charAt(0).toLowerCase() + st.summary.slice(1);
  }
}

/**
 * Prompt for the first confirmation of a command. Multi-step plans get one question for the lot
 * ("…shall I go ahead with all of it?") — a spoken "yes" then authorises all.
 */
export function confirmFor(c: Command, st: StepRun): { text: string; all: boolean } {
  const rest = c.steps.filter((o) => o.status === "pending" || o === st);
  if (rest.length > 1) {
    return { text: `I'll ${list(rest.map(short))}. Shall I go ahead with all of it, sir?`, all: true };
  }
  return { text: ask(st), all: false };
}
