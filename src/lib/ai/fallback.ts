import * as chrono from "chrono-node";
import type { Plan, PlanRequest, PlanStep } from "../types";

// BUILD_SPEC D10 — rule-based "backup brain" used when no AI key or the LLM fails.
// Handles the canonical command shapes from the task statement; P1 extends it.

function when(text: string, now: Date) {
  const parsed = chrono.parse(text, now, { forwardDate: true })[0];
  if (!parsed) return undefined;
  const d = parsed.start.date();
  if (!parsed.start.isCertain("hour")) {
    if (/morning/i.test(text)) d.setHours(9, 0, 0, 0);
    else if (/afternoon/i.test(text)) d.setHours(14, 0, 0, 0);
    else if (/evening/i.test(text)) d.setHours(18, 0, 0, 0);
    else if (/night/i.test(text)) d.setHours(21, 0, 0, 0);
    else return { date: d, hasTime: false, text: parsed.text };
  }
  return { date: d, hasTime: true, text: parsed.text };
}

function stepFor(clause: string, id: string, now: Date): PlanStep | Plan {
  const c = clause.trim();
  const t = when(c, now);

  if (/\bremind\b/i.test(c)) {
    if (!t) return clarify("When should I remind you, sir?", ["time"], ["In 1 hour", "Tonight 8 PM", "Tomorrow morning"]);
    const text = c
      .replace(/^(jarvis,?\s*)?remind me (to |about )?/i, "")
      .replace(t.text, "")
      .trim();
    return { id, tool: "reminders.create", args: { text: text || c, dueAt: t.date.toISOString() }, summary: `Reminder: ${text || c}` };
  }
  if (/\b(upload|drive)\b/i.test(c) && !/\b(find|search)\b/i.test(c)) {
    return { id, tool: "drive.upload", args: {}, summary: "Upload a document to Drive" };
  }
  if (/\b(find|search|where is|locate)\b/i.test(c)) {
    const query = c.replace(/^(jarvis,?\s*)?(find|search( for)?|where is|locate)\s+(the\s+|my\s+)?/i, "").replace(/[.?!]$/, "");
    return { id, tool: "drive.search", args: { query }, summary: `Search Drive for "${query}"` };
  }
  if (/\b(send|message|tell|telegram)\b/i.test(c)) {
    const m = c.match(/(?:send|message|tell)\s+(?:a message to\s+)?(?:the\s+)?(\w+)(?:\s+a (?:telegram )?message)?(?:\s+(?:saying|that|:)\s+(.+))?/i);
    const recipient = m?.[1];
    const text = m?.[2]?.replace(/[.]$/, "");
    if (!recipient) return clarify("Who should I send it to, sir?", ["recipient"]);
    if (!text) return clarify(`What should I tell ${recipient}, sir?`, ["message"]);
    return { id, tool: "telegram.send", args: { recipient, text }, summary: `Telegram ${recipient}: "${text}"` };
  }
  if (/\b(what|show|list)\b.*\b(scheduled|calendar|schedule|have)\b/i.test(c)) {
    const from = t?.date ?? now;
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { id, tool: "calendar.list_events", args: { from: start.toISOString(), to: end.toISOString() }, summary: "Check schedule" };
  }
  if (/\b(schedule|meeting|event|book)\b/i.test(c)) {
    if (!t || !t.hasTime) return clarify("What time should I schedule it for, sir?", ["time"], ["Tomorrow 10 AM", "Tomorrow 4 PM", "Tomorrow 6 PM"]);
    const title = c
      .replace(/^(jarvis,?\s*)?(schedule|book|create|add)\s+(a\s+|an\s+|the\s+)?/i, "")
      .replace(t.text, "")
      .replace(/\s+(for|at|on)\s*$/i, "")
      .trim();
    return { id, tool: "calendar.create_event", args: { title: capitalise(title || "Meeting"), start: t.date.toISOString(), durationMinutes: 60 }, summary: `Event: ${title}` };
  }
  return { kind: "answer", reply: "I'm on backup systems, sir — try phrasing that as a schedule, reminder, upload, search or message command.", steps: [] };
}

export function fallbackPlan(req: PlanRequest): Plan {
  const now = new Date(req.now);
  const clauses = req.text.split(/,\s*(?:and\s+)?|\s+and then\s+|\s+then\s+|;\s*/i).filter(Boolean);
  const steps: PlanStep[] = [];
  for (const [i, clause] of clauses.entries()) {
    const r = stepFor(clause, `s${i + 1}`, now);
    if ("kind" in r) return r;
    steps.push(r);
  }
  return {
    kind: "execute",
    reply: steps.length > 1 ? `Running ${steps.length} operations in sequence, sir.` : "Right away, sir.",
    steps,
  };
}

function clarify(question: string, missing: string[], options?: string[]): Plan {
  return { kind: "clarify", reply: question, steps: [], clarification: { question, missing, options } };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
