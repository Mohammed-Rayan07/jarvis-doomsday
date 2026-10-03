# J.A.R.V.I.S. × DOOMSDAY

**Tony Stark's personal AI command centre.** One HUD where Tony talks to JARVIS in plain English, and JARVIS plans and executes real actions across **Google Calendar**, **personal reminders**, **Google Drive** and **Telegram**. A live preview pane updates as each action lands.

> Built for **Silicon Maze 2026 – Doomsday Edition** (Web Enthusiasts' Club, NITK), Development track.

🎬 **Demo video:** _link coming_ &nbsp;·&nbsp; 📐 **Build manual:** [`BUILD_SPEC.md`](BUILD_SPEC.md)

<!-- screenshot: docs/screenshot.png -->

---

## For graders

- The Google OAuth app is in **Testing mode**, so only allow-listed accounts can sign in. The **demo video** shows every subtask running against a real Google account and real Telegram users.
- You can still run it yourself with **zero configuration**. `npm i && npm run dev` boots the full UI. Integrations that aren't configured show themed **"integration unavailable"** states instead of crashing, and with no AI key JARVIS falls back to a rule-based **backup brain**.
- Every reply is tagged `[llm]` or `[backup]`, so it's always visible which brain planned it.

## Rubric map

| Subtask | What we built | Where |
|---|---|---|
| **1.1** Stark Command Centre | Split screen: chat on the left, **Live Integration Preview Pane** on the right (Calendar / Reminders / Archive / Comms / Log tabs that auto-switch and highlight the item just touched). Arc-reactor status orb (ONLINE / PROCESSING / AWAITING INPUT / PARTIAL / OFFLINE) and per-integration health chips. Boot sequence. Responsive: on mobile, CHAT ⇄ PREVIEW toggle with an "updated" badge. | `src/app/page.tsx`, `src/components/hud/*`, `src/components/preview/*` |
| **1.2** Understanding commands + queuing | The LLM planner returns a typed plan (`execute` / `clarify` / `answer`). Clarifications come with clickable quick replies. **Both** queue and interrupt are supported: QUEUE ⇄ INTERRUPT toggle, `Ctrl+Enter` = interrupt this one, STOP button, visible queue strip where items can be removed. | `src/lib/ai/*`, `src/engine/executor.ts`, `src/components/chat/ChatPanel.tsx` |
| **2.1** Stark Calendar | Google Calendar create / list / update / delete with explicit timezone. Asks when the time or day is missing. A 7-day agenda in the preview with a NOW line; new events pulse. | `src/lib/google/calendar.ts`, `CalendarView.tsx` |
| **2.2** Reminders | Own reminder store (Google Tasks drops the time of day). Reminders preview groups them as Overdue / Today / Upcoming / Done, with done / snooze / delete. **Reminders actually fire**: toast, browser notification, optional voice, and a Telegram ping to Tony. Events (cyan, 📅) and reminders (gold, 🔔) are visually distinct, and reminders also appear in gold on the calendar agenda. | `src/lib/reminders/*`, `RemindersView.tsx`, `useReminderWatcher.ts` |
| **3.1** Upload to the Stark Archive | Pick, drop or attach a file. Choose an **existing folder (full paths) or create a new one** (default My Drive). The **resumable session** lets the browser `PUT` straight to Google with live % / bytes / speed, then the server verifies the file landed. Cancel / retry / give up, plus a server-proxy fallback. Explorer pane with breadcrumbs. | `src/lib/google/drive.ts`, `UploadCard.tsx`, `DriveView.tsx` |
| **3.2** Finding the right file | Keyword search over names plus full-text search. Results show **name, type, folder path, last modified, size, open link** in chat and in the preview. | `drive.ts › searchFiles` |
| **4.1** Telegram | The bot learns contacts from `getUpdates` (anyone who pressed Start, plus groups) and supports aliases ("bruce" → Arnab, "team" → group). JARVIS writes the message, Tony can edit it in the confirmation card, then it's sent. Unknown or ambiguous recipients get clickable contact options. | `src/lib/telegram/bot.ts` |
| **4.2** Communication history | Comms tab: recipient, summary (click to expand), timestamp, Delivered / Failed (with the reason), "via J.A.R.V.I.S." | `CommsView.tsx` |
| **5.1** Unified command flow | A single request becomes N sequential steps. Later steps can use earlier results. Each step shows its own status (pending / awaiting / running / done / failed / skipped / cancelled), and the preview updates after every step. | `src/engine/executor.ts`, `StepTimeline.tsx` |
| **5.2** Confirmation and errors | Consequential actions show a **confirmation card** with editable fields (date picker, message box). Keys: Enter / Esc. **Authorise all** covers multi-step plans, and deletes get danger styling. Typed errors (`NOT_CONFIGURED`, `NOT_CONNECTED`, `AUTH_EXPIRED`, `MISSING_FIELD`, `NOT_FOUND`, `AMBIGUOUS`, `PERMISSION_DENIED`, `RATE_LIMITED`, …) appear as cards with a fix button (Reconnect Google, invite link, Retry & continue). | `src/lib/errors.ts`, `ConfirmCard.tsx` |
| **5.3** The Stark Interface | Doomsday-green HUD: corner-bracket panels, grid and scanlines, Orbitron / Chakra Petch / JetBrains Mono, arc reactor that spins faster while working, boot sequence, message animations, highlight pulses, **voice input and spoken replies**, action log. | `globals.css`, `components/hud/*` |

## How it works

```
Tony ─▶ CommandInput ─▶ queue (QUEUE | INTERRUPT) ─▶ executor ─▶ POST /api/plan
                                                        │        (Gemini → plan JSON, or backup brain)
                                                        ▼
                                     for each step: confirm? ─▶ POST /api/execute ─▶ Calendar | Drive | Reminders | Telegram
                                                        │
                                                        └─▶ preview.focus(tab, item) ─▶ Live Preview Pane
```

- **The LLM only plans; it never touches APIs.** It returns fully resolved arguments: absolute ISO times in Tony's timezone, computed "30 minutes before", and the final message text. A deterministic client-side executor runs the plan, which makes confirmation, cancellation, retries and live preview updates straightforward.
- **Model fallback chain**: Gemini Flash-Lite → Flash → 3.8 Flash, each with a timeout. Models that fail cool down for 60 s. Rule-based backup brain as the last resort.
- **Timezone-safe**: every request carries the browser's IANA timezone, and events are created with an explicit `timeZone`.
- **Google tokens** live in an encrypted httpOnly cookie (JWE). App data (reminders, contacts, comms log, action log) sits behind a small storage adapter (JSON files locally).

## Run it locally

```bash
cd jarvis
npm install
cp .env.example .env.local   # fill in what you have; everything is optional
npm run dev                  # http://localhost:3000
```

### Credentials (all optional)

| Integration | Steps |
|---|---|
| **AI (Gemini, free)** | Create a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Set `AI_PROVIDER=google` and `GOOGLE_GENERATIVE_AI_API_KEY=…` (Anthropic / OpenAI are also supported). |
| **Google Calendar + Drive** | In Google Cloud: create a project, enable the **Calendar API** and **Drive API**, and set the OAuth consent screen to External / Testing with yourself as a **test user**. Create an OAuth client (Web) with redirect `http://localhost:3000/api/auth/google/callback`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then click **Connect Google** in the header. |
| **Telegram** | Get a token from @BotFather (`/newbot`) and set it as `TELEGRAM_BOT_TOKEN`. Everyone JARVIS should message must press **Start** on the bot. Open the **Comms** tab and hit **Sync**, then ⭐ your own chat for reminder pings. Add the bot to a group whose name contains "team" to enable "message the team". |
| **Session** | Set `SESSION_SECRET` to 32+ random chars: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

### Try these

- Schedule a meeting with Bruce tomorrow at 5 PM.
- Remind me to check the reactor at 8 PM. / Remind me tomorrow morning about the reactor test.
- What do I have scheduled for tomorrow? / What reminders do I have today?
- Upload this research report to a new folder called Reactor Designs.
- Find the reactor design report.
- Send Bruce a message saying the experiment is postponed.
- **Schedule the Stark team meeting for tomorrow at 6 PM, remind me 30 minutes before it, and send Bruce a Telegram message about it.**

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · AI SDK 7 (Gemini) · zod · zustand · googleapis (Calendar, Drive) · Telegram Bot API · chrono-node · jose
