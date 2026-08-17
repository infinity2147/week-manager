# Anant's Week Manager

A calm, light-only personal dashboard for deadlines, applications, hackathons, interview/ML preparation, academics, travel, Golden Jubilee work, and daily DSA. It is a dependency-free progressive web app, so it can live on GitHub Pages and install like a desktop app.

The durable plan lives in [`MANAGER.md`](./MANAGER.md). Website check-offs and quick captures are private to the current browser until you export or copy them back to Codex.

## Open it locally

```bash
npm run serve
```

Open <http://localhost:8080>. Opening `index.html` directly will not work because browsers block the Markdown fetch on `file://` pages.

## Everyday use

1. Open **Now** to arrange up to eight things for today. The first three become the **Today** focus; use the arrow buttons to reorder them.
2. Open **Today** and work only from those first three items. If fewer than three were chosen manually, automatic ranking fills the gaps.
3. Tap `+` as you solve DSA questions; log each submitted application.
4. For any new information, open this folder in Codex and say: `Add these to my manager and publish: ...` Then write naturally or paste the original email/message. No table or special format is required.
5. If Codex is not open, use the website Inbox as a temporary scratchpad. Later choose **Copy for Codex** and paste the generated update into Codex.
6. Travel and Golden Jubilee have separate views. Golden Jubilee is Anant's overall-coordinator board.

The automatic Top 3 considers only unfinished work. Its score gives overdue tasks the strongest urgency boost, starts P0 ahead of P1 and P1 ahead of P2, raises nearer deadlines each day, and leaves undated work at the end. A manual **Now** order always wins. The order is keyed to the current date, so tomorrow starts clean while every unfinished task remains open in the normal queue.

## Website and Dock app sync

- The website and Safari Dock app load the same published code and `MANAGER.md`, so Codex-published tasks, dates, and status updates appear in both after a refresh.
- Check-offs, today's manual order, date/time edits, DSA counts, quick notes, and locally logged applications use browser storage. Treat Safari and the Dock app as separate for this local data.
- Completed tasks move to **Completed** instead of disappearing. To make a local completion visible everywhere, use **Inbox & sync → Copy for Codex**, paste the update into Codex, and ask it to publish.

## Edit dates and times

- Tap any task deadline (or its pencil) to change its date and optional time.
- Tap an event's **Edit** button, or tap it in the weekly grid, to change its start and end.
- Leaving the time blank makes an all-day date. If a start time is supplied without an end time, the event is saved as ending at the same time.
- These edits immediately affect ordering and calendar export in the current browser or Dock app. Use **Inbox & sync → Copy for Codex** to publish them into `MANAGER.md` so every installation and Telegram sees them.
- The edit dialog's **Use published schedule** button discards the local override.

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

## Telegram reminders

The `Telegram reminders` workflow sends a Markdown-driven digest at approximately **9:00 AM** and **7:00 PM IST** every day. GitHub may occasionally delay scheduled jobs by a few minutes.

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

Then open **Actions → Telegram reminders → Run workflow** and send a manual morning test. The script uses Telegram's HTTPS `sendMessage` Bot API and reads only `MANAGER.md`.

Preview a reminder locally without sending anything:

```bash
npm run reminder:preview
```

Browser-only check-offs are not visible to the scheduled workflow until you sync them back to `MANAGER.md`.

## Calendar export

Choose **Export calendar** from This week, Hackathons, or Inbox. The downloaded `.ics` file includes known events and every dated open task. Import it into Google Calendar, Apple Calendar, or Outlook. Dates marked “not announced” are intentionally excluded.

## Codex integration

The safe static-site integration is deliberately simple:

- `MANAGER.md` is the shared source Codex can edit.
- `AGENTS.md` teaches future Codex sessions how to interpret updates.
- The browser generates a clean update artifact for Codex.

The official Codex SDK is server-side and requires Node.js; placing it and its credentials directly in a public GitHub Pages app would expose sensitive access. A true in-site chat can be added later with a small authenticated backend, but it is not required for the weekly workflow.

## Instagram notification plan

Telegram should be made reliable first. An Instagram version belongs in a later backend phase because Meta account eligibility, app setup, server-side tokens, messaging permissions, and review may be required. Never embed a Meta access token in this Pages app. The desired content—reading check-ins, preparation nudges, and deadlines—can reuse the same digest builder once that backend exists.

## Files that matter

- `MANAGER.md` — human-readable source of truth
- `index.html`, `styles.css`, `app.js` — static PWA
- `scripts/telegram-reminder.mjs` — morning/evening Telegram digest
- `.github/workflows/` — Pages deployment and reminder schedules
- `AGENTS.md` — future Codex update protocol
- `.agents/skills/sharpen-intent/` — manual-only project skill supplied by Anant

## Validate changes

```bash
npm test
```

This checks the Markdown schema, important date parsing, Telegram digest generation, and duplicate task IDs without downloading any dependencies.
