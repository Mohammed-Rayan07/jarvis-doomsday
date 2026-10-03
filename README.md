# J.A.R.V.I.S. × DOOMSDAY

**Tony Stark's personal AI command centre.** Talk to JARVIS (typed or hands-free by voice). It understands the request, plans it, asks when something is missing, confirms anything consequential, and then **really does it** on **Google Calendar**, **personal reminders**, **Google Drive** and **Telegram**. A side-by-side **Live Integration Preview Pane** shows each result the moment it lands.

> Built for **Silicon Maze 2026 – Doomsday Edition** (Web Enthusiasts' Club, NITK), Development Track. Task: [JARVIS: Tony Stark's Personal AI Assistant](https://github.com/WebClub-NITK/GDG-SM-2026-Tasks/blob/main/Jarvis.md)

## 🎬 Demo video

[![Watch the demo on YouTube](https://img.shields.io/badge/%E2%96%B6%20WATCH%20THE%20DEMO-YouTube%20%C2%B7%20~4%20min-ff0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/tbvmZN2wMno)

**▶ https://youtu.be/tbvmZN2wMno**: every subtask running live against a real Google account and real Telegram users, in about 4 minutes.

📐 The full design and build manual is in [`BUILD_SPEC.md`](BUILD_SPEC.md).

---

## For judges: quick facts

- **Everything is real.** Events go into Google Calendar, files go into Google Drive, and messages are delivered by a Telegram bot. Nothing is mocked.
- **Why the video matters.** The Google OAuth app is in *Testing* mode, so only allow-listed Google accounts can sign in. The video shows every integration working end to end.
- **It runs without any setup.** `npm install && npm run dev` boots the full interface even with **zero credentials**. Missing integrations show clear *"integration unavailable"* cards instead of crashing, and without an AI key a rule-based **backup brain** still plans every example command from the task.
- **Every reply is labelled** `[llm]` or `[backup]`, so it's always clear which brain planned it.

---

## ✅ Task coverage, point by point

Each bullet from the task statement, how it's met, and where it appears in the demo.

### Task 1: Booting Up JARVIS

**1.1 Stark Command Centre** (15 pts)

| Requirement | How JARVIS meets it | In the demo |
|---|---|---|
| JARVIS-style assistant / chat area | "COMMS LINK · TONY ⇄ JARVIS" panel with message animations and an `[llm]`/`[backup]` tag on each reply | Boot, tour |
| Clear input field | Command bar with 📎 attach, 🎙 push-to-talk, **LIVE** hands-free voice, QUEUE/INTERRUPT toggle and send | Throughout |
| Section showing responses | JARVIS replies plus a **step timeline** per command (pending → running → done/failed), with results inline | Throughout |
| **Split screen with a Live Integration Preview Pane** | The right half shows **Calendar** (7-day agenda), **Reminders**, **Archive** (Google Drive explorer), **Comms** (Telegram) and **Log**. It auto-switches to whatever JARVIS just touched and pulses the new item | Tour, every scene |
| Visible "online" status | Arc-reactor orb plus status text: **ONLINE / PROCESSING / AWAITING INPUT / ONLINE · PARTIAL / OFFLINE**, and health chips per integration (AI, Calendar, Archive, Voice, Telegram) | Boot |
| Futuristic Stark / Doomsday design | Green HUD theme: corner-bracket panels, grid and scanlines, Orbitron / Chakra Petch / JetBrains Mono fonts, boot sequence | Throughout |
| Responsive for desktop and mobile | 46/54 split on desktop. On mobile, a **Comms link ⇄ Live preview** toggle with an "updated" dot, and a compact command bar | Mobile scene |

**1.2 Understanding Tony's commands and queuing** (20 pts)

| Requirement | How JARVIS meets it | In the demo |
|---|---|---|
| Recognise request categories and route them | An LLM planner (Gemini) turns any wording into a typed plan: `execute` (tool steps), `clarify` (a question with clickable options) or `answer` (small talk). It covers 17 tools across Calendar, Reminders, Drive, Telegram and history | Every scene |
| All five example commands | Each is handled by the LLM **and** by the rule-based backup brain | Calendar, Reminders, Upload, Telegram scenes |
| Guide the user when info is missing | Missing time or day → "When should we set that up, sir?" with options. Missing message → "What should I tell the team?" Unknown or ambiguous recipient → contact options. "Delete the meeting" with several matches → "Which one, sir?" | Calendar, Telegram |
| **Queue *and* interrupt (both options)** | **QUEUE** mode: new commands wait in a visible queue strip (NOW + #1, #2…, each removable). **INTERRUPT** mode, or **Ctrl+Enter** for a single command, cancels the running command and runs the new one first. A **STOP** button is always available. Interrupted steps that hadn't run are cancelled safely (e.g. an unconfirmed message is never sent) | Queue scene |

### Task 2: Tony's Schedule

**2.1 Stark Calendar Integration** (20 pts)

| Requirement | How JARVIS meets it | In the demo |
|---|---|---|
| Google Calendar integration | Google OAuth with an encrypted httpOnly session; create / list / update / delete through the Calendar API | Calendar |
| Title, date and time | Natural language like "tomorrow at 4 PM", "Monday evening" or "30 minutes before it" becomes absolute times in Tony's own timezone; events are created with an explicit `timeZone` | Calendar |
| Description when provided | "…description: review the gamma readings" is saved as the event description and shown in the confirmation card | Calendar |
| View upcoming events in the preview pane | A 7-day agenda with a NOW line; the new event **pulses**; each event links to Google Calendar | Calendar |
| Clarify missing or ambiguous info | It never guesses an hour: missing time → question with options. Several matching events → "Which one, sir?" | Calendar |
| Reflect it immediately in the preview | The preview switches to Calendar and highlights the event as soon as it's created | Calendar, multi-step |

**2.2 Don't Let Tony Forget** (20 pts)

| Requirement | How JARVIS meets it | In the demo |
|---|---|---|
| Create and manage reminders | Create, list, complete, snooze and delete, by voice or chat, plus done / snooze / delete buttons in the preview | Reminders |
| All three example phrasings | "Remind me to check the Mark 50 at 7 PM" (rolls to tomorrow if 7 PM has passed). "Remind me tomorrow morning about the reactor test" (morning = 9 AM). "What reminders do I have today?" | Reminders |
| **Events clearly distinct from reminders** | 📅 cyan events vs 🔔 gold reminders, shown together on the agenda, plus a dedicated **Reminders** tab grouped as Overdue / Today / Upcoming / Done | Reminders |
| Active reminders in the preview panel | Reminders tab with live counts | Reminders |
| *Extra* | **Reminders actually fire**: an on-screen alert, a desktop notification, JARVIS saying it aloud, and a Telegram ping to Tony's phone | — |

### Task 3: The Stark Archive

**3.1 Upload to the Stark Archive** (25 pts)

| Requirement | How JARVIS meets it | In the demo |
|---|---|---|
| Pick a document from the device | 📎 attach in the chat, or the upload card's file picker / drag-and-drop | Upload |
| **Choose an existing folder or create a new one (default My Drive)** | A destination dropdown lists **every Drive folder with its full path**, plus **＋ New folder…**. Defaults to **My Drive**. "…to a new folder called Reactor Designs" pre-selects it | Upload |
| Upload directly to the chosen destination | A Google resumable upload session: the browser streams the file **straight to Google Drive**, then the server checks the file actually arrived. Nothing is stored locally | Upload |
| **Live Drive preview pane** | The Archive tab is a Drive explorer (breadcrumbs, folders, files, type, size, modified date, open link). It opens as soon as an upload starts and lands in the destination folder afterwards | Upload |
| Clear progress / status | Preparing → uploading (**live %, MB and speed**) → verifying → stored | Upload |
| Handle failures gracefully | If the direct upload fails, it **retries automatically through the server**. If that fails too, the card shows "Upload failed" with the reason and **Retry / Give up**. Cancel works at any time | — (tested) |
| Confirm success | "Reactor Research Report.pdf is stored in My Drive / Reactor Designs, sir." The file is highlighted in the explorer | Upload |

**3.2 Finding the Right File** (20 pts)

| Requirement | How JARVIS meets it | In the demo |
|---|---|---|
| Search the user's Drive | Searches file names and file contents, ranked by how many of your words match. A folder index makes it fast (about 1 s) | Search |
| Name, type, folder, last modified, open link | Every result shows the **name, type, full folder path, last modified time, size** and an **↗ open** link, in chat and in the preview | Search |

### Task 4: Stark Communications

**4.1 Send a Message** (20 pts)

| Requirement | How JARVIS meets it | In the demo |
|---|---|---|
| Identify the recipient | The Telegram bot learns its contacts automatically (anyone who pressed Start, plus groups), with aliases: "Bruce" → Arnab, "the team" → the team group | Telegram |
| Generate the message from the request | JARVIS writes the text in Tony's voice ("about it" after scheduling a meeting becomes a proper heads-up message) | Telegram, multi-step |
| Clarify unclear recipient or message | Unknown recipient → contact options. No content → "What should I tell the team, sir?" JARVIS never invents a message | Telegram |
| Send through Telegram | Telegram Bot API; the message arrives in a real chat or group | Telegram |
| Clear success / failure | "Sent. The team has it, sir." / a failure card with the reason, a bot invite link and **Retry** | Telegram |

**4.2 Communication History** (15 pts)

| Requirement | How JARVIS meets it | In the demo |
|---|---|---|
| Recipient, message summary, time sent, delivery status | The Comms tab shows a transmission log with **recipient**, **message** (click to expand), **sent time** and **Delivered / Failed** (with the reason) | History |
| Clear that JARVIS performed it | Each row is tagged **"VIA J.A.R.V.I.S. · TELEGRAM"**; the **Log** tab records every action JARVIS performed | History |

### Task 5: The Doomsday Protocol

**5.1 Unified Command Flow and Queuing** (20 pts)

| Requirement | How JARVIS meets it | In the demo |
|---|---|---|
| Multi-step requests in sequence | "Schedule the Stark team meeting for tomorrow at 6 PM, remind me 30 minutes before it, and send Bruce a Telegram message about it" becomes **3 ordered steps**. The reminder time is worked out from the event; the message refers to it | Multi-step |
| Queue / interrupt while tasks run | Same engine as 1.2: queue strip, Ctrl+Enter interrupt, STOP | Queue |
| Report results and update the preview after each step | Each step ticks live, and the preview jumps **Calendar → Reminders → Comms** as each one completes. JARVIS sums up at the end ("All done, sir…") | Multi-step |

**5.2 Action Confirmation and Error Handling** (15 pts)

| Situation | What Tony sees |
|---|---|
| Consequential action | A **confirmation card** with editable fields (date pickers, message box). **Enter** authorises, **Esc** aborts, **Authorise all** covers a multi-step plan, deletes are styled as dangerous. By voice: "yes", "authorise all", "skip", "cancel" |
| Integration unavailable | "The Telegram link is offline, sir. Missing configuration: TELEGRAM_BOT_TOKEN." plus a setup-guide link. Health chips turn red |
| Authentication expired | Google says the token is revoked → "My Google credentials have expired, sir" plus a **Reconnect** button (the dead session is cleared) |
| Missing field / folder | Clarifying questions (time, recipient, message); the upload card asks for a file and destination; a missing folder shows "That folder no longer exists" |
| Event can't be created | e.g. it ends before it starts → "The event would end before it starts, sir." Google API errors are passed on clearly |
| Upload fails | Automatic fallback through the server, then **Retry / Give up** with the reason |
| Message can't be sent | Unknown chat, blocked bot, rate limit or missing token → failure card with the reason and fix, logged as **Failed** in Comms |
| In a multi-step plan | Later steps are skipped, and **Retry & continue** resumes from the failed step |

**5.3 The Stark Interface** (10 pts)

- **HUD components with a dual-pane layout:** chat and live preview side by side, with corner-bracket panels and grid / scanline texture.
- **Typography and hierarchy:** Orbitron headings, Chakra Petch body text, JetBrains Mono for data and labels.
- **Animations and queue feedback:** boot sequence, message entrances, highlight pulses on touched items, a queue strip, and an arc reactor that spins faster while working.
- **Status indicators:** the reactor status orb plus per-integration health chips.
- **Action history:** the Log tab, and the Comms transmission log.
- **Loading, success and error states:** per-step status icons, themed empty, loading and error states for every preview tab.
- **🎙 LIVE voice link** (see below): JARVIS answers out loud in a natural British voice, with a spectrum orb that reacts to the audio and live captions.

---

## 🏁 Final mission checklist

| Tony should be able to… | ✓ |
|---|---|
| Manage Google Calendar with live preview confirmation | ✅ |
| Create and manage reminders | ✅ |
| Upload documents to chosen or newly created Drive folders | ✅ |
| Preview Drive contents in a side pane after signing in | ✅ |
| Search and open files from Drive | ✅ |
| Send messages through Telegram | ✅ |
| Queue or interrupt commands seamlessly | ✅ |
| View actions performed by JARVIS | ✅ (Log and Comms tabs) |
| Combine multiple actions in one request | ✅ |

---

## 🎙 Beyond the brief: the live voice link

Press **LIVE** (Chrome / Edge) and just talk: *"Jarvis, what's on my schedule tomorrow?"*

- **Hands-free conversation.** It listens continuously and sends your order after a short pause, waiting longer if you trail off on words like "and…" or "saying…". If you pause mid-sentence and carry on, both halves are merged into one command.
- **Natural replies, not robotic narration.** Lookups get one composed spoken answer, e.g. *"Tomorrow you have two things: Meeting with Bruce Banner at 4 PM and Stark team meeting at 6 PM."* Confirmations are a single question, e.g. *"Shall I send the team: …?"* A multi-step plan asks once: *"…shall I go ahead with all of it?"*
- **Neural voice:** ElevenLabs text-to-speech, streamed through the server so the API key never reaches the browser. Audio starts playing before the clip has finished generating.
- **About 2 seconds from your order being recognised to JARVIS speaking**, thanks to:
  - connections to Gemini and ElevenLabs kept open between turns;
  - a warm-up as soon as you start talking;
  - calendar context cached for the planner.
- **Safe by design.** The mic pauses while JARVIS talks, so it never hears itself. **Space** or a click on the core interrupts it. Spoken "confirm", "cancel" or "stop" control the confirmation card.
- **Budget-safe.** Repeated lines are cached, spending is capped, and any problem (no key, quota, rate limit) falls back to the browser's built-in voice.

---

## How it works

```
Tony (text / voice) ─▶ queue (QUEUE | INTERRUPT) ─▶ executor ─▶ POST /api/plan
                                                      │          Gemini → typed plan JSON
                                                      │          (fallback chain → rule-based backup brain)
                                                      ▼
                             for each step: confirm? ─▶ POST /api/execute ─▶ Calendar | Reminders | Drive | Telegram
                                                      │
                                                      ├─▶ preview.focus(tab, item) ─▶ Live Integration Preview Pane
                                                      └─▶ narrator ─▶ /api/voice/tts (ElevenLabs) ─▶ JARVIS speaks
```

- **The AI only plans; it never calls the APIs itself.** It returns fully resolved arguments: absolute times in Tony's timezone, derived times like "30 minutes before", and the final message text. A deterministic executor then runs each step, which keeps confirmations, cancellation, retries and live preview updates reliable.
- **Guard rails on the plan.**
  - Times already past today roll forward to tomorrow.
  - "Upload…" always opens the upload panel.
  - A singular "the meeting" that matches several items becomes a question rather than several deletes.
- **Resilient AI.** Gemini Flash-Lite falls back to Flash, then to 3.8 Flash, each with a timeout and a cooldown. The rule-based backup brain is the last resort.
- **Security.**
  - Google tokens live in an encrypted httpOnly cookie, and all API keys stay server-side.
  - Every consequential action needs confirmation.
  - Telegram only messages contacts who opted in by pressing Start.

## Run it locally

```bash
git clone https://github.com/Mohammed-Rayan07/jarvis-doomsday
cd jarvis-doomsday
npm install
cp .env.example .env.local   # fill in what you have: everything is optional
npm run dev                  # http://localhost:3000
```

`npm run build && npm start` runs the faster production build. `npm run demo:reset` clears reminders and the comms and action logs, but keeps Telegram contacts.

### Credentials (all optional)

| Integration | Steps |
|---|---|
| **AI (Gemini, free)** | Create a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Set `AI_PROVIDER=google` and `GOOGLE_GENERATIVE_AI_API_KEY=…` (Anthropic and OpenAI are also supported). |
| **Google Calendar + Drive** | In Google Cloud: create a project and enable the **Calendar API** and **Drive API**. Set the OAuth consent screen to External / Testing and add yourself as a **test user**. Create a **Web** OAuth client with redirect `http://localhost:3000/api/auth/google/callback`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then click **Connect Google** in the header. |
| **Telegram** | Create a bot with @BotFather (`/newbot`) and set `TELEGRAM_BOT_TOKEN`. Everyone JARVIS should message must press **Start** on the bot. In the **Comms** tab, hit **Sync**, then ⭐ your own chat to receive reminder pings. Add the bot to a group with "team" in its name to enable "message the team". |
| **Voice** | Create an [ElevenLabs](https://elevenlabs.io) key with *Text to Speech* permission and set `ELEVENLABS_API_KEY`. The default voice is the premade "George". Without a key, JARVIS uses the browser's voice. |
| **Session** | Set `SESSION_SECRET` to 32+ random characters: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

### Try these

- Schedule a meeting with Bruce Banner tomorrow at 4 PM.
- Remind me to check the Mark 50 at 7 PM. / Remind me tomorrow morning about the reactor test.
- What do I have scheduled for tomorrow? / What reminders do I have today?
- *(attach a file)* Upload this research report to a new folder called Reactor Designs.
- Find the reactor research report.
- Send Bruce a message saying the experiment is postponed.
- **Schedule the Stark team meeting for tomorrow at 6 PM, remind me 30 minutes before it, and send Bruce a Telegram message about it.**

## Project structure

```
src/
  app/                 page (command centre) + API routes: plan, execute, calendar, reminders,
                       drive (files, folders, upload-session, upload), telegram, actions, voice, auth
  engine/              executor (queue, interrupt, confirmations, retries), voice engine, narrator, speech composer
  lib/ai/              planner (Gemini chain + guard rails), prompt, rule-based backup brain
  lib/google/          OAuth, Calendar, Drive
  lib/telegram/        bot, contacts, sending, comms log
  lib/reminders/       reminder store
  lib/voice/           ElevenLabs proxy, cache, budget
  components/          hud (status bar, reactor, boot), chat (timeline, confirm and upload cards), preview tabs, voice dock
```

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Vercel AI SDK 7 (Gemini) · zod · zustand · Google Calendar & Drive APIs · Telegram Bot API · ElevenLabs TTS · Web Speech API · Web Audio · chrono-node · jose
