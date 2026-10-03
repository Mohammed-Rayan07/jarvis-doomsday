# J.A.R.V.I.S. × DOOMSDAY — Build Spec (locked)

> Single source of truth for the Silicon Maze 2026 **JARVIS** dev task (200 pts).
> Task statement: <https://github.com/WebClub-NITK/GDG-SM-2026-Tasks/blob/main/Jarvis.md>
> Window: **3 Oct 2026 18:00 → 4 Oct 2026 18:00 IST**. Submission = public GitHub repo URL.
>
> Rule for this document: if it's not in here, it isn't being built. If something in here changes, change it here first.

---

## 0. Winning strategy (read this first)

1. **Graders score what they can see.** They get a repo URL. Our Google OAuth app will be in *Testing* mode, so graders cannot log in with their own Google account. Therefore the deliverable is:
   - the **repo** (clean, commit history inside the event window),
   - a **live deployment** (Vercel) that boots and degrades gracefully with zero credentials,
   - a **demo video** (3–5 min) linked at the top of the README showing every subtask against real Google + Telegram,
   - a **rubric table** in the README mapping every subtask bullet → feature → timestamp in the video.
2. **Every bullet in Jarvis.md is a checkbox** (Section 1). We tick every one, visibly.
3. **Plan/execute split.** The LLM only *plans* (structured JSON). A deterministic client-side executor *runs* the plan step-by-step, with confirmation, cancellation, and live preview updates. This single design satisfies 1.2, 5.1, 5.2 and makes everything debuggable.
4. **Never crash, never silently fail.** Every integration has `NOT_CONFIGURED / NOT_CONNECTED / AUTH_EXPIRED / …` states rendered as themed cards with a fix-it button. App runs with zero env vars (AI falls back to a rule-based parser).
5. **Every commit leaves the app runnable.** Build in rubric-point order so a partial build still scores.

---

## 1. Rubric checklist (every bullet → feature)

| # | Requirement (from Jarvis.md) | Pts | How we satisfy it | Where |
|---|---|---|---|---|
| **1.1** | JARVIS-style assistant/chat area | 15 | Left pane "COMMS LINK" chat with JARVIS avatar (arc reactor), typed message bubbles | `components/chat/ChatPanel.tsx` |
| | Clear input field | | Bottom command bar: text input, paperclip (attach file), mic (voice), mode toggle, send | `CommandInput.tsx` |
| | Section showing responses | | Message list with JARVIS replies + inline step timelines + result cards | `MessageList.tsx` |
| | **Split-screen Live Integration Preview Pane** | | Right pane with tabs CALENDAR / REMINDERS / ARCHIVE / COMMS / LOG; auto-switches + highlights the item an action touched | `components/preview/*` |
| | Visible "JARVIS online" status | | Header arc-reactor orb + `ONLINE / PROCESSING / AWAITING INPUT / DEGRADED / OFFLINE` label + per-integration health chips | `StatusBar.tsx`, `/api/status` |
| | Futuristic Stark/Doomsday design | | Section 7 design system | `globals.css`, `components/hud/*` |
| | Responsive desktop + mobile | | ≥1024px: side-by-side split. <1024px: segmented toggle CHAT ⇄ PREVIEW, preview auto-opens on action completion | `app/page.tsx` |
| **1.2** | Recognise categories & route | 20 | LLM planner → `Plan{kind, steps[tool,args]}`; fallback rule-based parser (chrono-node) when AI unavailable | `lib/ai/planner.ts`, `lib/ai/fallback.ts` |
| | Sensible response / guide when info missing | | `kind:"clarify"` → ClarifyCard with question + quick-reply chips; next message is answered in context | `ClarifyCard.tsx` |
| | **Queue OR user-chosen interrupt/append** | | We do **both**: mode toggle `QUEUE ⇄ INTERRUPT`, `Ctrl+Enter` = interrupt override, STOP button, visible queue strip with remove | `store/queue.ts`, `engine/executor.ts`, `QueueStrip.tsx` |
| **2.1** | Google Calendar connect | 20 | OAuth (google-auth-library), `calendar` scope | `lib/google/*` |
| | Create event w/ title, date, time | | `calendar.create_event` | |
| | Description when provided | | `description` arg | |
| | Upcoming events in preview pane | | Agenda view (next 7 days grouped by day, NOW marker), new event pulses | `CalendarView.tsx` |
| | Missing/ambiguous → clarify | | Planner rule: no time/date ⇒ clarify with chips ("Tomorrow 10 AM", "Tomorrow 4 PM") | prompt |
| | Immediately reflect in preview | | Executor sets `preview.focus({tab:'calendar', highlightId})` after success | `store/preview.ts` |
| | *(manage events)* | | `list_events`, `update_event` (reschedule/rename), `delete_event` (confirm) | |
| **2.2** | Create & manage reminders | 20 | Own store: create / list / complete / snooze / delete | `lib/reminders/*` |
| | "tomorrow morning" style times | | Planner resolves with tz; fallback chrono-node; "morning"=09:00, "evening"=18:00, "night"=21:00 | prompt |
| | "What reminders do I have today?" | | `reminders.list{range:'today'}` → answer in chat + preview | |
| | Clearly distinguish events vs reminders | | Events = **cyan** + calendar icon; Reminders = **Stark gold** + bell icon; legend in pane; separate tabs; Calendar tab overlays reminders in gold as "personal" | |
| | Active reminders in preview | | REMINDERS tab: Overdue / Today / Upcoming / Done sections | `RemindersView.tsx` |
| | *(bonus: actually remind)* | | Client watcher polls every 20s → toast + browser Notification + JARVIS voice + optional Telegram ping to Tony | `hooks/useReminderWatcher.ts` |
| **3.1** | Integrate Google Drive | 25 | `drive` scope | |
| | Select file from device | | Paperclip / drag-drop / UploadCard dropzone | `UploadCard.tsx` |
| | **Choose existing folder or create new (default My Drive)** | | Folder combobox (all folders, path shown) + "＋ New folder" inline; default `My Drive` | |
| | Upload directly to Drive | | Server creates **resumable session**, browser `XHR PUT` straight to Google (real progress, no 4.5 MB limit). Fallback: server proxy | `/api/drive/upload-session` |
| | Live Drive preview pane after auth | | ARCHIVE tab: breadcrumb explorer of folders/files, icons per type, modified time, open links | `DriveView.tsx` |
| | Upload progress/status | | % bar, bytes, speed, states `PREPARING → UPLOADING → VERIFYING → STORED` | |
| | Handle failures gracefully | | Error card + Retry + Choose another folder; cancel via `xhr.abort()` | |
| | Confirm success | | JARVIS message + file card (name, folder, size, Open in Drive) + highlight in explorer | |
| **3.2** | Search Drive | 20 | `drive.search` → `files.list q="name contains 'x' or fullText contains 'x'" and trashed=false` | |
| | Name, type, folder, modified, open link | | Result cards show all five; folder path resolved via parents (cached) | |
| | Results in interface/preview | | Chat result list + ARCHIVE tab switches to "Search results" mode | |
| **4.1** | Telegram integration | 20 | Bot API `sendMessage` | `lib/telegram/*` |
| | Identify recipient | | Contacts registry (auto-synced from `getUpdates` + aliases); planner receives contact list | |
| | Generate message from request | | Planner writes the message text in Tony's voice | |
| | Clarify unclear recipient/message | | Unknown recipient ⇒ clarify with chips of known contacts; empty message ⇒ ask | |
| | Send through Telegram | | Confirmation card (editable text) → send | |
| | Indicate success/failure | | Step status + COMMS log row with status | |
| **4.2** | Communication history | 15 | COMMS tab: recipient, summary, full text (expand), time, status (SENT/FAILED + error), "via JARVIS" badge, link to originating command | `CommsView.tsx` |
| **5.1** | Multi-step requests in sequence | 20 | Plan has N steps; step args may template earlier results `{{s1.start}}` | executor |
| | Queue / interrupt while executing | | Section 5 | |
| | Report results + update preview per phase | | StepTimeline per command (pending/running/done/failed/cancelled/skipped) + preview focus after each step | |
| **5.2** | Integration unavailable | 15 | `NOT_CONFIGURED` card (which env var is missing) | `lib/errors.ts` |
| | Auth expired | | `AUTH_EXPIRED` (invalid_grant) → "Reconnect Google" button | |
| | Required field / folder missing | | `MISSING_FIELD` → clarify; folder not found → offer create | |
| | Event cannot be created | | Google error mapped to readable reason | |
| | Upload fails | | UploadCard error state + retry | |
| | Message cannot be sent | | Telegram `chat not found` / `bot was blocked` → explain + how to fix | |
| | **Confirmation for consequential actions** | | ConfirmCard (editable fields) for send / delete / create event / upload; reminders auto-approved (toggleable) | `ConfirmCard.tsx` |
| **5.3** | HUD components, dual-pane | 10 | Panels w/ corner brackets, grid bg, scanlines | |
| | Typography & hierarchy | | Orbitron / Chakra Petch / JetBrains Mono | |
| | Animations + queue feedback | | Boot sequence, orb spin speed = activity, step timeline animations, queue strip | |
| | Status indicators | | Header orb + chips | |
| | Action history | | LOG tab (all actions, filterable) | `ActionLogView.tsx` |
| | Loading/success/error states | | Shared `StateBadge`, skeletons | |
| | Consistent visual language | | Tokens only, no ad-hoc colors | |

---

## 2. Architecture

```
┌──────────────────────────── Browser (Next.js client) ─────────────────────────────┐
│ CommandInput ─▶ queue store ─▶ executor ──▶ POST /api/plan  (LLM / fallback)       │
│                     ▲            │  for each step:                                 │
│        mode/STOP ───┘            │   confirm? ─▶ ConfirmCard (await user)          │
│                                  │   POST /api/execute {tool,args}                 │
│                                  │   preview.focus(tab, id)  ─▶ PreviewPane        │
│ UploadCard ── XHR PUT ─────────────────────────────────▶ Google resumable upload   │
│ useReminderWatcher (20s poll) ──▶ GET /api/reminders?due=1                         │
└───────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────── Next.js server (route handlers) ──────────────────────┐
│ /api/plan → lib/ai/planner (AI SDK 7 generateText + Output.object) | fallback.ts  │
│ /api/execute → lib/tools/registry → google/calendar | google/drive | reminders |  │
│                                     telegram                                      │
│ session cookie (jose JWE) holds Google tokens;  storage adapter (json | redis)    │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Stack (locked)

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.3 App Router**, TypeScript, React 19 | Read `node_modules/next/dist/docs` before writing new conventions (AGENTS.md). `cookies()` is async. |
| Styling | Tailwind v4 (CSS-first `@theme`) + CSS variables | |
| Client state | zustand | stores: `queue`, `chat`, `preview`, `settings`, `status` |
| AI | **AI SDK 7** `generateText({ output: Output.object({schema}) })` | Provider switch via env (`anthropic` default, `google`, `openai`). Verify against `node_modules/ai/docs`. |
| Validation | zod 4 | shared between planner schema & execute route |
| Google | `google-auth-library`, `@googleapis/calendar`, `@googleapis/drive` | |
| Telegram | raw `fetch` to Bot API | no SDK needed |
| Dates | `chrono-node` (fallback parsing), `date-fns`, `date-fns-tz` | |
| Animation | `motion` | |
| Icons/toasts | `lucide-react`, `sonner` | |
| Session crypto | `jose` (JWE `dir` + `A256GCM`) | key = SHA-256(`SESSION_SECRET`) |
| Storage | `StorageAdapter`: JSON files in `.data/` (local) · Upstash Redis REST (deploy) | chosen by env |
| Deploy | Vercel (Node runtime, no edge) | |

### 2.2 Key decisions (and why)

- **D1 Plan/execute split.** LLM never calls write APIs. It returns fully-resolved args (absolute ISO datetimes, final message text, computed "30 min before"). Executor runs them. → deterministic, cancellable, confirmable, visible.
- **D2 Client-side executor.** Steps are executed by the browser calling `/api/execute` one at a time. Natural points for confirmation, cancellation (AbortController), preview refresh and per-step UI. Works on serverless without long-lived streams.
- **D3 Timezone.** Every `/api/plan` and `/api/execute` call sends `tz` (IANA, from `Intl.DateTimeFormat().resolvedOptions().timeZone`) and `now` (ISO). Planner emits ISO with offset; Calendar events created with explicit `timeZone`. Vercel servers are UTC — never use server-local time.
- **D4 Tokens in encrypted httpOnly cookie** (`jarvis_g`), not a DB. Refresh transparently; on `invalid_grant` clear cookie → `AUTH_EXPIRED`.
- **D5 Reminders are ours**, not Google Tasks (Tasks `due` is date-only, loses "7 PM").
- **D6 Drive upload is direct-to-Google** via resumable session (server creates session with `Origin` header so browser PUT passes CORS). Real progress events. Proxy fallback route for when CORS fails.
- **D7 Telegram contacts via `getUpdates` polling** (works on localhost & Vercel as long as no webhook is set). Groups map to aliases like "team".
- **D8 Preview pane renders our own views from API data** (no iframes) so we can highlight the touched item.
- **D9 Single-tenant.** One Tony. Google auth is per-browser cookie; reminders/comms/log are global in storage. Documented in README.
- **D10 Fallback brain.** If no AI key or the LLM call fails/times out (12 s), `fallback.ts` regex+chrono parser handles the 5 canonical command shapes. Status shows `AI CORE: BACKUP`.

---

## 3. Domain types (source: `src/lib/types.ts`)

```ts
type ToolName =
  | 'calendar.create_event' | 'calendar.list_events' | 'calendar.update_event' | 'calendar.delete_event'
  | 'reminders.create' | 'reminders.list' | 'reminders.complete' | 'reminders.delete' | 'reminders.snooze'
  | 'drive.upload' | 'drive.search' | 'drive.list_folder' | 'drive.create_folder'
  | 'telegram.send' | 'telegram.list_contacts'
  | 'comms.history' | 'system.status';

type PreviewTab = 'calendar' | 'reminders' | 'drive' | 'comms' | 'log';

interface PlanStep { id: string /* s1,s2… */; tool: ToolName; args: Record<string, unknown>; summary: string /* "Create event 'Stark team meeting' tomorrow 18:00" */ }

interface Plan {
  kind: 'execute' | 'clarify' | 'answer';
  reply: string;                 // JARVIS voice, shown before steps run
  steps: PlanStep[];             // empty for clarify/answer
  clarification?: { question: string; missing: string[]; options?: string[] };
}

type StepStatus = 'pending' | 'awaiting_confirmation' | 'running' | 'done' | 'failed' | 'cancelled' | 'skipped';
type CommandStatus = 'queued' | 'planning' | 'awaiting_input' | 'running' | 'done' | 'partial' | 'failed' | 'cancelled';

interface Command { id; text; attachments: File[] (client only); status; plan?; steps: StepRun[]; createdAt; startedAt?; finishedAt? }
interface StepRun extends PlanStep { status: StepStatus; result?: ToolResult; startedAt?; finishedAt? }

interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  message: string;               // human readable, JARVIS voice
  preview?: { tab: PreviewTab; highlightId?: string; mode?: 'search'; query?: string };
  error?: JarvisError;
}

type ErrorCode = 'NOT_CONFIGURED' | 'NOT_CONNECTED' | 'AUTH_EXPIRED' | 'MISSING_FIELD' | 'NOT_FOUND'
  | 'AMBIGUOUS' | 'PERMISSION_DENIED' | 'RATE_LIMITED' | 'UPSTREAM_ERROR' | 'NETWORK' | 'CANCELLED'
  | 'VALIDATION' | 'NOT_IMPLEMENTED';
interface JarvisError { code: ErrorCode; message: string; integration?: 'google' | 'telegram' | 'ai' | 'storage'; fix?: { label: string; href?: string; action?: 'reconnect_google' | 'sync_telegram' | 'retry' | 'open_settings' }; details?: unknown }

interface Reminder { id; text; dueAt: string /*ISO*/; createdAt; status: 'active' | 'done'; firedAt?: string; notifyTelegram: boolean; source: 'jarvis' | 'manual'; commandId? }
interface Contact { id; chatId: number; name: string; aliases: string[]; type: 'private' | 'group' | 'supergroup'; username?: string; lastSeenAt }
interface CommsEntry { id; channel: 'telegram'; recipientName; chatId; text; summary; sentAt; status: 'sent' | 'failed'; error?: string; telegramMessageId?: number; commandId? }
interface ActionLogEntry { id; at; commandId; commandText; tool: ToolName; summary; status: 'done' | 'failed' | 'cancelled'; message; previewTab? }
```

---

## 4. Tools (source: `src/lib/tools/schemas.ts`)

`consequential` ⇒ ConfirmCard before running (unless user toggled auto-approve for that class).

| Tool | Args (zod) | Consequential | Preview tab | Behaviour |
|---|---|---|---|---|
| `calendar.create_event` | `title`, `start` ISO, `end?` ISO, `durationMinutes?`=60, `description?`, `location?`, `attendees?` email[] | ✅ | calendar | `events.insert` with `timeZone: tz`; returns event (id, htmlLink) |
| `calendar.list_events` | `from` ISO, `to` ISO, `query?` | ❌ | calendar | `events.list singleEvents orderBy=startTime` |
| `calendar.update_event` | `eventId`, `title?`, `start?`, `end?`, `description?` | ✅ | calendar | `events.patch` |
| `calendar.delete_event` | `eventId` | ✅ (danger) | calendar | `events.delete` |
| `reminders.create` | `text`, `dueAt` ISO, `notifyTelegram?` | ❌ (toggle) | reminders | store |
| `reminders.list` | `range: today\|tomorrow\|upcoming\|overdue\|all` | ❌ | reminders | |
| `reminders.complete` | `id` | ❌ | reminders | |
| `reminders.snooze` | `id`, `until` ISO | ❌ | reminders | |
| `reminders.delete` | `id` | ✅ | reminders | |
| `drive.upload` | `folderId?`, `folderName?`, `createFolder?: boolean`, `fileHint?` | ✅ (interactive) | drive | **Interactive:** executor renders UploadCard (preselected folder / attached file) and waits for completion |
| `drive.search` | `query`, `mimeType?` | ❌ | drive (search mode) | returns files + resolved folder path |
| `drive.list_folder` | `folderId?` (root) | ❌ | drive | |
| `drive.create_folder` | `name`, `parentId?` | ✅ | drive | |
| `telegram.send` | `recipient` (contact name/alias), `text` | ✅ | comms | resolve contact → `sendMessage` → log CommsEntry (sent/failed) |
| `telegram.list_contacts` | – | ❌ | comms | |
| `comms.history` | `limit?` | ❌ | comms | |
| `system.status` | – | ❌ | – | |

**Step templating.** Any string arg may contain `{{s1.data.start}}`-style refs resolved by the executor from earlier step results (`lodash.get`-style path). If a ref resolves to undefined ⇒ step fails with `VALIDATION`.

**Resolution of "which event / which reminder".** Planner context includes the next 14 days of events (id, title, start) and active reminders (id, text, dueAt), so `update/delete/complete` get real IDs. If more than one matches ⇒ `clarify` with options.

---

## 5. Command lifecycle, queue & interrupt (1.2 + 5.1)

```
submit(text, files, override?) ─▶ if busy:
      mode=QUEUE      → push to queue (status 'queued'), show in QueueStrip with position
      mode=INTERRUPT  → abort current (see below), then run new immediately
      Ctrl+Enter      → interrupt regardless of mode
  run(cmd):
      status=planning → POST /api/plan {text, history(last 12 turns), tz, now, attachments:[{name,type,size}]}
      plan.kind=answer   → print reply → done
      plan.kind=clarify  → ClarifyCard (chips) → status=awaiting_input; queue PAUSED.
                           Next user message is sent as the answer (history carries context) → re-plan.
      plan.kind=execute  → for step in steps (sequential):
           resolve templates
           if consequential && !autoApprove → status awaiting_confirmation → ConfirmCard
                 (Approve / Edit fields / Skip step / Cancel command; Enter=approve, Esc=cancel)
           running → POST /api/execute (signal) | interactive UI for drive.upload
           done/failed → append ActionLogEntry; preview.focus(result.preview); refresh tab data
           on failed: stop remaining steps → mark 'skipped'; command = partial|failed
      finish → JARVIS summary line ("2 of 3 actions completed. Telegram delivery failed: …")
      dequeue next
```

**Interrupt semantics:** `abortController.abort()` → in-flight fetch cancelled (server action may still complete — we report "interrupted, outcome unknown" if it was mid-flight and refetch the preview), remaining steps → `cancelled`, completed steps remain reported as done. A pending ConfirmCard is dismissed as cancelled. Queue items are untouched.

**UI:** QueueStrip above input: `▶ NOW: schedule meeting…  ⏳ 2 queued  [STOP]`; each queued chip has ✕ to remove. Mode toggle shows `QUEUE` (cyan) / `INTERRUPT` (red). Orb spins faster while running.

---

## 6. API routes

All return `ToolResult` or `{ ok, data } / { ok:false, error: JarvisError }`. All accept `x-jarvis-tz` header.

| Route | Method | Purpose |
|---|---|---|
| `/api/status` | GET | `{ ai:{configured,provider,model,mode:'llm'\|'backup'}, google:{configured,connected,email}, telegram:{configured,ok,botUsername}, storage:{adapter} }` |
| `/api/plan` | POST | `{text, history, tz, now, attachments}` → `Plan` |
| `/api/execute` | POST | `{tool, args, tz, commandId}` → `ToolResult` (validates args with tool zod schema) |
| `/api/auth/google` | GET | redirect to consent (scopes below, `access_type=offline`, `prompt=consent`) |
| `/api/auth/google/callback` | GET | exchange code → set `jarvis_g` cookie → redirect `/?connected=google` |
| `/api/auth/logout` | POST | clear cookie |
| `/api/calendar/events` | GET | `?from&to` for preview |
| `/api/reminders` | GET/POST | list (`?range`, `?due=1` for watcher) / create |
| `/api/reminders/[id]` | PATCH/DELETE | complete, snooze, fired, delete |
| `/api/drive/files` | GET | `?folderId` list children · `?q` search |
| `/api/drive/folders` | GET/POST | all folders (with paths) for picker / create folder |
| `/api/drive/upload-session` | POST | `{name,mimeType,size,folderId}` → `{uploadUrl}` |
| `/api/drive/upload` | POST | multipart proxy fallback |
| `/api/telegram/sync` | POST | `getUpdates` → upsert contacts |
| `/api/telegram/contacts` | GET/PATCH | list / edit aliases |
| `/api/telegram/history` | GET | comms log |
| `/api/actions` | GET/POST | action log |

**Google scopes:** `openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive`.

---

## 7. Planner (AI) spec — `lib/ai/*`

- Model: env `AI_PROVIDER` (`anthropic`|`google`|`openai`), `AI_MODEL` (defaults: `claude-sonnet-5-5` / `gemini-flash-latest` / `gpt-4.1-mini`). Timeout 12 s → fallback.
- Call: `generateText({ model, system, messages, output: Output.object({ schema: PlanSchema }), temperature: 0 })`.
- Schema: steps use `args: z.record(z.string(), z.unknown())`; per-tool validation happens in `/api/execute` (keeps provider JSON-schema simple). On invalid ⇒ one repair retry with the zod error appended.
- **System prompt contents:**
  - Persona: JARVIS, calls user "sir", concise, dry wit, max 2 sentences in `reply`.
  - Context block: `now` + `tz` + weekday; contacts (name, aliases); next 14 days events (id,title,start); active reminders (id,text,dueAt); attachment names.
  - Tool catalogue (name, args, when to use).
  - Rules: absolute ISO datetimes with offset; default duration 60 min; "morning" 09:00, "afternoon" 14:00, "evening" 18:00, "night" 21:00; never invent recipients — unknown ⇒ clarify with contact options; missing time for event ⇒ clarify; "remind me X before it" ⇒ compute; message text written in first person as Tony, short; "this document"/"upload" ⇒ `drive.upload` (interactive, never ask for the file in chat); questions about schedule ⇒ `calendar.list_events` and/or `reminders.list`; chit-chat ⇒ `answer`.
  - Few-shot: the 5 example commands from Jarvis.md + the 5.1 multi-step example + 3 clarify cases.
- **Fallback (`fallback.ts`):** keyword routing (`schedule|meeting|event` → calendar, `remind` → reminders, `upload|drive` → upload, `find|search` → drive.search, `send|message|tell` → telegram, `what.*(scheduled|calendar)` → list) + `chrono-node` for dates, split multi-step on `, and ` / ` then `. Good enough for the demo commands.

---

## 8. Integrations — implementation notes

### 8.1 Google auth (`lib/google/auth.ts`, `lib/session.ts`)
- `OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ${APP_URL}/api/auth/google/callback)`.
- Cookie payload `{access_token, refresh_token, expiry_date, email}` encrypted JWE, httpOnly, sameSite=lax, secure in prod, 30 days.
- `getGoogleClient()` → throws `NOT_CONFIGURED` (env missing) / `NOT_CONNECTED` (no cookie). Listen to `tokens` event → re-write cookie. Map `invalid_grant`/401 → `AUTH_EXPIRED` + clear cookie.
- OAuth state param (random, stored in short-lived cookie) to prevent CSRF.

### 8.2 Calendar (`lib/google/calendar.ts`)
- create: `{summary, description, location, start:{dateTime, timeZone}, end:{…}, attendees, reminders:{useDefault:true}}`.
- preview: next 7 days, `singleEvents:true, orderBy:'startTime', maxResults:50`.

### 8.3 Drive (`lib/google/drive.ts`)
- List: `q: '${folderId}' in parents and trashed=false`, `fields: files(id,name,mimeType,modifiedTime,size,webViewLink,iconLink,parents)`, folders first.
- Folders for picker: `mimeType='application/vnd.google-apps.folder' and trashed=false`, build paths from parents (cache).
- Search: `(name contains 'q' or fullText contains 'q') and trashed=false`, `orderBy: modifiedTime desc` *(note: orderBy not allowed with fullText — run name query ordered + fullText query, merge/dedupe)*, resolve folder name via cached `files.get(parent,'name')`.
- Upload session: `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink,parents,mimeType,size,modifiedTime` with `Authorization`, `Origin: APP_URL origin`, `X-Upload-Content-Type`, `X-Upload-Content-Length`, body `{name, parents:[folderId]}` → `Location` header = uploadUrl.
- Client: `xhr.open('PUT', uploadUrl)`, `xhr.upload.onprogress`, handle 200/201 → file JSON. On CORS/network failure → fallback `/api/drive/upload` (≤4 MB on Vercel; local unlimited).
- Human type labels from mimeType (Google Doc, PDF, Sheet, Image, Folder…).

### 8.4 Telegram (`lib/telegram/*`)
- `TELEGRAM_BOT_TOKEN`; `getMe` for status/username.
- Sync: `getUpdates?offset=<stored+1>&allowed_updates=["message","my_chat_member"]` → for each `message.chat` upsert Contact (private: `first_name [last_name]`, alias = first name lowercase, username; group: title, alias e.g. "team" if title contains team/stark). Store offset.
- Auto-sync before every `telegram.send` if recipient unresolved.
- Send: `sendMessage {chat_id, text, parse_mode:'HTML'}`; errors: 400 `chat not found` → "Bruce hasn't started the bot yet — share t.me/<bot>"; 403 blocked; 429 → RATE_LIMITED with retry_after.
- Contact panel shows invite link `https://t.me/<botUsername>` + copy button.
- `TELEGRAM_OWNER_CHAT_ID` (optional) = Tony's own chat for reminder pings.

### 8.5 Reminders (`lib/reminders/service.ts`)
- CRUD over storage collection `reminders`.
- `due` query: `status=active && dueAt<=now && !firedAt` → watcher fires → PATCH `firedAt`. If `notifyTelegram` & owner chat configured → server sends Telegram ping.

### 8.6 Storage (`lib/storage/*`)
```ts
interface StorageAdapter { getAll<T>(c: string): Promise<T[]>; get<T>(c, id); put<T extends {id:string}>(c, item); remove(c, id); getMeta<T>(key); setMeta<T>(key, v) }
```
- `json` adapter: `.data/<collection>.json`, in-process write mutex. Default.
- `redis` adapter (Upstash REST, `UPSTASH_REDIS_REST_URL/TOKEN`): hash per collection. Used automatically when env present (Vercel).

---

## 9. UI spec

### 9.1 Layout (desktop ≥1024)
```
┌ HEADER: [orb] J.A.R.V.I.S.  ·  ONLINE  ·  chips: AI CORE · CALENDAR · DRIVE · TELEGRAM   [clock IST] [voice] [settings] ┐
├──────────────── CHAT (≈46%) ─────────────────┬──────────────── LIVE PREVIEW (≈54%) ──────────────────┤
│ messages (JARVIS / Tony)                      │ tabs: CALENDAR | REMINDERS | ARCHIVE | COMMS | LOG     │
│  └ step timeline / confirm / clarify / upload │ view (auto-focus + highlight pulse)                     │
│ suggestion chips (empty state)                │                                                         │
│ QueueStrip                                    │                                                         │
│ [📎][ command input ……………… ][🎙][QUEUE|INTR][➤] │                                                         │
└───────────────────────────────────────────────┴─────────────────────────────────────────────────────────┘
```
- Mobile: header compact; segmented `CHAT | PREVIEW` toggle; badge dot on PREVIEW when it changed; preview auto-opens for 2.5 s highlight then user can swipe back.
- Empty state: boot greeting "Good evening, sir. All systems online." + suggestion chips (the 5 spec examples + multi-step example) — **graders will click these**.

### 9.2 Design system (Doomsday × Stark)
- **Colors** (CSS vars, dark only): `--bg #020705`, `--bg-2 #06110c`, `--panel rgba(8,24,17,.72)`, `--line #16382a`, `--line-bright #2b6b4f`, `--primary #3dff9a` (Doomsday green, from poster), `--cyan #4de1ff` (JARVIS holo / calendar), `--gold #ffc24b` (Stark gold / reminders), `--red #ff3b4e` (Doomsday alert / errors / interrupt), `--violet #9b7bff` (Drive), `--text #d8ffe9`, `--muted #6d9682`.
- **Integration colors:** Calendar cyan · Reminders gold · Drive violet · Telegram `#38b6ff` · System green.
- **Type:** Orbitron (brand, headings, labels uppercase tracking .2em), Chakra Petch (body), JetBrains Mono (data, times, IDs).
- **Motifs:** HUD corner brackets on panels, 1px glowing borders, faint grid + radial vignette background, scanline overlay (opacity .04), arc-reactor orb (conic gradient + 2 counter-rotating dashed rings; speed ∝ activity; red when error), hex/maze pattern subtle in header (poster nod).
- **Motion:** boot sequence (≤1.8 s, skippable, once per session): lines `INITIALIZING J.A.R.V.I.S. … CALENDAR LINK ✓ … ARCHIVE ✓ … COMMS ✓ … DOOMSDAY PROTOCOL ARMED`; message reveal (fade+rise); step timeline ticks; highlight pulse (2 cycles glow) on touched preview item; `prefers-reduced-motion` respected.
- **Voice (stretch, cheap):** Web Speech `SpeechRecognition` mic; `speechSynthesis` reads replies (en-GB voice), toggle in header.

### 9.3 Component inventory
`hud/`: `HudPanel`, `ArcReactor`, `StatusBar`, `StatusChip`, `BootSequence`, `StateBadge`, `HudButton`, `Scanlines`
`chat/`: `ChatPanel`, `MessageList`, `MessageBubble`, `CommandInput`, `QueueStrip`, `StepTimeline`, `ConfirmCard`, `ClarifyCard`, `UploadCard`, `ErrorCard`, `ResultCard` (event/reminder/file/message variants), `SuggestionChips`
`preview/`: `PreviewPane`, `CalendarView`, `RemindersView`, `DriveView` (explorer + search mode + upload button), `CommsView` (history + contacts), `ActionLogView`, `ConnectPrompt` (shown when integration not connected)

---

## 10. Env vars (`.env.example`)

```
APP_URL=http://localhost:3000
SESSION_SECRET=               # 32+ random chars
AI_PROVIDER=anthropic         # anthropic | google | openai
AI_MODEL=                     # optional override
ANTHROPIC_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
OPENAI_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_CHAT_ID=       # optional: reminder pings to Tony
UPSTASH_REDIS_REST_URL=       # optional: set on Vercel
UPSTASH_REDIS_REST_TOKEN=
```

---

## 11. Build order (point-weighted, each phase ends with a commit + push)

Clock starts ~19:30 Sat. Hard stop for features **14:00 Sun**; 14:00–17:30 deploy/README/video; submit by **17:30**.

| Phase | Target | Contents | Done when |
|---|---|---|---|
| **P0** 0.5h | skeleton | repo, skeleton (this commit), `.env.example`, public GitHub repo | `npm run build` passes, pushed |
| **P1** 3h | **T1 (35)** | theme + layout + StatusBar + chat + planner + fallback + queue/executor + Confirm/Clarify cards + LOG tab (tools mocked) | can type 5 spec examples, see plans, queue/interrupt works |
| **P2** 2h | **T2.1 (20)** | Google OAuth, calendar tools, CalendarView, highlight | real event appears in preview + Google Calendar |
| **P3** 1.5h | **T2.2 (20)** | reminders store/tools/view, watcher + notifications | reminder fires as toast |
| **P4** 3h | **T3 (45)** | DriveView explorer, folders picker/create, resumable upload with progress, search results | file lands in chosen/new folder; search shows 5 fields |
| **P5** 2h | **T4 (35)** | Telegram sync/contacts/send, CommsView history | Bruce (teammate) receives msg; history shows it |
| **P6** 2h | **T5.1/5.2 (35)** | templating, multi-step example end-to-end, error matrix (Section 12), editable confirm | every row of error matrix shows a themed card |
| **P7** 2h | **T5.3 (10)** + wow | boot seq, animations, voice, mobile pass, a11y pass | looks like a film prop |
| **P8** 2.5h | ship | Vercel deploy + Upstash, README (rubric table, setup, architecture, screenshots), demo video | link + video in README |
| Buffer | ~4h | sleep / bugs | |

---

## 12. Verification matrix (run before submitting)

Commands:
1. "Schedule a meeting with Bruce tomorrow at 5 PM." → confirm → event in Calendar + highlight.
2. "Schedule a meeting with Bruce." → clarify time (chips) → answer "4 PM" → event.
3. "Remind me to check the reactor at 8 PM." → reminder gold in REMINDERS.
4. "Remind me tomorrow morning about the reactor test." → 09:00 tomorrow.
5. "What reminders do I have today?" / "What do I have scheduled for tomorrow?" → answers + preview.
6. "Upload this document to my Drive." → UploadCard → new folder "Reactor Designs" → progress → STORED → highlight.
7. "Find the reactor design report." → results w/ name/type/folder/modified/open.
8. "Send Bruce a message saying the experiment is postponed." → confirm editable → SENT → COMMS row.
9. "Send a message to the team." → asks what to say.
10. "Send Thanos a message" → unknown recipient → chips of contacts.
11. Multi-step: "Schedule the Stark team meeting for tomorrow at 6 PM, remind me 30 minutes before it, and send Bruce a Telegram message about it." → 3 steps live.
12. Queue: send 3 commands rapidly in QUEUE mode → run in order. INTERRUPT mode → current cancelled, partial results reported.

Errors: no AI key (backup mode chip), Google not connected (connect card), revoke app access in Google account → AUTH_EXPIRED → reconnect, Telegram token wrong → NOT_CONFIGURED/UPSTREAM, recipient never /started → explained, upload to deleted folder → failure card + retry, airplane mode → NETWORK.

Viewports: 1440×900, 1024×768, 390×844.

---

## 13. Skeleton status (commit `b8a1f54`) & known TODOs

**Working now:** build + lint clean · HUD shell (status bar, arc reactor, split panes, mobile toggle) · chat + suggestion chips · `/api/plan` with LLM planner (needs key) and backup brain · client executor (queue / interrupt / Ctrl+Enter / STOP / clarify loop / confirm card / templating / per-step status / preview focus / action log) · reminders store + tools (end-to-end) · LOG tab · `/api/status` · Google OAuth routes + encrypted session · JSON storage · error envelopes.

**Stubbed (throw `NOT_IMPLEMENTED`, surfaced as themed errors):** calendar.ts (P2), drive.ts + UploadCard + proxy upload (P4), telegram send/sync (P5), Calendar/Reminders/Archive/Comms views (P2–P5), Redis adapter (P8).

**Known TODOs found during smoke test:**
- `fallback.ts`: chrono parses in server TZ → pass `{ instant: now, timezone: offsetMinutes(tz) }`; strip trailing punctuation/whitespace from reminder text ("check the reactor ." bug).
- `/api/plan`: inject next-14-days events once P2 lands.
- ConfirmCard: typed editors + Enter/Esc keys (P6).
- `telegram.send` should report `NOT_CONFIGURED` before `NOT_IMPLEMENTED`.

## 14. Submission checklist
- [ ] Public repo, `README.md` top: demo video link, live URL, rubric table, screenshots/GIF
- [ ] Setup guide: Google Cloud (enable Calendar + Drive APIs, OAuth consent *Testing*, add test user, Web client, redirect URIs for localhost + Vercel), BotFather, env vars
- [ ] `.env.example`, no secrets committed (`git log -p | grep -i key` sanity)
- [ ] Commits inside event window, meaningful messages
- [ ] `npm run build` clean, `npm run lint` clean
- [ ] Submitted URL on portal before 17:30
