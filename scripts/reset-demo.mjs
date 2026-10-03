// Clears JARVIS's local activity before recording a demo:
//   reminders, communication history and the action log.
// Keeps what took setup effort or costs money to rebuild:
//   contacts.json (Telegram contacts + aliases), _meta.json (Telegram offset/owner, voice budget),
//   tts/ (cached voice lines — free replays).
// Google Calendar events and Drive files are NOT touched — remove test items there yourself.
//
//   npm run demo:reset

import { promises as fs } from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), ".data");
const CLEAR = ["reminders.json", "comms.json", "actions.json"];

for (const name of CLEAR) {
  const file = path.join(dir, name);
  try {
    const items = JSON.parse(await fs.readFile(file, "utf8"));
    await fs.writeFile(file, "[]\n");
    console.log(`cleared ${name} (${Array.isArray(items) ? items.length : 0} entries)`);
  } catch {
    console.log(`skipped ${name} (not present)`);
  }
}

const kept = (await fs.readdir(dir).catch(() => [])).filter((n) => !CLEAR.includes(n));
console.log(`kept: ${kept.join(", ") || "nothing else"}`);
console.log("Restart the dev server if it's running, and reload the page to clear the chat.");
