# Anant's Week Manager

A calm, light-only personal dashboard for deadlines, applications, hackathons, interview/ML preparation, academics, travel, Golden Jubilee work, and daily DSA. It is a dependency-free progressive web app, so it can live on GitHub Pages and install like a desktop app.

The durable plan lives in [`MANAGER.md`](./MANAGER.md). Website check-offs and quick captures are private to the current browser until you export or copy them back to Codex.

## Open it locally

```bash
npm run serve
```

Open <http://localhost:8080>. Opening `index.html` directly will not work because browsers block the Markdown fetch on `file://` pages.

## Everyday use

1. Open **Everything** to see every open task and event in one list. Overdue work is red and sits at the top, today is amber, this week is slate, and later is grey.
2. Drag any row — or use its ↑ ↓ buttons, or `Alt+↑` / `Alt+↓` — to set your own order. It persists until you choose **Reset to automatic**. A row you drag keeps its true colour, so an overdue task still reads as overdue wherever you put it.
3. Tap `+` as you solve DSA questions; log each submitted application.
4. For any new information, send the Telegram bot a normal text or voice note. It can add tasks and events, move dates, mark work complete, record applications or rejections, and answer questions about the published plan. No command format is required.
5. Codex remains available for larger changes. The website Inbox is also a private temporary scratchpad; choose **Copy for Codex** when you want its contents made durable.
6. Travel and Golden Jubilee have separate views. Golden Jubilee is Anant's overall-coordinator board.

The automatic order considers only unfinished work. The urgency band always comes first — overdue, then today, then this week, then later — and priority orders items only inside a band, so a P0 due next week can never jump above a P2 due today. Undated work sits at the end. A row you drag keeps its position until you reset it.

## Website and Dock app sync

- The website and Safari Dock app load the same published code and `MANAGER.md`, so Codex- or Telegram-published tasks, dates, and status updates appear in both after a refresh.
- Check-offs, your manual order, date/time edits, DSA counts, quick notes, and locally logged applications use browser storage. Treat Safari and the Dock app as separate for this local data.
- Completed tasks move to **Completed** instead of disappearing. To make a local completion visible everywhere, use **Inbox & sync → Copy for Codex**, paste the update into Codex, and ask it to publish.

## Edit dates and times

- Click any task or event, in any view, to open one editor covering every field it holds — title, dates, priority, area, status, next action, link, and notes.
- The editor never navigates away from the view you are on.
- Leaving the time blank makes an all-day date. If a start time is supplied without an end time, the event is saved as ending at the same time.
- These edits immediately affect ordering and calendar export in the current browser or Dock app. Use **Inbox & sync → Copy for Codex** to publish them into `MANAGER.md` so every installation and Telegram sees them.
- The editor's **Use published values** button discards the local override.

## Install it on your desktop

This is a PWA, which is the most reliable website-based equivalent of a small desktop widget:

- **Chrome or Edge:** open the hosted site, select the install icon in the address bar, then choose **Install**.
- **Safari on macOS:** open the hosted site and choose **File → Add to Dock**.
- Keep the resulting app in your Dock and resize it to a narrow panel if you want an always-nearby focus view.

A website cannot create a true macOS desktop widget by itself. That would require a separate native WidgetKit wrapper; the installed PWA keeps this version fast and maintenance-free.

## GitHub Pages

The included workflow validates and publishes the static app whenever `main` is pushed.

1. Create a GitHub repository and push this folder to its `main` branch.
2. Open **Repository Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Run **Deploy Week Manager to GitHub Pages** from the Actions tab if it did not start automatically.

The expected URL is `https://YOUR-USERNAME.github.io/REPOSITORY/`.

> Privacy: a public GitHub repository makes `MANAGER.md` and its personal planning details public. Use a private repository with a GitHub plan that supports private Pages, or keep the app local, if that is not acceptable.

## Telegram bot: reminders and manager updates

The bot has two jobs:

- `Telegram reminders` sends a Markdown-driven digest at approximately **9:00 AM** and **7:00 PM IST** every day.
- `Telegram manager` checks for a new text or voice note about every five minutes. Voice is transcribed with OpenAI, then a Codex agent reads `AGENTS.md` and the current `MANAGER.md`, makes the appropriate durable update, validates it, publishes it, and replies in Telegram.

GitHub may occasionally delay scheduled jobs. This version normally replies within roughly **5–10 minutes**; it is not an instant webhook. Replies are text-only. For a short answer to a clarification, use Telegram's **Reply** action on the bot's question so the next agent run receives that context.

### 1. Create the bot

1. Open Telegram and message `@BotFather`.
2. Run `/newbot`, follow its prompts, and copy the bot token somewhere secure.
3. Open your new bot and send it any message such as `start`.

### 2. Find your chat ID

After messaging the bot, open this URL with your token substituted locally:

```text
https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
```

Find `message.chat.id` in the response. Do not put the token or chat ID in any tracked file.

### 3. Add GitHub secrets

In the repository, open **Settings → Secrets and variables → Actions** and add:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `OPENAI_API_KEY`

Create the OpenAI API key in the OpenAI platform dashboard and make sure API billing is enabled. API usage is separate from a ChatGPT or Codex subscription. Never paste this key into Telegram, the repository, or a chat message; save it directly as the GitHub secret.

Then activate the incoming manager:

1. Open **Actions → Telegram manager → Run workflow**.
2. Choose `reset_backlog` once. This prevents old setup messages from being treated as new planning updates.
3. Wait for the green check, then send the bot a fresh text such as `Add a task to review my resume tomorrow at 7 PM`.
4. The scheduled workflow will acknowledge it, let Codex update the manager, and reply with the result and website link.

The agent understands normal language; it is not a fixed command or keyword engine. It can decide that no file change is needed, or ask one concrete question when an important detail is missing. Its automated write access is still limited to `MANAGER.md`, and the same tests used for normal publishing must pass.

To test the outbound digest, open **Actions → Telegram reminders → Run workflow** and choose a morning or evening reminder. The reminder script uses Telegram's HTTPS `sendMessage` Bot API and reads only `MANAGER.md`.

Preview a reminder locally without sending anything:

```bash
npm run reminder:preview
```

Browser-only check-offs are not visible to the scheduled workflow until you sync them back to `MANAGER.md`.

The Telegram manager updates the Week Manager's own task/event calendar and its `.ics` export. It does not directly write to Google Calendar or Apple Calendar.

## Calendar export

Choose **Export calendar** from This week, Hackathons, or Inbox. The downloaded `.ics` file includes known events and every dated open task. Import it into Google Calendar, Apple Calendar, or Outlook. Dates marked “not announced” are intentionally excluded.

## Codex integration

The static website never receives an API token. Agent work happens server-side in GitHub Actions:

- `MANAGER.md` is the shared source Codex can edit.
- `AGENTS.md` teaches future Codex sessions how to interpret updates.
- The browser can generate a clean update artifact for Codex.
- Telegram text or transcribed voice can start an official Codex GitHub Action that is confined to the manager file.

The Telegram agent is not literally this exact open Codex conversation and does not inherit its hidden chat history. Its durable memory is `MANAGER.md` plus `AGENTS.md`; a Telegram reply carries the bot's preceding question as short-term context. Keeping the API key in GitHub Secrets avoids exposing it in the public GitHub Pages app.

## Instagram notification plan

Telegram should be made reliable first. An Instagram version belongs in a later backend phase because Meta account eligibility, app setup, server-side tokens, messaging permissions, and review may be required. Never embed a Meta access token in this Pages app. The desired content—reading check-ins, preparation nudges, and deadlines—can reuse the same digest builder once that backend exists.

## Files that matter

- `MANAGER.md` — human-readable source of truth
- `index.html`, `styles.css`, `app.js` — static PWA
- `scripts/telegram-reminder.mjs` — morning/evening Telegram digest
- `scripts/telegram-manager.mjs` — secure Telegram intake, voice transcription, and replies
- `.github/workflows/` — Pages deployment and reminder schedules
- `AGENTS.md` — future Codex update protocol
- `.agents/skills/sharpen-intent/` — manual-only project skill supplied by Anant

## Validate changes

```bash
npm test
```

This checks the Markdown schema, important date parsing, Telegram digest generation, and duplicate task IDs without downloading any dependencies.
