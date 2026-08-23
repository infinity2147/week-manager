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

## Telegram bot: reminders and conversation

Two jobs, on different infrastructure:

- **Reminders** — a GitHub Actions cron sends a digest at roughly **9:00 AM** and **7:00 PM IST**. Unchanged.
- **Conversation** — a Cloudflare Worker webhook. Send the bot a text or voice note and it replies in about two seconds. It can add tasks and events, move dates, mark work done, log applications and rejections, and answer questions about your plan. No command syntax; it reads plain language, including Hinglish voice notes.

Because it holds the last day of conversation, follow-ups work: ask *"what academics work is left?"*, then say *"move the second one to Friday"*.

### What it costs

Nothing. Gemini 2.5 Flash's free tier is 250 requests/day and 250,000 tokens/minute; Groq's Whisper free tier is 2,000 voice notes/day; Cloudflare Workers' free tier is 100,000 requests/day. None needs a credit card. A heavy personal day uses a few dozen requests.

### Deploy it

**1. Get the two free API keys.** [aistudio.google.com/apikey](https://aistudio.google.com/apikey) for `GEMINI_API_KEY`, [console.groq.com/keys](https://console.groq.com/keys) for `GROQ_API_KEY`.

**2. Make a GitHub token.** Settings → Developer settings → Fine-grained tokens. Scope it to **this repository only**, with **Contents: read and write**. Nothing else.

**3. Invent a passphrase.** Any long random string. This is `APP_SECRET`, and it is what stops a stranger editing your plan from the public website.

**4. Deploy.**

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create MANAGER_KV     # paste the printed id into wrangler.toml
npx wrangler deploy
```

**5. Set the secrets.** Each command prompts for the value — nothing is written to the repo.

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET   # invent another random string
npx wrangler secret put APP_SECRET
```

**6. Point Telegram at the Worker**, substituting your values:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H 'content-type: application/json' \
  -d '{"url":"https://week-manager.<YOUR-SUBDOMAIN>.workers.dev/telegram","secret_token":"<TELEGRAM_WEBHOOK_SECRET>","allowed_updates":["message"]}'
```

**7. Connect the website.** Open **Inbox & sync**, paste the Worker address and your `APP_SECRET`, and save. Edits then publish to `MANAGER.md` automatically.

Send the bot something like *"book the flight home on the 26th"* to check it works.

### How it stays safe

- The webhook rejects any request without your secret header, and any message from any chat but yours.
- The model never writes Markdown. It emits typed operations that are validated before they touch the file, so it cannot invent a column, corrupt a row, or reach any file but `MANAGER.md`.
- A bad operation in a batch is dropped; the rest still apply.
- If two edits collide, the Worker re-reads and re-applies rather than overwriting.
- No key ever reaches the browser. The passphrase only authorises `/apply`.

### If something goes wrong

- **No reply at all** — check the webhook: `curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"`. Then `npx wrangler tail` in `worker/` to watch live logs.
- **"Free daily quota is used up"** — Gemini's 250/day reset at midnight Pacific.
- **Website says "Not connected"** — the address or passphrase is wrong. Edits keep working locally and publish once it is fixed.
- **"N change(s) waiting to publish"** — nothing was lost. Press **Retry**.

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
- `lib/manager-edit.js` — the only path that writes `MANAGER.md`, shared by the website and the bot
- `lib/manager-order.js` — urgency bands and manual-order arithmetic
- `worker/` — the Cloudflare Worker: Telegram webhook, Gemini agent, Groq voice, GitHub commits
- `scripts/telegram-reminder.mjs` — morning/evening Telegram digest
- `.github/workflows/` — Pages deployment and reminder schedules
- `AGENTS.md` — future Codex update protocol
- `.agents/skills/sharpen-intent/` — manual-only project skill supplied by Anant

## Validate changes

```bash
npm test
```

This checks the Markdown schema, important date parsing, Telegram digest generation, and duplicate task IDs without downloading any dependencies.
