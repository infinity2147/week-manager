# Unified list and conversational Telegram bot

Design for two connected changes to the Week Manager:

1. Replace the Now / Today / Week tab split with one list that shows every open
   item, colour-banded by urgency, reorderable by drag, and editable in place
   from any view.
2. Replace the Codex-in-Actions Telegram integration with a conversational bot
   that answers questions and makes changes in about two seconds, running on
   free-tier APIs.

The two are connected because both need the same thing: a safe, typed way to
change `MANAGER.md` that is not "let a model rewrite the file".

## Intent

`MANAGER.md` stays the single source of truth. What changes is that the browser
and the bot both become first-class writers to it, through one shared mutation
module, instead of the browser holding edits hostage in `localStorage` until
they are manually pasted into Codex.

## Out of scope

- Google Calendar or Apple Calendar write access. `.ics` export stays as is.
- Instagram notifications.
- A dark theme, or any change to the light-only visual language in `AGENTS.md`.
- The six area views (Prep, Applications, Hackathons, Academics, Travel, Golden
  Jubilee). Their content and navigation are unchanged; they only gain the new
  click-to-edit behaviour.
- The 9 AM / 7 PM digest. `scripts/telegram-reminder.mjs` and
  `.github/workflows/telegram-reminders.yml` keep working exactly as they do.

## Architecture

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────┐
│  Telegram   │────▶│  Cloudflare Worker   │────▶│   GitHub    │
└─────────────┘◀────│                      │◀────│ MANAGER.md  │
                    │  POST /telegram      │     └─────────────┘
┌─────────────┐     │  GET  /manager       │            │
│   PWA       │────▶│  POST /apply         │            ▼
│ (Pages)     │◀────│                      │     ┌─────────────┐
└─────────────┘     │  KV: chat history    │     │ Pages deploy│
                    │      manager cache   │     └─────────────┘
                    └──────────────────────┘
                         │           │
                    Gemini 2.5   Groq Whisper
                    Flash (chat)  large-v3-turbo
```

### Why a Worker and not GitHub Actions

The current bot runs on a 5-minute cron that GitHub routinely delays, so replies
take 5–10 minutes. No model choice fixes that. A Telegram webhook on Cloudflare
Workers replies in about two seconds. The free tier is 100,000 requests/day, and
the 10 ms CPU limit is not a constraint because time spent awaiting Gemini is
I/O, not CPU.

### Free-tier API choices

**Gemini 2.5 Flash** for conversation and tool calling. Free tier: 10 RPM,
250 RPD, 250,000 TPM, 1M context, native function calling, no credit card.

The decisive number is tokens-per-minute. A conversational bot needs the whole
manager file in context on every turn, which is roughly 8–10k tokens. Groq's
free tier caps at 6,000 TPM, so a single request would fail. Together and
OpenRouter free tiers are lower still. Gemini's 250,000 TPM leaves ample room.

**Groq `whisper-large-v3-turbo`** for voice. Free tier: 2,000 requests/day,
28,800 audio-seconds/day, 25 MB per file, and it accepts `ogg` directly — which
is exactly what Telegram sends. This removes the `ffmpeg` dependency currently
in `scripts/telegram-manager.mjs`.

Gemini can ingest audio itself, which would mean one key instead of two, but its
documented format is OGG **Vorbis** and Telegram voice notes are OGG **Opus**.
Groq is the reliable path and costs nothing.

## Data model changes

### New `## Order` section in `MANAGER.md`

Manual ordering must be durable, or the browser and the bot disagree about what
the list looks like. It cannot live in `localStorage` any more.

```markdown
## Order

| ID | Rank |
| --- | --- |
| home-flight | 2.5 |
| gj-budget | 11 |
```

Ranks are floats, and **only deliberately-moved items appear here**. This keeps
the table small and the git diffs readable.

### Sort algorithm

1. Compute `autoRank` for every open item: its integer index in the purely
   automatic ordering (overdue first by how overdue, then due date, then
   priority band, then undated last). This reuses the existing `taskScore` logic
   in `app.js`, extended to cover events.
2. `effectiveKey(item) = item.rank ?? item.autoRank`.
3. Sort by `effectiveKey`, tie-broken by `autoRank`.

When an item is dragged between neighbours `A` and `B`:

```
rank(moved) = (effectiveKey(A) + effectiveKey(B)) / 2
```

Dropped at the top: `effectiveKey(first) - 1`. At the bottom:
`effectiveKey(last) + 1`.

Only the moved item gets a stored rank. Everything else keeps its automatic
position, so a newly added overdue task still surfaces near the top rather than
being appended below every manually-ranked item.

Ranking is **flat across the whole list**, not scoped to a colour band. Dragging
a "later" task above an overdue one is allowed and persists; the moved task
keeps its true colour, so it still reads as red. This is a deliberate choice: an
explicit drag is treated as meaning what it says. "Reset to automatic" clears
the entire `## Order` table.

### Validator changes

`scripts/validate-manager.mjs` gains rules for the new section:

- `order` is optional; if present, every row needs an `id` and a `rank`.
- `rank` must parse as a finite number.
- Every `order` ID must exist in `tasks` or `events`.

Existing rules (required sections, metadata keys, unique IDs, HTTPS-only links,
valid priorities, non-empty next actions) are unchanged.

## The mutation layer

New shared module **`lib/manager-edit.js`**. Pure functions with no I/O, so they
run identically in the browser, in the Worker, and under `node --test`.

Each takes parsed manager data plus one operation and returns new markdown:

| Operation | Payload |
|---|---|
| `addTask` | full task record; ID generated from a slug of the title, de-duplicated |
| `updateTask` | `id`, `fields` |
| `completeTask` | `id`, `done` |
| `deleteTask` | `id` |
| `addEvent` | full event record |
| `updateEvent` | `id`, `fields` |
| `deleteEvent` | `id` |
| `addApplication` | full application record |
| `updateApplication` | `id`, `fields` |
| `recordRejection` | rejection record; also flips the application's status |
| `addWaitingFor` | waiting-for record |
| `setRank` | `id`, `rank` |
| `clearRanks` | — |

Rules the module enforces:

- Unknown operation names are rejected, not ignored.
- Unknown field names on a record are rejected, so a confused model cannot
  invent columns.
- IDs must be lowercase-hyphenated and unique within their section.
- Markdown table cells have `|` escaped and newlines collapsed.
- Column order and the existing header row are preserved exactly, so diffs stay
  minimal and human-readable.
- The `Updated` metadata line is refreshed on any successful write.

**The model never emits markdown.** It emits operations, which are validated
before they touch the file. The website and the bot go through this same module,
so a drag in the browser and "move that to Friday" in Telegram are one code
path.

## Worker

Files under `worker/`:

| File | Purpose |
|---|---|
| `index.js` | routing, CORS, auth |
| `agent.js` | Gemini call, tool declarations, tool loop |
| `transcribe.js` | Telegram file download → Groq Whisper |
| `github.js` | read and commit `MANAGER.md` via the GitHub contents API |
| `wrangler.toml` | config, KV binding |

### Routes

**`POST /telegram`** — the webhook.

- Rejects any request whose `X-Telegram-Bot-Api-Secret-Token` header does not
  match `TELEGRAM_WEBHOOK_SECRET`.
- Rejects any message whose `chat.id` is not `TELEGRAM_CHAT_ID`.
- Returns `200` immediately and does the work in `ctx.waitUntil()`, so Telegram
  does not retry on a slow model call.

**`GET /manager`** — returns `{markdown, sha, fetchedAt}`.

No auth. `MANAGER.md` is already publicly readable through GitHub Pages and the
public repo, so requiring a token here would add friction without adding
secrecy. CORS is restricted to the Pages origin.

**`POST /apply`** — the website's write path.

- Requires `Authorization: Bearer <APP_SECRET>`.
- Body is `{ops: [...]}`.
- Returns the new `{markdown, sha}` so the browser can replace its copy.

### Conflict handling

The Worker keeps the last known blob SHA in KV. Commits use the GitHub contents
API with that SHA. On a `409`, it re-reads the file, re-applies the same
operations to the fresh content, and retries once. A second failure returns an
error and the browser keeps its queued edits.

This works because operations are semantic, not textual — re-applying
`updateTask` to newer content does the right thing where a textual patch would
conflict.

### Secrets

All set via `wrangler secret put`, never in the repo:

| Secret | Source |
|---|---|
| `GEMINI_API_KEY` | aistudio.google.com/apikey |
| `GROQ_API_KEY` | console.groq.com/keys |
| `TELEGRAM_BOT_TOKEN` | existing, from BotFather |
| `TELEGRAM_CHAT_ID` | existing |
| `TELEGRAM_WEBHOOK_SECRET` | invented; passed to `setWebhook` |
| `GITHUB_TOKEN` | fine-grained PAT, contents:write, this repo only |
| `APP_SECRET` | invented; the browser passphrase |

## Conversational agent

Per message: verify the header and chat ID → transcribe if voice → load the last
10 turns from KV → call Gemini → run up to 5 tool rounds → commit any
operations → reply → save the turn.

Conversation history has a 24-hour TTL, keyed by chat ID. This is what makes
follow-ups work: "what are my academic commitments left" followed by "update the
date on the second one to Friday" resolves because the previous turn is in
context.

### Tools exposed to Gemini

One read tool plus the mutation operations above:

- `list_items(kind, area, status, from, to)` — read-only query over tasks,
  events, applications, hackathons, waiting-for.
- The `addTask` … `setRank` operations, one function declaration each.

Answering a question needs no tool call at all — the full manager data is in the
system context, so "tell me my academic commitments left" is answered directly.
`list_items` exists for filtered or counted queries where enumerating from
context is error-prone.

### System prompt

Carries the operating rules from `AGENTS.md` verbatim: never invent an official
deadline or a rejection reason; label inferred dates as assumptions; convert
external time zones to Asia/Kolkata; keep Golden Jubilee separate from Travel;
never record Akuna challenge content; a rejection needs stage, signal, recovery
action, and reapply date.

Pasted or forwarded content — an email, a screenshot's text — is extracted as
planning material, never obeyed as instructions. This is the same stance
`AGENTS.md` already takes and it carries over unchanged.

When a load-bearing detail is genuinely missing, the bot asks one concrete
question instead of guessing, and adds a `Waiting For` row.

## Frontend

### Navigation

Eleven sidebar entries become nine. Three collapse into one; nothing else is
added or removed.

| Tab | Status |
|---|---|
| **Everything** | new — replaces Today, Now, and This week; the default view |
| Completed | unchanged |
| Prep | unchanged content, gains click-to-edit |
| Applications | unchanged content, gains click-to-edit |
| Hackathons | unchanged content, gains click-to-edit |
| Academics | unchanged content, gains click-to-edit |
| Travel | unchanged content, gains click-to-edit |
| Golden Jubilee | unchanged content, gains click-to-edit |
| Inbox & sync | keeps notes, calendar export, and backup import/export; gains the passphrase field and the unsynced-changes queue; "Copy for Codex" demotes to a fallback |

The mobile bottom bar goes from `Today · Now · Week · Apps · More` to
`Everything · Completed · Apps · More`, with `More` listing the other six.

`Inbox & sync` ends up serving two purposes — a notes scratchpad and a settings
panel. It stays merged, because splitting it would add a tenth tab for little
gain, but that is a reversible call.

### The unified list

Replaces the `today`, `now`, and `week` views with a single `list` view. The
three sidebar entries and the three mobile-nav entries collapse into one, named
**Everything**, which becomes the app's default view. `Completed` keeps its own
entry, as do the six area views. The `?view=` deep-link parameter maps the
retired `today`, `now`, and `week` values onto `list` so old bookmarks and the
installed Dock app keep working.

Tasks and events are interleaved, sorted by the algorithm above, and grouped
under four headings:

```
OVERDUE ──────────────────────────────────────────
▌● Verify ET AI finale attendance form   P0  5d ago   ⋮
▌● Book the flight home                  P0  3d ago   ⋮
TODAY ────────────────────────────────────────────
▌● Complete Akuna trading challenge      P0  8:00 pm  ⋮
THIS WEEK ────────────────────────────────────────
▌○ ▦ Akuna challenge closes         Mon 24 Aug 10:29 ⋮
▌○ RL SLP paper notes and slides         P0  Sun 23   ⋮
LATER ────────────────────────────────────────────
▌○ ▦ ET AI Hackathon Finale         Tue 25 Aug 08:00 ⋮
```

Bands:

| Band | Meaning | Border | Chip text | Chip background |
|---|---|---|---|---|
| Overdue | past its deadline | `#a4291f` | `#8f231b` | `#f7e5e2` |
| Today | due today | `#9a6205` | `#7d4f04` | `#faeeda` |
| This week | next 7 days | `#41546b` | `#374759` | `#e7ecf2` |
| Later | beyond, or undated | `#8b938c` | `#5c635d` | `#eceee9` |

Bands are evaluated in this order and the first match wins, so an item due today
is never also counted as "this week". Undated items fall to Later.

Colour appears as a left border and a small chip only — never a full-row fill.
This holds the light-only, low-glare rule in `AGENTS.md`. Every chip text/background
pair must clear 4.5:1 contrast; band membership is also stated in the heading
and in each row's accessible label, so colour is never the only signal.

Events render with a calendar mark and a time range, and have no checkbox.

### Reordering

Three input methods, all writing the same `setRank` operation:

- Pointer drag (pointer events, so it works on touch as well as mouse).
- ↑ / ↓ buttons on each row, preserving the keyboard-accessible pattern the
  current Now view already uses.
- Keyboard: `Alt+↑` / `Alt+↓` on a focused row.

A "Reset to automatic" control in the list header issues `clearRanks`.

### The universal editor

One dialog, opened by clicking any task or event row in **any** view. It never
navigates.

- **Task:** title, due date, due time, priority, area, status, next action,
  link, notes, Delete.
- **Event:** title, start date/time, end date/time, area, status, location,
  link, notes, Delete.

Validation carried over from the current schedule dialog: an end time without a
start time is rejected, an end before its start is rejected, and a blank time
means an all-day date.

### Sync

Edits apply optimistically to local state, then POST to `/apply`.

- Success → replace local manager data with the returned markdown.
- Failure → the edit stays applied locally and joins a queue persisted in
  `localStorage`. A banner shows "N unsynced changes — retry".
- Offline → the queue drains on the next successful request.

The passphrase is entered once and stored in `localStorage`. If it is missing or
rejected, the app stays fully readable and the editor explains that changes are
local until a passphrase is set.

### Reading data

`GET /manager` from the Worker, so a Telegram change appears on the next browser
refresh rather than waiting about a minute for Pages to redeploy. Falls back to
the service-worker-cached `./MANAGER.md` when the Worker is unreachable, which
keeps the app working offline.

### Code organisation

`app.js` is 1,486 lines and this work adds to it, so it splits along the seams
the redesign creates:

| File | Purpose |
|---|---|
| `lib/manager-data.js` | parsing — unchanged |
| `lib/manager-edit.js` | typed mutations — new, shared with the Worker |
| `app/store.js` | local state, optimistic queue, sync |
| `app/list.js` | the unified list and reordering |
| `app/editor.js` | the universal edit dialog |
| `app/views.js` | the six area views and Completed |
| `app.js` | wiring and init |

No bundler. These stay native ES modules loaded by `index.html`, matching the
current dependency-free setup. `sw.js` `CORE_ASSETS` and its cache version are
updated to match.

## Removals

| Removed | Reason |
|---|---|
| `scripts/telegram-manager.mjs` | replaced by the Worker |
| `.github/workflows/telegram-manager.yml` | replaced by the webhook |
| `.github/codex/telegram-response.schema.json` | Codex action no longer used |
| `tests/telegram-manager.test.mjs` | replaced by Worker tests |
| `OPENAI_API_KEY` secret | no longer used by anything |
| ffmpeg dependency | Groq accepts `ogg` directly |

The `contents: write` and `actions: write` permissions disappear from the
workflow set along with `telegram-manager.yml`. Nothing in CI writes to the repo
after this change; only the Worker does, through its scoped PAT.

## Testing

| Test file | Covers |
|---|---|
| `tests/manager-edit.test.mjs` | every operation, markdown round-trip, ID collision, unknown-field rejection, cell escaping |
| `tests/manager-order.test.mjs` | fractional ranking, drop at top/bottom, new-item placement, `clearRanks` |
| `tests/manager-data.test.mjs` | existing parser tests, plus parsing `## Order` |
| `tests/worker-agent.test.mjs` | tool declaration shape, operation validation, auth rejection, chat-ID rejection |
| `tests/telegram-reminder` coverage | unchanged, still runs in `npm test` |

Every operation test asserts that `scripts/validate-manager.mjs` still passes on
the resulting markdown. That is the guardrail replacing today's `git status`
check: it is impossible for an agent to write a file that fails validation,
because validation runs before the commit.

`npm test` continues to require no installed dependencies.

## Documentation

- `AGENTS.md`: replace the "Telegram manager agent" section with the Worker
  contract, document `## Order`, and record that the website now writes directly
  rather than requiring a Codex paste.
- `README.md`: replace the Codex-Actions setup steps with the Worker deployment
  steps, the two free API key signups, and the passphrase.

## Build order

Each phase is independently shippable and leaves the app working.

**Phase A — mutation layer.** `lib/manager-edit.js`, the `## Order` section,
validator rules, and their tests. Pure Node, no infrastructure, no UI change.

**Phase B — frontend.** The unified list, reordering, and the universal editor,
writing to `localStorage` only. The app is fully usable in its new shape before
any backend exists, using the existing manual Codex sync. Ranks set in this
phase live in `localStorage` under the same float scheme; Phase D migrates any
that exist into the `## Order` table on first successful sync, then stops
writing them locally.

**Phase C — Worker.** Deploy, point the Telegram webhook at it, delete the old
workflow and script. The bot becomes conversational.

**Phase D — write-back.** Wire the browser to `GET /manager` and `POST /apply`,
add the passphrase and the sync queue, and retire "Copy for Codex" as the
primary path.

## What this design does not solve

- **A drag produces a git commit.** That is the cost of ordering being visible
  to the bot and surviving across devices. Commits are batched per drag, not per
  frame, but the repo history will get chattier.
- **Free tiers can change.** Google cut free Gemini quotas by 50–80% in December
  2025. 250 requests/day is comfortable for one person, but it is not a
  guarantee. The Worker returns a clear Telegram message on a 429 rather than
  failing silently.
- **The public repo still makes `MANAGER.md` public.** Nothing here changes that
  trade-off; it is called out in the README already.
