// Shared domain types. See BUILD_SPEC.md §3.

export const TOOL_NAMES = [
  "calendar.create_event",
  "calendar.list_events",
  "calendar.update_event",
  "calendar.delete_event",
  "reminders.create",
  "reminders.list",
  "reminders.complete",
  "reminders.snooze",
  "reminders.delete",
  "drive.upload",
  "drive.search",
  "drive.list_folder",
  "drive.create_folder",
  "telegram.send",
  "telegram.list_contacts",
  "comms.history",
  "system.status",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export type PreviewTab = "calendar" | "reminders" | "drive" | "comms" | "log";

export type Integration = "google" | "telegram" | "ai" | "storage" | "voice";

// ── Planning ────────────────────────────────────────────

export interface PlanStep {
  id: string; // s1, s2, …
  tool: ToolName;
  args: Record<string, unknown>;
  summary: string;
}

export interface Plan {
  kind: "execute" | "clarify" | "answer";
  reply: string;
  steps: PlanStep[];
  clarification?: { question: string; missing: string[]; options?: string[] };
  source?: "llm" | "backup";
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface PlanRequest {
  text: string;
  history: ChatTurn[];
  tz: string;
  now: string; // ISO
  attachments: { name: string; type: string; size: number }[];
}

// ── Execution ───────────────────────────────────────────

export type StepStatus =
  | "pending"
  | "awaiting_confirmation"
  | "running"
  | "done"
  | "failed"
  | "cancelled"
  | "skipped";

export type CommandStatus =
  | "queued"
  | "planning"
  | "awaiting_input"
  | "running"
  | "done"
  | "partial"
  | "failed"
  | "cancelled";

export interface StepRun extends PlanStep {
  status: StepStatus;
  result?: ToolResult;
  startedAt?: string;
  finishedAt?: string;
}

export interface Command {
  id: string;
  text: string;
  status: CommandStatus;
  plan?: Plan;
  steps: StepRun[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface PreviewFocus {
  tab: PreviewTab;
  highlightId?: string;
  mode?: "browse" | "search";
  query?: string;
  /** drive: folder to open in the explorer */
  folderId?: string;
}

export type ErrorCode =
  | "NOT_CONFIGURED"
  | "NOT_CONNECTED"
  | "AUTH_EXPIRED"
  | "MISSING_FIELD"
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "PERMISSION_DENIED"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "NETWORK"
  | "CANCELLED"
  | "VALIDATION"
  | "NOT_IMPLEMENTED";

export interface JarvisErrorShape {
  code: ErrorCode;
  message: string;
  integration?: Integration;
  fix?: {
    label: string;
    href?: string;
    action?: "reconnect_google" | "sync_telegram" | "retry" | "open_settings";
  };
  details?: unknown;
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  message: string;
  preview?: PreviewFocus;
  error?: JarvisErrorShape;
}

export interface ExecuteRequest {
  tool: ToolName;
  args: Record<string, unknown>;
  tz: string;
  commandId?: string;
}

// ── Records ─────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  description?: string;
  location?: string;
  htmlLink?: string;
}

export interface Reminder {
  id: string;
  text: string;
  dueAt: string;
  createdAt: string;
  status: "active" | "done";
  firedAt?: string;
  notifyTelegram: boolean;
  source: "jarvis" | "manual";
  commandId?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  typeLabel: string;
  isFolder: boolean;
  modifiedTime?: string;
  size?: number;
  webViewLink?: string;
  iconLink?: string;
  parentId?: string;
  folderPath?: string;
}

export interface Contact {
  id: string;
  chatId: number;
  name: string;
  aliases: string[];
  type: "private" | "group" | "supergroup" | "channel";
  username?: string;
  lastSeenAt: string;
}

export interface CommsEntry {
  id: string;
  channel: "telegram";
  recipientName: string;
  chatId?: number;
  text: string;
  summary: string;
  sentAt: string;
  status: "sent" | "failed";
  error?: string;
  telegramMessageId?: number;
  commandId?: string;
}

export interface ActionLogEntry {
  id: string;
  at: string;
  commandId?: string;
  commandText?: string;
  tool: ToolName;
  summary: string;
  status: "done" | "failed" | "cancelled";
  message: string;
  previewTab?: PreviewTab;
}

export interface SystemStatus {
  ai: { configured: boolean; provider: string; model: string; mode: "llm" | "backup" };
  google: { configured: boolean; connected: boolean; email?: string };
  telegram: { configured: boolean; ok: boolean; botUsername?: string; error?: string };
  storage: { adapter: "json" | "redis" };
  /** JARVIS's speaking voice: ElevenLabs when configured, else the browser's speechSynthesis. */
  voice: { provider: "elevenlabs" | "browser"; budgetLeft?: number };
}
