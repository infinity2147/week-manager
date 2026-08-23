# Unified List and Mutation Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Now/Today/Week tab split with one colour-banded, drag-orderable list where clicking any task or event opens an editor in place, backed by a typed mutation layer that can safely rewrite `MANAGER.md`.

**Architecture:** Two new pure-logic modules in `lib/` carry everything testable — `manager-edit.js` rewrites `MANAGER.md` tables from typed operations, and `manager-order.js` computes urgency bands and fractional ranks. The existing 1,486-line `app.js` splits into thin DOM modules under `app/` that call into those libraries. Nothing in this plan talks to the network; edits continue to persist to `localStorage` exactly as they do today.

**Tech Stack:** Vanilla ES modules, no bundler, no dependencies. `node --test` for tests. Python's `http.server` for local serving.

This plan implements **Phases A and B** of `docs/superpowers/specs/2026-08-22-unified-list-and-conversational-bot-design.md`. Phases C and D (the Cloudflare Worker and write-back) become a second plan once the API keys exist.

## Global Constraints

- **Zero dependencies.** No `npm install`, ever. `node_modules/` must stay absent. Tests run under `node --test` with built-ins only.
- **Native ES modules.** No bundler, no transpiler. Every new file is loaded directly by the browser via `<script type="module">` or by Node via `import`.
- **Light-only theme.** No dark theme, no neon accents, no glassmorphism, no gradients. Background stays `#f6f5ef`. Colour appears as left borders and small chips only — never a full-row fill. This is a hard rule from `AGENTS.md`.
- **Colour is never the only signal.** Every band is also named in a heading and in each row's accessible label.
- **Contrast floor 4.5:1** for all chip text on its chip background.
- **`MANAGER.md` diffs stay minimal.** Rewrites must preserve untouched lines byte-for-byte, including column order, header text, and cell spacing.
- **Timezone is `Asia/Kolkata`** everywhere. Never use the host timezone.
- **`npm test` must pass** at the end of every task.
- **Band vocabulary** is exactly `overdue`, `today`, `week`, `later` in code; displayed as `OVERDUE`, `TODAY`, `THIS WEEK`, `LATER`.
- **Band colours**, used verbatim:

  | Band | Border | Chip text | Chip background |
  |---|---|---|---|
  | `overdue` | `#a4291f` | `#8f231b` | `#f7e5e2` |
  | `today` | `#9a6205` | `#7d4f04` | `#faeeda` |
  | `week` | `#41546b` | `#374759` | `#e7ecf2` |
  | `later` | `#8b938c` | `#5c635d` | `#eceee9` |

## Verified facts about `MANAGER.md`

Confirmed by inspection before this plan was written. Do not re-derive:

- Line endings are LF only. The file ends with a newline.
- No cell anywhere contains a `\` or an escaped `|`.
- The literal string `\n## Operating Rules` exists exactly once.
- Column keys, in order:
  - `tasks`: `id, task, area, due, priority, status, estimate, next_action, link, notes`
  - `events`: `id, event, area, start, end, status, location, link, notes`
  - `applications`: `id, company, role, status, applied_on, next_action, follow_up, link, notes`
  - `rejections`: `id, company, role, rejected_on, stage, reason_or_signal, recovery_action, reapply_after, notes`
  - `waiting_for`: `id, missing_information, area, why_it_matters, next_check`

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `lib/manager-edit.js` | Locate, read, and rewrite `MANAGER.md` tables from typed operations |
| `lib/manager-order.js` | Urgency bands, automatic scoring, fractional rank arithmetic |
| `app/store.js` | Local state, load/save, derived selectors |
| `app/list.js` | Render the unified list; drag and keyboard reordering |
| `app/editor.js` | The universal task/event edit dialog |
| `app/format.js` | Date, escaping, and label helpers shared by every view |
| `app/views.js` | Completed, Inbox, More, and the six area views |
| `tests/manager-edit.test.mjs` | Every operation, round-trip, escaping, ID collision |
| `tests/manager-order.test.mjs` | Bands, scoring, rank arithmetic |

**Modified:**

| File | Change |
|---|---|
| `lib/manager-data.js` | Export `slug`, `splitMarkdownRow`, `TABLE_SEPARATOR` |
| `scripts/validate-manager.mjs` | Validate the optional `## Order` section |
| `app.js` | Shrinks to wiring and init |
| `index.html` | Nav collapse, editor dialog markup |
| `styles.css` | Band styles, list styles, drag affordances |
| `sw.js` | Cache new module paths, bump cache version |
| `AGENTS.md` | Document `## Order` and the new list |
| `README.md` | Document the unified list and editing |

---

## Task 1: Table locator and byte-exact round-trip

The whole mutation layer rests on being able to read a table's rows and write them back producing an identical file. Prove that first.

**Files:**
- Modify: `lib/manager-data.js:1-33`
- Create: `lib/manager-edit.js`
- Test: `tests/manager-edit.test.mjs`

**Interfaces:**
- Consumes: `parseManagerMarkdown` from `lib/manager-data.js`
- Produces:
  - `findTable(markdown, sectionSlug) -> {headerIndex, separatorIndex, firstRow, endRow, headers, keys} | null`
  - `readRows(markdown, sectionSlug) -> Array<Record<string,string>>`
  - `renderRow(keys, record) -> string`
  - `replaceRows(markdown, sectionSlug, rows) -> string`
  - `escapeCell(value) -> string`
  - From `lib/manager-data.js`: `slug`, `splitMarkdownRow`, `TABLE_SEPARATOR`

- [ ] **Step 1: Export the parsing primitives**

In `lib/manager-data.js`, add `export` to the three existing private declarations. Change line 1 from `const TABLE_SEPARATOR = ...` to:

```js
export const TABLE_SEPARATOR = /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/;
```

Change `function slug(value) {` to `export function slug(value) {` and `function splitMarkdownRow(line) {` to `export function splitMarkdownRow(line) {`. Leave the bodies untouched.

- [ ] **Step 2: Write the failing round-trip test**

Create `tests/manager-edit.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { findTable, readRows, renderRow, replaceRows, escapeCell } from "../lib/manager-edit.js";

const markdown = await readFile(new URL("../MANAGER.md", import.meta.url), "utf8");
const SECTIONS = ["tasks", "events", "applications", "rejections", "hackathons", "recurring", "waiting_for"];

test("finds every core table", () => {
  for (const name of SECTIONS) {
    const table = findTable(markdown, name);
    assert.ok(table, `no table found for ${name}`);
    assert.equal(table.keys[0], "id");
    assert.ok(table.endRow >= table.firstRow);
  }
});

test("returns null for a section that has no table", () => {
  assert.equal(findTable(markdown, "operating_rules"), null);
  assert.equal(findTable(markdown, "not_a_section"), null);
});

test("reads rows with slugified keys", () => {
  const rows = readRows(markdown, "tasks");
  assert.equal(rows.length, 29);
  assert.equal(rows[0].id, "et-confirm");
  assert.equal(rows[0].priority, "P0");
  assert.equal(rows[0].link, "https://forms.gle/w2GXNCBzozj6M7bM9");
});

test("reads an empty table as no rows", () => {
  assert.deepEqual(readRows(markdown, "rejections"), []);
});

test("rewriting every table unchanged reproduces the file byte-for-byte", () => {
  let result = markdown;
  for (const name of SECTIONS) {
    result = replaceRows(result, name, readRows(result, name));
  }
  assert.equal(result, markdown);
});

test("escapes pipes, backslashes, and newlines in cells", () => {
  assert.equal(escapeCell("a | b"), "a \\| b");
  assert.equal(escapeCell("a \\ b"), "a \\\\ b");
  assert.equal(escapeCell("a\nb"), "a b");
  assert.equal(escapeCell(undefined), "");
});

test("an escaped cell survives a round-trip", () => {
  const row = renderRow(["id", "notes"], { id: "x", notes: "a | b \\ c" });
  assert.equal(row, "| x | a \\| b \\\\ c |");
});

test("renders empty cells with the file's spacing", () => {
  assert.equal(renderRow(["id", "link", "notes"], { id: "x", notes: "n" }), "| x |  | n |");
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/manager-edit.test.mjs`
Expected: FAIL with `Cannot find module .../lib/manager-edit.js`

- [ ] **Step 4: Implement `lib/manager-edit.js`**

```js
import { slug, splitMarkdownRow, TABLE_SEPARATOR } from "./manager-data.js";

export function findTable(markdown, sectionSlug) {
  const lines = markdown.split("\n");
  let current = "";

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^##\s+(.+)$/);
    if (heading) {
      current = slug(heading[1]);
      continue;
    }
    if (current !== sectionSlug) continue;
    if (!lines[index].trim().startsWith("|")) continue;
    if (!lines[index + 1] || !TABLE_SEPARATOR.test(lines[index + 1])) continue;

    const headers = splitMarkdownRow(lines[index]);
    let endRow = index + 2;
    while (endRow < lines.length && lines[endRow].trim().startsWith("|")) endRow += 1;

    return {
      headerIndex: index,
      separatorIndex: index + 1,
      firstRow: index + 2,
      endRow,
      headers,
      keys: headers.map(slug),
    };
  }

  return null;
}

export function readRows(markdown, sectionSlug) {
  const table = findTable(markdown, sectionSlug);
  if (!table) return [];
  return markdown
    .split("\n")
    .slice(table.firstRow, table.endRow)
    .map((line) => {
      const values = splitMarkdownRow(line);
      return Object.fromEntries(table.keys.map((key, index) => [key, values[index] ?? ""]));
    });
}

export function escapeCell(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

export function renderRow(keys, record) {
  return `| ${keys.map((key) => escapeCell(record[key])).join(" | ")} |`;
}

export function replaceRows(markdown, sectionSlug, rows) {
  const table = findTable(markdown, sectionSlug);
  if (!table) throw new Error(`MANAGER.md has no table for section: ${sectionSlug}`);
  const lines = markdown.split("\n");
  const rendered = rows.map((row) => renderRow(table.keys, row));
  lines.splice(table.firstRow, table.endRow - table.firstRow, ...rendered);
  return lines.join("\n");
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/manager-edit.test.mjs`
Expected: PASS, 8 tests

- [ ] **Step 6: Confirm nothing else broke**

Run: `npm test`
Expected: all existing tests pass, then `MANAGER.md is valid · tasks:29 …`

- [ ] **Step 7: Commit**

```bash
git add lib/manager-data.js lib/manager-edit.js tests/manager-edit.test.mjs
git commit -m "Add byte-exact MANAGER.md table locator and rewriter"
```

---

## Task 2: Task row operations

**Files:**
- Modify: `lib/manager-edit.js`
- Test: `tests/manager-edit.test.mjs`

**Interfaces:**
- Consumes: `findTable`, `readRows`, `replaceRows` from Task 1
- Produces:
  - `OPERATIONS: string[]` — every valid operation name
  - `validateOperation(op) -> op` — throws on an unknown operation
  - `slugId(text, takenSet) -> string`
  - `applyOperations(markdown, ops, {today}) -> string`
  - Operations handled here: `addTask`, `updateTask`, `completeTask`, `deleteTask`

- [ ] **Step 1: Write the failing tests**

Append to `tests/manager-edit.test.mjs`:

```js
import { OPERATIONS, validateOperation, slugId, applyOperations } from "../lib/manager-edit.js";

const TODAY = "2026-08-22";

test("rejects an unknown operation", () => {
  assert.throws(() => validateOperation({ op: "dropDatabase" }), /Unknown operation: dropDatabase/);
  assert.throws(() => validateOperation(null), /must be an object/);
  assert.ok(OPERATIONS.includes("addTask"));
});

test("adds a task and generates a slug ID", () => {
  const next = applyOperations(markdown, [{
    op: "addTask",
    fields: { task: "Book the return train", area: "Travel", due: "2026-08-27", priority: "P1", status: "Open", next_action: "Check IRCTC" },
  }], { today: TODAY });
  const rows = readRows(next, "tasks");
  assert.equal(rows.length, 30);
  const added = rows.at(-1);
  assert.equal(added.id, "book-the-return-train");
  assert.equal(added.area, "Travel");
  assert.equal(added.estimate, "", "unset columns must still be present and empty");
});

test("de-duplicates a generated ID", () => {
  const taken = new Set(["book-a-flight", "book-a-flight-2"]);
  assert.equal(slugId("Book a flight", taken), "book-a-flight-3");
  assert.equal(slugId("!!!", new Set()), "item");
});

test("rejects an unknown field so a model cannot invent columns", () => {
  assert.throws(
    () => applyOperations(markdown, [{ op: "addTask", fields: { task: "X", urgency: "high" } }], { today: TODAY }),
    /Unknown tasks field\(s\): urgency/,
  );
});

test("updates a task in place and leaves every other line untouched", () => {
  const next = applyOperations(markdown, [{ op: "updateTask", id: "gj-budget", fields: { due: "2026-08-29T18:00:00+05:30" } }], { today: TODAY });
  const row = readRows(next, "tasks").find((task) => task.id === "gj-budget");
  assert.equal(row.due, "2026-08-29T18:00:00+05:30");
  assert.equal(row.task, "Draft Golden Jubilee budget", "other fields must survive");
  assert.equal(next.split("\n").length, markdown.split("\n").length, "an update must not change the line count");
});

test("refuses to change an ID", () => {
  assert.throws(
    () => applyOperations(markdown, [{ op: "updateTask", id: "gj-budget", fields: { id: "other" } }], { today: TODAY }),
    /ID cannot be changed/,
  );
});

test("errors on an unknown row rather than silently doing nothing", () => {
  assert.throws(
    () => applyOperations(markdown, [{ op: "updateTask", id: "no-such-task", fields: { status: "Done" } }], { today: TODAY }),
    /tasks has no row with ID no-such-task/,
  );
});

test("completes and reopens a task", () => {
  const done = applyOperations(markdown, [{ op: "completeTask", id: "ml-video", done: true }], { today: TODAY });
  assert.equal(readRows(done, "tasks").find((t) => t.id === "ml-video").status, "Done");
  const reopened = applyOperations(done, [{ op: "completeTask", id: "ml-video", done: false }], { today: TODAY });
  assert.equal(readRows(reopened, "tasks").find((t) => t.id === "ml-video").status, "Open");
});

test("deletes a task", () => {
  const next = applyOperations(markdown, [{ op: "deleteTask", id: "ml-video" }], { today: TODAY });
  assert.equal(readRows(next, "tasks").length, 28);
  assert.ok(!readRows(next, "tasks").some((t) => t.id === "ml-video"));
});

test("refreshes the Updated metadata line on any write", () => {
  const next = applyOperations(markdown, [{ op: "completeTask", id: "ml-video", done: true }], { today: TODAY });
  assert.match(next, /^- Updated: 2026-08-22$/m);
  assert.ok(!next.includes("- Updated: 2026-08-18"));
});

test("applies several operations in order", () => {
  const next = applyOperations(markdown, [
    { op: "addTask", fields: { task: "Alpha", next_action: "Start" } },
    { op: "updateTask", id: "alpha", fields: { priority: "P0" } },
  ], { today: TODAY });
  assert.equal(readRows(next, "tasks").at(-1).priority, "P0");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/manager-edit.test.mjs`
Expected: FAIL — `The requested module '../lib/manager-edit.js' does not provide an export named 'OPERATIONS'`

- [ ] **Step 3: Implement the operations**

Append to `lib/manager-edit.js`:

```js
const SECTION_FOR = {
  addTask: "tasks",
  updateTask: "tasks",
  completeTask: "tasks",
  deleteTask: "tasks",
};

export const OPERATIONS = Object.keys(SECTION_FOR);

export function validateOperation(operation) {
  if (!operation || typeof operation !== "object") throw new Error("An operation must be an object.");
  if (!OPERATIONS.includes(operation.op)) throw new Error(`Unknown operation: ${operation.op}`);
  return operation;
}

export function slugId(text, taken) {
  const base = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "item";
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function assertKnownFields(table, fields, section) {
  const unknown = Object.keys(fields).filter((key) => !table.keys.includes(key));
  if (unknown.length) throw new Error(`Unknown ${section} field(s): ${unknown.join(", ")}`);
}

function addRow(markdown, section, fields) {
  const table = findTable(markdown, section);
  if (!table) throw new Error(`MANAGER.md has no table for section: ${section}`);
  assertKnownFields(table, fields, section);
  const rows = readRows(markdown, section);
  const taken = new Set(rows.map((row) => row.id));
  const id = fields.id || slugId(fields[table.keys[1]], taken);
  if (taken.has(id)) throw new Error(`${section} already contains ID ${id}`);
  const blank = Object.fromEntries(table.keys.map((key) => [key, ""]));
  return replaceRows(markdown, section, [...rows, { ...blank, ...fields, id }]);
}

function updateRow(markdown, section, id, fields) {
  const table = findTable(markdown, section);
  if (!table) throw new Error(`MANAGER.md has no table for section: ${section}`);
  if ("id" in fields) throw new Error("An ID cannot be changed.");
  assertKnownFields(table, fields, section);
  const rows = readRows(markdown, section);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new Error(`${section} has no row with ID ${id}`);
  rows[index] = { ...rows[index], ...fields };
  return replaceRows(markdown, section, rows);
}

function deleteRow(markdown, section, id) {
  const rows = readRows(markdown, section);
  if (!rows.some((row) => row.id === id)) throw new Error(`${section} has no row with ID ${id}`);
  return replaceRows(markdown, section, rows.filter((row) => row.id !== id));
}

const APPLY = {
  addTask: (markdown, op) => addRow(markdown, "tasks", op.fields),
  updateTask: (markdown, op) => updateRow(markdown, "tasks", op.id, op.fields),
  completeTask: (markdown, op) => updateRow(markdown, "tasks", op.id, { status: op.done ? "Done" : "Open" }),
  deleteTask: (markdown, op) => deleteRow(markdown, "tasks", op.id),
};

function touchUpdated(markdown, today) {
  return markdown.replace(/^- Updated: .*$/m, `- Updated: ${today}`);
}

export function applyOperations(markdown, operations, { today }) {
  if (!today) throw new Error("applyOperations needs a today date in Asia/Kolkata.");
  let result = markdown;
  for (const operation of operations) {
    validateOperation(operation);
    result = APPLY[operation.op](result, operation);
  }
  return operations.length ? touchUpdated(result, today) : result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/manager-edit.test.mjs`
Expected: PASS, 22 tests

- [ ] **Step 5: Commit**

```bash
git add lib/manager-edit.js tests/manager-edit.test.mjs
git commit -m "Add typed task operations to the manager mutation layer"
```

---

## Task 3: Event, application, rejection, and waiting-for operations

**Files:**
- Modify: `lib/manager-edit.js`
- Test: `tests/manager-edit.test.mjs`

**Interfaces:**
- Consumes: `addRow`, `updateRow`, `deleteRow`, `SECTION_FOR`, `APPLY` from Task 2
- Produces: operations `addEvent`, `updateEvent`, `deleteEvent`, `addApplication`, `updateApplication`, `recordRejection`, `addWaitingFor`

- [ ] **Step 1: Write the failing tests**

Append to `tests/manager-edit.test.mjs`:

```js
test("adds and updates an event", () => {
  const added = applyOperations(markdown, [{
    op: "addEvent",
    fields: { event: "Pocket FM interview", area: "Career", start: "2026-08-28T15:00:00+05:30", end: "2026-08-28T16:00:00+05:30", status: "Confirmed" },
  }], { today: TODAY });
  const row = readRows(added, "events").at(-1);
  assert.equal(row.id, "pocket-fm-interview");
  assert.equal(row.location, "");

  const moved = applyOperations(added, [{ op: "updateEvent", id: "pocket-fm-interview", fields: { start: "2026-08-29T15:00:00+05:30" } }], { today: TODAY });
  assert.equal(readRows(moved, "events").at(-1).start, "2026-08-29T15:00:00+05:30");
});

test("deletes an event", () => {
  const next = applyOperations(markdown, [{ op: "deleteEvent", id: "go-home" }], { today: TODAY });
  assert.ok(!readRows(next, "events").some((event) => event.id === "go-home"));
});

test("adds an application", () => {
  const next = applyOperations(markdown, [{
    op: "addApplication",
    fields: { company: "Linear", role: "ML Engineer", status: "Applied", applied_on: "2026-08-22", follow_up: "2026-08-29" },
  }], { today: TODAY });
  const row = readRows(next, "applications").at(-1);
  assert.equal(row.id, "linear");
  assert.equal(row.role, "ML Engineer");
});

test("recording a rejection also flips the application status", () => {
  const next = applyOperations(markdown, [{
    op: "recordRejection",
    applicationId: "app-revolut",
    fields: { company: "Revolut", role: "Role not recorded", rejected_on: "2026-08-22", stage: "Application", reason_or_signal: "Portal moved to Not selected", recovery_action: "Ask for feedback by email", reapply_after: "2027-02-22" },
  }], { today: TODAY });
  const rejection = readRows(next, "rejections").at(-1);
  assert.equal(rejection.id, "revolut");
  assert.equal(rejection.stage, "Application");
  assert.equal(readRows(next, "applications").find((a) => a.id === "app-revolut").status, "Rejected");
});

test("a rejection for an unknown application is refused", () => {
  assert.throws(
    () => applyOperations(markdown, [{ op: "recordRejection", applicationId: "app-nope", fields: { company: "Nope" } }], { today: TODAY }),
    /applications has no row with ID app-nope/,
  );
});

test("adds a waiting-for row", () => {
  const next = applyOperations(markdown, [{
    op: "addWaitingFor",
    fields: { missing_information: "Pocket FM interview format", area: "Career", why_it_matters: "Cannot prepare without it", next_check: "2026-08-25" },
  }], { today: TODAY });
  assert.equal(readRows(next, "waiting_for").at(-1).id, "pocket-fm-interview-format");
});

test("every table still round-trips after a batch of writes", () => {
  const next = applyOperations(markdown, [
    { op: "addTask", fields: { task: "Round trip check", next_action: "None" } },
    { op: "addEvent", fields: { event: "Round trip event", start: "2026-09-01" } },
  ], { today: TODAY });
  for (const name of SECTIONS) {
    assert.equal(replaceRows(next, name, readRows(next, name)), next, `${name} did not round-trip`);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/manager-edit.test.mjs`
Expected: FAIL — `Unknown operation: addEvent`

- [ ] **Step 3: Extend `SECTION_FOR` and `APPLY`**

In `lib/manager-edit.js`, replace the `SECTION_FOR` object with:

```js
const SECTION_FOR = {
  addTask: "tasks",
  updateTask: "tasks",
  completeTask: "tasks",
  deleteTask: "tasks",
  addEvent: "events",
  updateEvent: "events",
  deleteEvent: "events",
  addApplication: "applications",
  updateApplication: "applications",
  recordRejection: "rejections",
  addWaitingFor: "waiting_for",
};
```

Replace the `APPLY` object with:

```js
const APPLY = {
  addTask: (markdown, op) => addRow(markdown, "tasks", op.fields),
  updateTask: (markdown, op) => updateRow(markdown, "tasks", op.id, op.fields),
  completeTask: (markdown, op) => updateRow(markdown, "tasks", op.id, { status: op.done ? "Done" : "Open" }),
  deleteTask: (markdown, op) => deleteRow(markdown, "tasks", op.id),
  addEvent: (markdown, op) => addRow(markdown, "events", op.fields),
  updateEvent: (markdown, op) => updateRow(markdown, "events", op.id, op.fields),
  deleteEvent: (markdown, op) => deleteRow(markdown, "events", op.id),
  addApplication: (markdown, op) => addRow(markdown, "applications", op.fields),
  updateApplication: (markdown, op) => updateRow(markdown, "applications", op.id, op.fields),
  recordRejection: (markdown, op) => addRow(
    updateRow(markdown, "applications", op.applicationId, { status: "Rejected" }),
    "rejections",
    op.fields,
  ),
  addWaitingFor: (markdown, op) => addRow(markdown, "waiting_for", op.fields),
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/manager-edit.test.mjs`
Expected: PASS, 33 tests

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add lib/manager-edit.js tests/manager-edit.test.mjs
git commit -m "Add event, application, rejection, and waiting-for operations"
```

---

## Task 4: The `## Order` section and rank operations

**Files:**
- Modify: `lib/manager-edit.js`
- Test: `tests/manager-edit.test.mjs`

**Interfaces:**
- Consumes: `findTable`, `readRows`, `replaceRows`, `APPLY` from Tasks 1–3
- Produces:
  - `ensureOrderSection(markdown) -> string`
  - `readRanks(markdown) -> Record<string, number>`
  - Operations `setRank` (`{op, id, rank}`) and `clearRanks` (`{op}`)

- [ ] **Step 1: Write the failing tests**

Append to `tests/manager-edit.test.mjs`:

```js
import { ensureOrderSection, readRanks } from "../lib/manager-edit.js";

test("creates the Order section immediately before Operating Rules", () => {
  const next = ensureOrderSection(markdown);
  assert.match(next, /\n## Order\n\n\| ID \| Rank \|\n\| --- \| --- \|\n\n## Operating Rules/);
  assert.deepEqual(readRows(next, "order"), []);
});

test("creating the Order section twice is a no-op", () => {
  const once = ensureOrderSection(markdown);
  assert.equal(ensureOrderSection(once), once);
});

test("creating the Order section changes nothing else", () => {
  const next = ensureOrderSection(markdown);
  for (const name of SECTIONS) {
    assert.deepEqual(readRows(next, name), readRows(markdown, name));
  }
});

test("sets a rank, creating the section on demand", () => {
  const next = applyOperations(markdown, [{ op: "setRank", id: "gj-budget", rank: 2.5 }], { today: TODAY });
  assert.deepEqual(readRanks(next), { "gj-budget": 2.5 });
});

test("setting a rank twice replaces rather than duplicates", () => {
  const next = applyOperations(markdown, [
    { op: "setRank", id: "gj-budget", rank: 2.5 },
    { op: "setRank", id: "gj-budget", rank: 9 },
  ], { today: TODAY });
  assert.deepEqual(readRanks(next), { "gj-budget": 9 });
  assert.equal(readRows(next, "order").length, 1);
});

test("ranks are stored sorted so diffs stay stable", () => {
  const next = applyOperations(markdown, [
    { op: "setRank", id: "gj-budget", rank: 9 },
    { op: "setRank", id: "ml-video", rank: 2 },
    { op: "setRank", id: "dl-video", rank: 5 },
  ], { today: TODAY });
  assert.deepEqual(readRows(next, "order").map((row) => row.id), ["ml-video", "dl-video", "gj-budget"]);
});

test("rejects a rank that is not a finite number", () => {
  assert.throws(() => applyOperations(markdown, [{ op: "setRank", id: "gj-budget", rank: "soon" }], { today: TODAY }), /rank must be a finite number/);
  assert.throws(() => applyOperations(markdown, [{ op: "setRank", id: "gj-budget", rank: Infinity }], { today: TODAY }), /rank must be a finite number/);
});

test("rejects a rank for an item that does not exist", () => {
  assert.throws(() => applyOperations(markdown, [{ op: "setRank", id: "ghost", rank: 1 }], { today: TODAY }), /no task or event with ID ghost/);
});

test("clearRanks empties the table but keeps the section", () => {
  const ranked = applyOperations(markdown, [{ op: "setRank", id: "gj-budget", rank: 2 }], { today: TODAY });
  const cleared = applyOperations(ranked, [{ op: "clearRanks" }], { today: TODAY });
  assert.deepEqual(readRanks(cleared), {});
  assert.ok(findTable(cleared, "order"));
});

test("readRanks returns nothing when the section is absent", () => {
  assert.deepEqual(readRanks(markdown), {});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/manager-edit.test.mjs`
Expected: FAIL — no export named `ensureOrderSection`

- [ ] **Step 3: Implement the Order section**

Append to `lib/manager-edit.js`:

```js
const ORDER_BLOCK = "## Order\n\n| ID | Rank |\n| --- | --- |\n";
const OPERATING_RULES_MARKER = "\n## Operating Rules";

export function ensureOrderSection(markdown) {
  if (findTable(markdown, "order")) return markdown;
  const index = markdown.indexOf(OPERATING_RULES_MARKER);
  if (index < 0) return `${markdown.replace(/\n*$/, "\n")}\n${ORDER_BLOCK}`;
  return `${markdown.slice(0, index)}\n${ORDER_BLOCK}${markdown.slice(index)}`;
}

export function readRanks(markdown) {
  return Object.fromEntries(
    readRows(markdown, "order")
      .map((row) => [row.id, Number(row.rank)])
      .filter(([, rank]) => Number.isFinite(rank)),
  );
}

function setRank(markdown, id, rank) {
  if (!Number.isFinite(rank)) throw new Error(`A rank must be a finite number, received: ${rank}`);
  const known = new Set([
    ...readRows(markdown, "tasks").map((row) => row.id),
    ...readRows(markdown, "events").map((row) => row.id),
  ]);
  if (!known.has(id)) throw new Error(`MANAGER.md has no task or event with ID ${id}`);

  const next = ensureOrderSection(markdown);
  const rows = readRows(next, "order")
    .filter((row) => row.id !== id)
    .concat({ id, rank: String(rank) })
    .sort((a, b) => Number(a.rank) - Number(b.rank) || a.id.localeCompare(b.id));
  return replaceRows(next, "order", rows);
}
```

Add both operations to `SECTION_FOR`:

```js
  setRank: "order",
  clearRanks: "order",
```

Add both to `APPLY`:

```js
  setRank: (markdown, op) => setRank(markdown, op.id, op.rank),
  clearRanks: (markdown) => replaceRows(ensureOrderSection(markdown), "order", []),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/manager-edit.test.mjs`
Expected: PASS, 46 tests

- [ ] **Step 5: Commit**

```bash
git add lib/manager-edit.js tests/manager-edit.test.mjs
git commit -m "Add the durable Order section and rank operations"
```

---

## Task 5: Bands, scoring, and fractional rank arithmetic

This is the module the list view is built on. It is pure, so it carries the test coverage the DOM code cannot.

**Files:**
- Create: `lib/manager-order.js`
- Test: `tests/manager-order.test.mjs`

**Interfaces:**
- Consumes: `managerDate`, `localISODate` from `lib/manager-data.js`
- Produces:
  - `addDaysISO(iso, amount) -> string`
  - `bandFor(value, todayISO) -> "overdue" | "today" | "week" | "later"`
  - `autoScore(item, todayISO) -> number`
  - `toListItems({tasks, events, ranks, todayISO}) -> ListItem[]`
  - `sortListItems(items) -> ListItem[]`
  - `rankForMove(sortedItems, movedId, targetIndex) -> number`
  - `BAND_LABELS: Record<string,string>`

A `ListItem` is `{kind, id, title, when, priority, area, source, band, autoRank, rank, key}` where `kind` is `"task"` or `"event"`, `when` is the task's `due` or the event's `start`, `rank` is `undefined` when unranked, and `key` is `rank ?? autoRank`.

- [ ] **Step 1: Write the failing tests**

Create `tests/manager-order.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { addDaysISO, bandFor, autoScore, toListItems, sortListItems, rankForMove, BAND_LABELS } from "../lib/manager-order.js";

const TODAY = "2026-08-22";

test("adds days across a month boundary in Asia/Kolkata", () => {
  assert.equal(addDaysISO("2026-08-30", 3), "2026-09-02");
  assert.equal(addDaysISO("2026-08-22", 0), "2026-08-22");
  assert.equal(addDaysISO("2026-01-01", -1), "2025-12-31");
});

test("classifies bands, first match winning", () => {
  assert.equal(bandFor("2026-08-20", TODAY), "overdue");
  assert.equal(bandFor("2026-08-22T23:00:00+05:30", TODAY), "today");
  assert.equal(bandFor("2026-08-23", TODAY), "week");
  assert.equal(bandFor("2026-08-29", TODAY), "week");
  assert.equal(bandFor("2026-08-30", TODAY), "later");
});

test("undated and placeholder values fall to later", () => {
  assert.equal(bandFor("", TODAY), "later");
  assert.equal(bandFor("Date not announced", TODAY), "later");
  assert.equal(bandFor("Exact time not published", TODAY), "later");
});

test("every band has a display label", () => {
  assert.deepEqual(Object.keys(BAND_LABELS), ["overdue", "today", "week", "later"]);
  assert.equal(BAND_LABELS.week, "This week");
});

test("scores overdue ahead of today, and today ahead of later", () => {
  const overdue = autoScore({ when: "2026-08-19", priority: "P2" }, TODAY);
  const today = autoScore({ when: "2026-08-22", priority: "P0" }, TODAY);
  const later = autoScore({ when: "2026-09-30", priority: "P0" }, TODAY);
  assert.ok(overdue < today, "overdue must outrank today even at lower priority");
  assert.ok(today < later);
});

test("scores priority within the same day", () => {
  assert.ok(
    autoScore({ when: "2026-08-25", priority: "P0" }, TODAY) < autoScore({ when: "2026-08-25", priority: "P2" }, TODAY),
  );
});

test("undated work sorts to the very end", () => {
  const undated = autoScore({ when: "", priority: "P0" }, TODAY);
  assert.ok(undated > autoScore({ when: "2027-01-01", priority: "P2" }, TODAY));
});

const TASKS = [
  { id: "late", task: "Overdue thing", due: "2026-08-19", priority: "P1", area: "Career", status: "Open" },
  { id: "now", task: "Today thing", due: "2026-08-22", priority: "P0", area: "Career", status: "Open" },
  { id: "soon", task: "Week thing", due: "2026-08-25", priority: "P2", area: "Academics", status: "Open" },
];
const EVENTS = [{ id: "finale", event: "Finale", start: "2026-08-24", area: "Hackathon", status: "Confirmed" }];

test("builds a unified list of tasks and events", () => {
  const items = toListItems({ tasks: TASKS, events: EVENTS, ranks: {}, todayISO: TODAY });
  assert.equal(items.length, 4);
  const event = items.find((item) => item.id === "finale");
  assert.equal(event.kind, "event");
  assert.equal(event.title, "Finale");
  assert.equal(event.when, "2026-08-24");
  const task = items.find((item) => item.id === "now");
  assert.equal(task.kind, "task");
  assert.equal(task.title, "Today thing");
  assert.equal(task.when, "2026-08-22");
});

test("assigns contiguous automatic ranks in urgency order", () => {
  const items = toListItems({ tasks: TASKS, events: EVENTS, ranks: {}, todayISO: TODAY });
  assert.deepEqual(sortListItems(items).map((item) => item.id), ["late", "now", "finale", "soon"]);
  assert.deepEqual(sortListItems(items).map((item) => item.autoRank), [0, 1, 2, 3]);
});

test("a stored rank overrides the automatic position but not the band", () => {
  const items = toListItems({ tasks: TASKS, events: EVENTS, ranks: { soon: -5 }, todayISO: TODAY });
  const sorted = sortListItems(items);
  assert.equal(sorted[0].id, "soon");
  assert.equal(sorted[0].band, "week", "a dragged item keeps its true colour");
});

test("an unranked new item still lands by urgency, not at the bottom", () => {
  const withNew = [...TASKS, { id: "fresh", task: "New overdue", due: "2026-08-18", priority: "P0", area: "Career", status: "Open" }];
  const sorted = sortListItems(toListItems({ tasks: withNew, events: EVENTS, ranks: { soon: 1.5 }, todayISO: TODAY }));
  assert.equal(sorted[0].id, "fresh", "a new overdue task must surface near the top");
});

test("moving into the middle picks the midpoint of its neighbours", () => {
  const sorted = sortListItems(toListItems({ tasks: TASKS, events: EVENTS, ranks: {}, todayISO: TODAY }));
  assert.equal(rankForMove(sorted, "soon", 1), 0.5);
});

test("moving to the top and bottom steps outside the range", () => {
  const sorted = sortListItems(toListItems({ tasks: TASKS, events: EVENTS, ranks: {}, todayISO: TODAY }));
  assert.equal(rankForMove(sorted, "soon", 0), -1);
  assert.equal(rankForMove(sorted, "late", 3), 4);
});

test("moving inside a one-item list is harmless", () => {
  const sorted = sortListItems(toListItems({ tasks: [TASKS[0]], events: [], ranks: {}, todayISO: TODAY }));
  assert.equal(rankForMove(sorted, "late", 0), 0);
});

test("a move survives a round-trip through the sort", () => {
  const items = toListItems({ tasks: TASKS, events: EVENTS, ranks: {}, todayISO: TODAY });
  const sorted = sortListItems(items);
  const rank = rankForMove(sorted, "soon", 1);
  const after = sortListItems(toListItems({ tasks: TASKS, events: EVENTS, ranks: { soon: rank }, todayISO: TODAY }));
  assert.deepEqual(after.map((item) => item.id), ["late", "soon", "now", "finale"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/manager-order.test.mjs`
Expected: FAIL with `Cannot find module .../lib/manager-order.js`

- [ ] **Step 3: Implement `lib/manager-order.js`**

```js
import { localISODate, managerDate } from "./manager-data.js";

const TIMEZONE = "Asia/Kolkata";
const DAY = 86_400_000;
const PRIORITY_SCORE = { P0: 0, P1: 25, P2: 50 };
const UNDATED_SCORE = 100_000;

export const BAND_LABELS = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
};

function noon(isoDate) {
  return new Date(`${isoDate}T12:00:00+05:30`);
}

export function addDaysISO(isoDate, amount) {
  const date = noon(isoDate);
  date.setDate(date.getDate() + amount);
  return localISODate(date, TIMEZONE);
}

function dayOf(value) {
  const date = managerDate(value);
  return date ? localISODate(date, TIMEZONE) : "";
}

export function bandFor(value, todayISO) {
  const day = dayOf(value);
  if (!day) return "later";
  if (day < todayISO) return "overdue";
  if (day === todayISO) return "today";
  return day <= addDaysISO(todayISO, 7) ? "week" : "later";
}

export function autoScore(item, todayISO) {
  const priority = PRIORITY_SCORE[item.priority] ?? 40;
  const day = dayOf(item.when);
  if (!day) return UNDATED_SCORE + priority;
  const days = Math.round((noon(day) - noon(todayISO)) / DAY);
  return days < 0 ? days * 8 - 1000 + priority : days * 12 + priority;
}

export function toListItems({ tasks = [], events = [], ranks = {}, todayISO }) {
  const items = [
    ...tasks.map((task) => ({
      kind: "task",
      id: task.id,
      title: task.task,
      when: task.due,
      priority: task.priority || "",
      area: task.area || "",
      source: task,
    })),
    ...events.map((event) => ({
      kind: "event",
      id: event.id,
      title: event.event,
      when: event.start,
      priority: "",
      area: event.area || "",
      source: event,
    })),
  ];

  return items
    .map((item) => ({ ...item, band: bandFor(item.when, todayISO), score: autoScore(item, todayISO) }))
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
    .map((item, index) => ({ ...item, autoRank: index, rank: ranks[item.id], key: ranks[item.id] ?? index }));
}

export function sortListItems(items) {
  return [...items].sort((a, b) => a.key - b.key || a.autoRank - b.autoRank);
}

export function rankForMove(sortedItems, movedId, targetIndex) {
  const others = sortedItems.filter((item) => item.id !== movedId);
  const before = others[targetIndex - 1];
  const after = others[targetIndex];
  if (!before && !after) return 0;
  if (!before) return after.key - 1;
  if (!after) return before.key + 1;
  return (before.key + after.key) / 2;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/manager-order.test.mjs`
Expected: PASS, 15 tests

- [ ] **Step 5: Commit**

```bash
git add lib/manager-order.js tests/manager-order.test.mjs
git commit -m "Add urgency bands, automatic scoring, and fractional ranks"
```

---

## Task 6: Validate the `## Order` section

**Files:**
- Modify: `scripts/validate-manager.mjs:6-30`
- Test: `tests/manager-edit.test.mjs`

**Interfaces:**
- Consumes: `parseManagerMarkdown`
- Produces: no new exports; the script gains rules and keeps its exit-code contract

- [ ] **Step 1: Write the failing test**

Append to `tests/manager-edit.test.mjs`:

```js
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdtemp, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = promisify(execFile);

async function validate(content) {
  const directory = await mkdtemp(join(tmpdir(), "manager-"));
  await cp(new URL("../lib", import.meta.url), join(directory, "lib"), { recursive: true });
  await cp(new URL("../scripts", import.meta.url), join(directory, "scripts"), { recursive: true });
  await writeFile(join(directory, "MANAGER.md"), content, "utf8");
  try {
    const { stdout } = await run(process.execPath, [join(directory, "scripts/validate-manager.mjs")]);
    return { ok: true, output: stdout };
  } catch (error) {
    return { ok: false, output: `${error.stdout || ""}${error.stderr || ""}` };
  }
}

test("a file with no Order section is still valid", async () => {
  assert.equal((await validate(markdown)).ok, true);
});

test("a well-formed Order section validates", async () => {
  const ranked = applyOperations(markdown, [{ op: "setRank", id: "gj-budget", rank: 2.5 }], { today: TODAY });
  assert.equal((await validate(ranked)).ok, true);
});

test("a non-numeric rank fails validation", async () => {
  const broken = markdown.replace("\n## Operating Rules", "\n## Order\n\n| ID | Rank |\n| --- | --- |\n| gj-budget | soon |\n\n## Operating Rules");
  const result = await validate(broken);
  assert.equal(result.ok, false);
  assert.match(result.output, /rank is not a number/);
});

test("an Order row pointing at nothing fails validation", async () => {
  const broken = markdown.replace("\n## Operating Rules", "\n## Order\n\n| ID | Rank |\n| --- | --- |\n| ghost | 1 |\n\n## Operating Rules");
  const result = await validate(broken);
  assert.equal(result.ok, false);
  assert.match(result.output, /order\/ghost is not a known task or event/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/manager-edit.test.mjs`
Expected: FAIL — the two "broken" cases exit 0 because no rule exists yet

- [ ] **Step 3: Add the rules**

In `scripts/validate-manager.mjs`, immediately after the existing `for (const task of data.sections.tasks || [])` loop and before `if (errors.length)`, insert:

```js
const orderableIds = new Set([
  ...(data.sections.tasks || []).map((task) => task.id),
  ...(data.sections.events || []).map((event) => event.id),
]);

for (const row of data.sections.order || []) {
  if (!Number.isFinite(Number(row.rank))) errors.push(`order/${row.id} rank is not a number: ${row.rank}`);
  if (!orderableIds.has(row.id)) errors.push(`order/${row.id} is not a known task or event`);
}
```

`order` stays out of `requiredSections`, so a file without it remains valid.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/manager-edit.test.mjs`
Expected: PASS, 56 tests

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add scripts/validate-manager.mjs tests/manager-edit.test.mjs
git commit -m "Validate the optional Order section"
```

---

## Task 7: Extract the store

`app.js` is 1,486 lines. Pull state handling out first so the list and editor have somewhere clean to sit.

**Files:**
- Create: `app/store.js`
- Modify: `app.js:8-110`, `app.js:196-350`
- Modify: `index.html:229`

**Interfaces:**
- Consumes: `lib/manager-data.js`, `lib/manager-order.js`, `lib/manager-edit.js`
- Produces:
  - `state` — the live mutable object
  - `loadState()`, `saveState({render})`, `setRenderer(fn)`
  - `setManager(parsed)`, `section(name)`
  - `allTasks()`, `allEvents()`, `sourceTasks()`
  - `isDone(task)`, `sourceTaskDone(task)`, `effectiveTaskStatus(task)`
  - `openListItems() -> ListItem[]` — sorted, completed excluded
  - `ranks()`, `setRank(id, rank)`, `clearRanks()`
  - `todayKey() -> string`

- [ ] **Step 1: Create `app/store.js`**

Move these declarations out of `app.js` verbatim, changing nothing but adding `export`: `STORAGE_KEY`, `TIMEZONE`, `DEFAULT_STATE`, `loadState`, `saveState`, `section`, `effectiveTaskStatus`, `isDone`, `sourceTaskDone`, `sourceTasks`, `allTasks`, `allEvents`, `todayKey`.

Add `schema: 4` to `DEFAULT_STATE`, add `ranks: {}`, and **replace** `scheduleOverrides` with a single `overrides` map:

```js
export const DEFAULT_STATE = {
  schema: 4,
  view: "today",
  completed: {},
  completedAt: {},
  overrides: { tasks: {}, events: {} },
  ranks: {},
  dayPlans: {},
  applicationStatuses: {},
  dsa: {},
  localItems: [],
  applications: [],
  inbox: [],
};
```

Leave `view` as `"today"` for now — the `list` view does not exist until Task 8,
and Task 12 switches the default once it does.

One map, not two. Task 10 stores full field edits in it, and a date-only edit is
just an edit whose only key is `due`. In `loadState`, migrate any schema-3 data
forward and preserve both new keys:

```js
function migrateOverrides(saved) {
  const legacy = saved?.scheduleOverrides || {};
  const current = saved?.overrides || {};
  return {
    tasks: { ...(legacy.tasks || {}), ...(current.tasks || {}) },
    events: { ...(legacy.events || {}), ...(current.events || {}) },
  };
}
```

Then inside the returned object use:

```js
overrides: migrateOverrides(saved),
ranks: { ...DEFAULT_STATE.ranks, ...(saved?.ranks || {}) },
```

and delete the old `scheduleOverrides: {...}` entry. Apply the identical
migration in the backup-import handler in `app.js`, which rebuilds state the
same way.

Rename the two helpers that read the old map — `hasScheduleOverride(kind, id)`
and `scheduleOverrideCount()` — to read `state.overrides` instead of
`state.scheduleOverrides`. `localChangeCount` and `codexUpdateMarkdown` call
them, so no further change is needed there.

Because `saveState` used to call `renderView()` directly and the store must not import the view layer, add an injected renderer:

```js
let renderer = () => {};

export function setRenderer(callback) {
  renderer = callback;
}

export function saveState({ render = true } = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (render) renderer();
}
```

Add the manager holder and the list selector:

```js
import { toListItems, sortListItems } from "../lib/manager-order.js";

export let manager = { metadata: {}, sections: {} };

export function setManager(parsed) {
  manager = parsed;
}

export function ranks() {
  return state.ranks;
}

export function setRank(id, rank) {
  state.ranks[id] = rank;
}

export function clearRanks() {
  state.ranks = {};
}

Update `allTasks` and `allEvents` in the same edit so they read the renamed map:

```js
export function allTasks() {
  return sourceTasks().map((task) => {
    const patch = state.overrides.tasks[task.id];
    return patch ? { ...task, ...patch, schedule_local: true } : task;
  });
}

export function allEvents() {
  return section("events").map((event) => {
    const patch = state.overrides.events[event.id];
    return patch ? { ...event, ...patch, schedule_local: true } : event;
  });
}
```

export function openListItems() {
  const items = toListItems({
    tasks: allTasks().filter((task) => !isDone(task)),
    events: allEvents(),
    ranks: state.ranks,
    todayISO: todayKey(),
  });
  return sortListItems(items);
}
```

- [ ] **Step 2: Point `app.js` at the store**

Delete the moved declarations from `app.js` and replace them with an import:

```js
import {
  state, manager, section, saveState, setRenderer, setManager,
  allTasks, allEvents, sourceTasks, isDone, sourceTaskDone, effectiveTaskStatus,
  todayKey, openListItems, ranks, setRank, clearRanks,
} from "./app/store.js";
```

In `init()`, replace `manager = parseManagerMarkdown(await response.text());` with `setManager(parseManagerMarkdown(await response.text()));`, and add `setRenderer(renderView);` as the first line of `init()`.

- [ ] **Step 3: Verify the app still runs unchanged**

Run: `npm run serve` and open <http://localhost:8080>.
Expected: every view renders exactly as before, check-offs still persist across a reload. Confirm the browser console is free of module errors.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add app/store.js app.js
git commit -m "Extract local state into app/store.js"
```

---

## Task 8: The unified list view

**Files:**
- Create: `app/list.js`
- Modify: `styles.css`
- Modify: `app.js` (add `renderList` to the view table)

**Interfaces:**
- Consumes: `openListItems`, `state`, `manager` from `app/store.js`; `BAND_LABELS` from `lib/manager-order.js`; `escapeHTML`, `id`, `formatDate`, `dueInfo` from `app.js`
- Produces: `renderList() -> string` — the full HTML for the `list` view

To avoid a circular import, move `escapeHTML`, `safeURL`, `id`, `dateAtNoon`, `addDays`, `dateOnly`, `daysFromToday`, `formatDate`, `formatLongDate`, `dueInfo`, and `statusClass` out of `app.js` into a new `app/format.js` and import them from there in both `app.js` and `app/list.js`. Move them verbatim; add `export` to each.

- [ ] **Step 1: Create `app/format.js`**

Cut `app.js:113-200` (the helpers named above) into `app/format.js`, prefix each with `export`, and add at the top:

```js
import { localISODate, managerDate } from "../lib/manager-data.js";

const TIMEZONE = "Asia/Kolkata";
```

In `app.js`, replace the deleted block with:

```js
import {
  escapeHTML, safeURL, id, dateAtNoon, addDays, dateOnly, daysFromToday,
  formatDate, formatLongDate, dueInfo, statusClass,
} from "./app/format.js";
```

- [ ] **Step 2: Create `app/list.js`**

```js
import { BAND_LABELS } from "../lib/manager-order.js";
import { openListItems, state } from "./store.js";
import { escapeHTML, formatDate, dueInfo, id } from "./format.js";

const BAND_ORDER = ["overdue", "today", "week", "later"];

function itemMeta(item) {
  if (item.kind === "event") {
    const start = formatDate(item.when, { includeTime: true, weekday: true });
    const end = item.source.end && item.source.end !== item.when
      ? ` – ${formatDate(item.source.end, { includeTime: true })}`
      : "";
    return `${escapeHTML(start)}${escapeHTML(end)}`;
  }
  const due = dueInfo(item.when);
  return `<span class="list-due ${item.band === "overdue" ? "is-overdue" : ""}">${escapeHTML(due.label)}</span>`;
}

function listRow(item, index, total) {
  const priority = item.priority ? `<span class="list-priority">${escapeHTML(item.priority)}</span>` : "";
  const check = item.kind === "task"
    ? `<button class="list-check" type="button" data-task-id="${id(item.id)}" aria-label="Mark ${escapeHTML(item.title)} done"></button>`
    : `<span class="list-mark" aria-hidden="true">▦</span>`;

  return `
    <li class="list-row band-${item.band}" draggable="true"
        data-list-id="${id(item.id)}" data-list-kind="${item.kind}" data-list-index="${index}"
        aria-label="${escapeHTML(BAND_LABELS[item.band])}: ${escapeHTML(item.title)}">
      ${check}
      <button class="list-open" type="button" data-edit-${item.kind}="${id(item.id)}">
        <span class="list-title">${escapeHTML(item.title)}</span>
        <span class="list-meta">${priority}${escapeHTML(item.area)} · ${itemMeta(item)}</span>
      </button>
      <span class="list-move">
        <button class="icon-button" type="button" data-list-move="${id(item.id)}" data-direction="-1"
                ${index === 0 ? "disabled" : ""} aria-label="Move ${escapeHTML(item.title)} up">↑</button>
        <button class="icon-button" type="button" data-list-move="${id(item.id)}" data-direction="1"
                ${index === total - 1 ? "disabled" : ""} aria-label="Move ${escapeHTML(item.title)} down">↓</button>
      </span>
    </li>`;
}

export function renderList() {
  const items = openListItems();
  if (!items.length) {
    return `<section class="panel"><h2>Nothing open</h2><p class="quiet-note">Every task is complete. Add something with the button above.</p></section>`;
  }

  const manual = Object.keys(state.ranks).length;
  let lastBand = "";
  const rows = items.map((item, index) => {
    const heading = item.band === lastBand
      ? ""
      : `<li class="list-band-heading band-${item.band}" role="presentation">${escapeHTML(BAND_LABELS[item.band])}</li>`;
    lastBand = item.band;
    return heading + listRow(item, index, items.length);
  }).join("");

  const counts = BAND_ORDER
    .map((band) => ({ band, count: items.filter((item) => item.band === band).length }))
    .filter((entry) => entry.count)
    .map((entry) => `<span class="band-count band-${entry.band}">${entry.count} ${escapeHTML(BAND_LABELS[entry.band].toLowerCase())}</span>`)
    .join("");

  return `
    <section class="panel">
      <div class="panel-heading">
        <div><span class="eyebrow">Everything open</span><h2>${items.length} items</h2></div>
        ${manual ? `<button class="button button-quiet" type="button" data-clear-ranks>Reset to automatic</button>` : ""}
      </div>
      <div class="band-counts">${counts}</div>
      <ol class="list-rows" id="unified-list">${rows}</ol>
      <p class="quiet-note">Drag a row, or use ↑ ↓, to set your own order. Click any row to edit it.</p>
    </section>`;
}
```

- [ ] **Step 3: Add the band styles**

Append to `styles.css`:

```css
.list-rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }

.list-band-heading {
  margin: 14px 0 2px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.list-band-heading:first-child { margin-top: 0; }

.list-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #fffdf7;
  border: 1px solid #e2ded1;
  border-left-width: 4px;
  border-radius: 10px;
}
.list-row.is-dragging { opacity: 0.5; }
.list-row.is-drop-target { border-top: 2px solid #41546b; }

.band-overdue { border-left-color: #a4291f; }
.band-today { border-left-color: #9a6205; }
.band-week { border-left-color: #41546b; }
.band-later { border-left-color: #8b938c; }

.list-band-heading.band-overdue { color: #8f231b; }
.list-band-heading.band-today { color: #7d4f04; }
.list-band-heading.band-week { color: #374759; }
.list-band-heading.band-later { color: #5c635d; }

.band-counts { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.band-count { padding: 2px 9px; border-radius: 999px; font-size: 0.76rem; font-weight: 600; }
.band-count.band-overdue { color: #8f231b; background: #f7e5e2; }
.band-count.band-today { color: #7d4f04; background: #faeeda; }
.band-count.band-week { color: #374759; background: #e7ecf2; }
.band-count.band-later { color: #5c635d; background: #eceee9; }

.list-open {
  display: grid;
  gap: 2px;
  text-align: left;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
  min-width: 0;
}
.list-title { font-weight: 600; }
.list-meta { font-size: 0.8rem; color: #5c635d; display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.list-priority { font-weight: 700; font-size: 0.72rem; color: #374759; }
.list-due.is-overdue { color: #8f231b; font-weight: 600; }
.list-mark { color: #5c635d; }

.list-check {
  inline-size: 20px;
  block-size: 20px;
  border-radius: 6px;
  border: 1.5px solid #9aa39b;
  background: #fff;
  cursor: pointer;
}
.list-check:hover { border-color: #5c635d; }

.list-move { display: flex; gap: 2px; }
.list-move .icon-button:disabled { opacity: 0.3; cursor: default; }

@media (max-width: 640px) {
  .list-row { grid-template-columns: auto 1fr; }
  .list-move { grid-column: 1 / -1; justify-content: flex-end; }
}
```

- [ ] **Step 4: Register the view**

In `app.js`, add `import { renderList } from "./app/list.js";`, add `list: "Everything"` to `VIEW_TITLES`, and add `list: renderList,` to the renderer table inside `renderView()`.

- [ ] **Step 5: Verify in the browser**

Run: `npm run serve`, then open <http://localhost:8080/?view=list>.
Expected: one list, headed `OVERDUE` / `TODAY` / `THIS WEEK` / `LATER`, tasks and events interleaved, with the ET AI and Akuna items in the right bands for today's date. Overdue rows carry a red left border; the band counts appear above the list.

- [ ] **Step 6: Commit**

```bash
git add app/format.js app/list.js app.js styles.css
git commit -m "Add the unified colour-banded list view"
```

---

## Task 9: Reordering

**Files:**
- Modify: `app/list.js`
- Modify: `app.js` (event delegation)

**Interfaces:**
- Consumes: `openListItems`, `setRank`, `clearRanks`, `saveState` from `app/store.js`; `rankForMove` from `lib/manager-order.js`
- Produces: `moveItem(itemId, targetIndex)`, `attachListDrag(root)` from `app/list.js`

- [ ] **Step 1: Add the move helper to `app/list.js`**

```js
import { rankForMove } from "../lib/manager-order.js";
import { openListItems, setRank, saveState } from "./store.js";

export function moveItem(itemId, targetIndex) {
  const items = openListItems();
  const bounded = Math.max(0, Math.min(targetIndex, items.length - 1));
  setRank(itemId, rankForMove(items, itemId, bounded));
  saveState();
}
```

Note `saveState` and `setRank` must be added to the existing import from `./store.js` rather than imported twice.

- [ ] **Step 2: Add pointer drag**

Append to `app/list.js`:

```js
let dragId = null;

export function attachListDrag(root) {
  const list = root.querySelector("#unified-list");
  if (!list) return;

  list.addEventListener("dragstart", (event) => {
    const row = event.target.closest("[data-list-id]");
    if (!row) return;
    dragId = row.dataset.listId;
    row.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dragId);
  });

  list.addEventListener("dragover", (event) => {
    const row = event.target.closest("[data-list-id]");
    if (!row || !dragId) return;
    event.preventDefault();
    for (const other of list.querySelectorAll(".is-drop-target")) other.classList.remove("is-drop-target");
    row.classList.add("is-drop-target");
  });

  list.addEventListener("drop", (event) => {
    const row = event.target.closest("[data-list-id]");
    if (!row || !dragId) return;
    event.preventDefault();
    moveItem(dragId, Number(row.dataset.listIndex));
    dragId = null;
  });

  list.addEventListener("dragend", () => {
    dragId = null;
    for (const row of list.querySelectorAll(".is-dragging, .is-drop-target")) {
      row.classList.remove("is-dragging", "is-drop-target");
    }
  });
}
```

- [ ] **Step 3: Wire the buttons, keyboard, and reset**

First add the import to `app.js`:

```js
import { renderList, moveItem, attachListDrag } from "./app/list.js";
```

This replaces the `import { renderList } from "./app/list.js";` line added in Task 8.

In the delegated `click` handler in `app.js`, before the existing `[data-task-id]` branch, add:

```js
const listMove = event.target.closest("[data-list-move]");
if (listMove) {
  const items = openListItems();
  const from = items.findIndex((item) => item.id === listMove.dataset.listMove);
  moveItem(listMove.dataset.listMove, from + Number(listMove.dataset.direction));
  showToast("Order updated.");
  return;
}

if (event.target.closest("[data-clear-ranks]")) {
  clearRanks();
  saveState();
  showToast("Back to automatic order.");
  return;
}
```

Add a keyboard handler near the other top-level listeners in `app.js`:

```js
document.addEventListener("keydown", (event) => {
  if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
  const row = event.target.closest("[data-list-id]");
  if (!row) return;
  event.preventDefault();
  const items = openListItems();
  const from = items.findIndex((item) => item.id === row.dataset.listId);
  moveItem(row.dataset.listId, from + (event.key === "ArrowUp" ? -1 : 1));
  showToast("Order updated.");
});
```

At the end of `renderView()`, after the innerHTML assignment, add `attachListDrag(viewRoot);`.

- [ ] **Step 4: Verify in the browser**

Run: `npm run serve` and open <http://localhost:8080/?view=list>.
Expected, checking each in turn:
- Dragging a `LATER` row to the top moves it there, and it **stays grey** rather than turning red.
- A "Reset to automatic" button appears once anything is ranked, and clears it.
- The ↑ / ↓ buttons move a row one position and are disabled at the ends.
- `Alt+↑` on a focused row moves it.
- Reloading the page preserves the order.

- [ ] **Step 5: Commit**

```bash
git add app/list.js app.js
git commit -m "Add drag, button, and keyboard reordering to the list"
```

---

## Task 10: The universal editor

**Files:**
- Create: `app/editor.js`
- Modify: `index.html:157-210` (replace the schedule dialog)
- Modify: `app.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `allTasks`, `allEvents`, `sourceTasks`, `section`, `state`, `saveState` from `app/store.js`
- Produces: `openEditor(kind, itemId)`, `attachEditor()` from `app/editor.js`

Edits persist to the single `state.overrides` map in `localStorage`, established in Task 7. Phase D replaces that with `POST /apply`.

- [ ] **Step 1: Replace the dialog markup**

In `index.html`, replace the whole `<dialog id="schedule-dialog">` block with:

```html
<dialog class="modal" id="editor-dialog">
  <form id="editor-form">
    <div class="modal-heading">
      <div>
        <span class="eyebrow" id="editor-eyebrow">Edit</span>
        <h2 id="editor-title">Edit item</h2>
      </div>
      <button class="icon-button" type="button" data-close-dialog aria-label="Close">×</button>
    </div>

    <label class="field"><span>Title</span>
      <input id="editor-name" required maxlength="160" /></label>

    <div class="field-row" id="editor-task-dates">
      <label class="field"><span>Deadline date</span><input id="editor-due-date" type="date" /></label>
      <label class="field"><span>Deadline time <small>optional</small></span><input id="editor-due-time" type="time" /></label>
    </div>

    <div class="field-row" id="editor-event-start" hidden>
      <label class="field"><span>Starts on</span><input id="editor-start-date" type="date" /></label>
      <label class="field"><span>Start time <small>optional</small></span><input id="editor-start-time" type="time" /></label>
    </div>
    <div class="field-row" id="editor-event-end" hidden>
      <label class="field"><span>Ends on</span><input id="editor-end-date" type="date" /></label>
      <label class="field"><span>End time <small>optional</small></span><input id="editor-end-time" type="time" /></label>
    </div>

    <div class="field-row">
      <label class="field" id="editor-priority-field"><span>Priority</span>
        <select id="editor-priority"><option>P0</option><option>P1</option><option>P2</option></select></label>
      <label class="field"><span>Area</span>
        <select id="editor-area">
          <option>Career</option><option>Hackathon</option><option>Prep</option>
          <option>Academics</option><option>Travel</option><option>Golden Jubilee</option>
          <option>Project</option><option>Skill</option><option>Planning</option><option>Personal</option>
        </select></label>
    </div>

    <div class="field-row">
      <label class="field"><span>Status</span><input id="editor-status" maxlength="40" /></label>
      <label class="field" id="editor-location-field" hidden><span>Location</span><input id="editor-location" maxlength="200" /></label>
    </div>

    <label class="field" id="editor-next-field"><span>Next action</span>
      <input id="editor-next" maxlength="200" /></label>
    <label class="field"><span>Link <small>https only</small></span>
      <input id="editor-link" type="url" pattern="https://.*" maxlength="300" /></label>
    <label class="field"><span>Notes</span>
      <textarea id="editor-notes" rows="3" maxlength="400"></textarea></label>

    <div class="modal-actions editor-actions">
      <button class="button button-quiet button-danger" id="editor-delete" type="button">Delete</button>
      <button class="button button-quiet" id="editor-reset" type="button">Use published values</button>
      <span class="modal-action-spacer"></span>
      <button class="button button-quiet" type="button" data-close-dialog>Cancel</button>
      <button class="button button-primary" type="submit">Save</button>
    </div>
  </form>
</dialog>
```

- [ ] **Step 2: Create `app/editor.js`**

```js
import { allTasks, allEvents, sourceTasks, section, state, saveState } from "./store.js";
import { managerDate } from "../lib/manager-data.js";

const FIELD_IDS = {
  name: "editor-name", priority: "editor-priority", area: "editor-area", status: "editor-status",
  location: "editor-location", next: "editor-next", link: "editor-link", notes: "editor-notes",
  dueDate: "editor-due-date", dueTime: "editor-due-time",
  startDate: "editor-start-date", startTime: "editor-start-time",
  endDate: "editor-end-date", endTime: "editor-end-time",
};

const el = {};
let editing = null;
let onSaved = () => {};

function parts(value = "") {
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
  return { date: match?.[1] || "", time: match?.[2] || "" };
}

function compose(date, time) {
  if (!date) return "";
  return time ? `${date}T${time}:00+05:30` : date;
}

function overrides(kind) {
  return state.overrides[kind];
}

export function openEditor(kind, itemId) {
  const isTask = kind === "tasks";
  const item = (isTask ? allTasks() : allEvents()).find((entry) => entry.id === itemId);
  if (!item) return;
  editing = { kind, itemId };

  document.querySelector("#editor-eyebrow").textContent = isTask ? "Task" : "Event";
  document.querySelector("#editor-title").textContent = isTask ? "Edit task" : "Edit event";
  document.querySelector("#editor-task-dates").hidden = !isTask;
  document.querySelector("#editor-event-start").hidden = isTask;
  document.querySelector("#editor-event-end").hidden = isTask;
  document.querySelector("#editor-priority-field").hidden = !isTask;
  document.querySelector("#editor-next-field").hidden = !isTask;
  document.querySelector("#editor-location-field").hidden = isTask;

  el.name.value = isTask ? item.task : item.event;
  el.area.value = item.area || "Career";
  el.status.value = item.status || "Open";
  el.link.value = item.link || "";
  el.notes.value = item.notes || "";

  if (isTask) {
    const due = parts(item.due);
    el.dueDate.value = due.date;
    el.dueTime.value = due.time;
    el.priority.value = item.priority || "P1";
    el.next.value = item.next_action || "";
  } else {
    const start = parts(item.start);
    const end = parts(item.end);
    el.startDate.value = start.date;
    el.startTime.value = start.time;
    el.endDate.value = end.date || start.date;
    el.endTime.value = end.time;
    el.location.value = item.location || "";
  }

  document.querySelector("#editor-reset").hidden = !overrides(kind)[itemId];
  document.querySelector("#editor-delete").hidden = !item.local;
  document.querySelector("#editor-dialog").showModal();
  requestAnimationFrame(() => el.name.focus());
}

function collect(isTask) {
  const common = {
    area: el.area.value,
    status: el.status.value.trim(),
    link: el.link.value.trim(),
    notes: el.notes.value.trim(),
  };
  if (isTask) {
    return {
      ...common,
      task: el.name.value.trim(),
      due: compose(el.dueDate.value, el.dueTime.value),
      priority: el.priority.value,
      next_action: el.next.value.trim(),
    };
  }
  const startTime = el.startTime.value;
  const endTime = el.endTime.value || startTime;
  return {
    ...common,
    event: el.name.value.trim(),
    start: compose(el.startDate.value, startTime),
    end: compose(el.endDate.value || el.startDate.value, endTime),
    location: el.location.value.trim(),
  };
}

function validate(isTask) {
  el.startTime.setCustomValidity("");
  el.endDate.setCustomValidity("");
  if (isTask) return true;

  if (el.endTime.value && !el.startTime.value) {
    el.startTime.setCustomValidity("Add a start time, or leave both blank for an all-day event.");
    el.startTime.reportValidity();
    return false;
  }
  const start = managerDate(compose(el.startDate.value, el.startTime.value))?.getTime();
  const end = managerDate(compose(el.endDate.value || el.startDate.value, el.endTime.value || el.startTime.value))?.getTime();
  if (Number.isFinite(start) && Number.isFinite(end) && end < start) {
    el.endDate.setCustomValidity("The event must end after it starts.");
    el.endDate.reportValidity();
    return false;
  }
  return true;
}

export function attachEditor(afterSave) {
  onSaved = afterSave;
  for (const [key, elementId] of Object.entries(FIELD_IDS)) el[key] = document.querySelector(`#${elementId}`);
  const dialog = document.querySelector("#editor-dialog");

  document.querySelector("#editor-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!editing) return;
    const isTask = editing.kind === "tasks";
    if (!validate(isTask)) return;

    const source = (isTask ? sourceTasks() : section("events")).find((entry) => entry.id === editing.itemId);
    if (!source) return;
    const fields = collect(isTask);
    const changed = Object.fromEntries(Object.entries(fields).filter(([key, value]) => value !== (source[key] || "")));

    if (Object.keys(changed).length) overrides(editing.kind)[editing.itemId] = changed;
    else delete overrides(editing.kind)[editing.itemId];

    saveState({ render: false });
    dialog.close();
    onSaved("Saved in this app.");
  });

  document.querySelector("#editor-reset").addEventListener("click", () => {
    if (!editing) return;
    delete overrides(editing.kind)[editing.itemId];
    saveState({ render: false });
    dialog.close();
    onSaved("Published values restored.");
  });

  document.querySelector("#editor-delete").addEventListener("click", () => {
    if (!editing) return;
    state.localItems = state.localItems.filter((item) => item.id !== editing.itemId);
    delete overrides(editing.kind)[editing.itemId];
    saveState({ render: false });
    dialog.close();
    onSaved("Removed from this device.");
  });

  dialog.addEventListener("close", () => {
    editing = null;
    el.startTime.setCustomValidity("");
    el.endDate.setCustomValidity("");
  });

  for (const input of [el.startDate, el.startTime, el.endDate, el.endTime]) {
    input.addEventListener("input", () => {
      el.startTime.setCustomValidity("");
      el.endDate.setCustomValidity("");
    });
  }
}
```

- [ ] **Step 3: Confirm the store needs no change**

Task 7 already made `state.overrides` the single map that `allTasks` and
`allEvents` layer on top of source data, and the editor writes full field
patches into that same map. There is no second map and nothing to add here.

Verify it by reading `app/store.js`: `allTasks` must read `state.overrides.tasks`
and `allEvents` must read `state.overrides.events`, and the string
`scheduleOverrides` must appear nowhere in `app/` except inside the
`migrateOverrides` helper.

Run: `grep -rn "scheduleOverrides\|fieldOverrides" app/ app.js`
Expected: exactly one hit, the legacy read inside `migrateOverrides`.

- [ ] **Step 4: Replace the old dialog wiring in `app.js`**

Delete `openScheduleEditor`, the `scheduleForm` submit listener, the `resetScheduleButton` listener, the `scheduleDialog` close listener, the `[eventStartDate, …].forEach` block, and every `document.querySelector("#schedule-…")` constant. Replace the `[data-edit-task]` and `[data-edit-event]` click branches with:

```js
const editTask = event.target.closest("[data-edit-task]");
if (editTask) {
  openEditor("tasks", editTask.dataset.editTask);
  return;
}

const editEvent = event.target.closest("[data-edit-event]");
if (editEvent) {
  openEditor("events", editEvent.dataset.editEvent);
  return;
}
```

Add `import { openEditor, attachEditor } from "./app/editor.js";` and call `attachEditor((message) => { renderView(); showToast(message); });` inside `init()` before `renderView()`.

- [ ] **Step 5: Add the delete-button style**

Append to `styles.css`:

```css
.button-danger { color: #8f231b; }
.button-danger:hover { background: #f7e5e2; }
.editor-actions { flex-wrap: wrap; gap: 8px; }
```

- [ ] **Step 6: Verify in the browser**

Run: `npm run serve`, open <http://localhost:8080/?view=list>.
Expected:
- Clicking any task row opens the editor with every field populated; changing the title and saving updates the row without a page navigation.
- Clicking an event row shows start/end and Location, and hides Priority and Next action.
- An end time with no start time is refused with a message.
- An end before its start is refused.
- "Use published values" appears only after an edit and reverts it.
- Reloading preserves edits.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add app/editor.js app.js index.html styles.css
git commit -m "Add the universal task and event editor"
```

---

## Task 11: Click-to-edit everywhere, and extract the area views

Two things that belong together: every task title becomes an editor trigger, and the seven remaining render functions move out of `app.js` so it finishes this plan as wiring rather than a 900-line grab bag.

**Files:**
- Create: `app/views.js`
- Modify: `app.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `openEditor` from `app/editor.js`; `escapeHTML`, `safeURL`, `id`, `formatDate`, `dueInfo`, `statusClass` from `app/format.js`; the selectors from `app/store.js`
- Produces from `app/views.js`: `renderCompleted`, `renderPrep`, `renderCareer`, `renderHackathons`, `renderAcademics`, `renderTravel`, `renderGoldenJubilee`, `renderInbox`, `renderMore`, `taskRow`, `eventEditButton`, `applicationRow`, `prepCard`, `rejectionRecords`, `codexUpdateMarkdown`, `calendarICS`

Note `renderToday`, `renderNow`, and `renderWeek` are **not** in that list. They are deleted in Task 12; do not move them.

- [ ] **Step 1: Make `taskRow` open the editor from its title**

In `app.js`, in `taskRow` (line 351), replace the `<span class="task-title">…</span>` line with:

```js
<span class="task-title">${link
  ? `<a href="${escapeHTML(link)}" target="_blank" rel="noreferrer">${escapeHTML(task.task)}</a>`
  : `<button class="row-open" type="button" data-edit-task="${id(task.id)}">${escapeHTML(task.task)}</button>`}</span>
```

A task with a link keeps the link on its title — the deadline button on the right already opens the editor for those.

Append to `styles.css`:

```css
.row-open { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.row-open:hover { text-decoration: underline; }
```

- [ ] **Step 2: Confirm the surviving event renders already open the editor**

`eventEditButton` emits `data-edit-event`, which Task 10 already rewired to `openEditor`. Three call sites render events, and all three already call it:

- `app.js:482` — inside `renderWeek`, which Task 12 deletes. Ignore it.
- `app.js:780` — Hackathons, the ET AI finale card. Already calls `eventEditButton(etEvent.id, "Edit")`.
- `app.js:821` — Travel, the itinerary timeline. Already calls `eventEditButton(event.id, "Edit")`.

Academics, Golden Jubilee, Prep, and Applications render no events. No change is needed in this step — verify the three line numbers still match and move on.

- [ ] **Step 3: Move the view functions into `app/views.js`**

Cut these functions from `app.js` verbatim into a new `app/views.js`, adding `export` to each: `taskRow`, `eventEditButton`, `prepCard`, `renderDsaWeek`, `applicationRow`, `rejectionRecords`, `renderCompleted`, `renderPrep`, `renderCareer`, `renderHackathons`, `renderAcademics`, `renderTravel`, `renderGoldenJubilee`, `localChangeCount`, `renderInbox`, `renderMore`, `codexUpdateMarkdown`, `escapeICS`, `icsDate`, `calendarICS`, `weekDates`, `currentWeekApplicationCount`, `applicationStatus`, `allApplications`, `topUpcomingEvents`, `applicationGoal`, `dsaGoal`, `todayDsa`, `progress`.

Add this header to `app/views.js`:

```js
import {
  STATUS_OPTIONS, state, manager, section, allTasks, allEvents, sourceTasks,
  isDone, sourceTaskDone, effectiveTaskStatus, todayKey,
} from "./store.js";
import {
  escapeHTML, safeURL, id, dateAtNoon, addDays, dateOnly, daysFromToday,
  formatDate, formatLongDate, dueInfo, statusClass,
} from "./format.js";
import { localISODate, managerDate } from "../lib/manager-data.js";

const TIMEZONE = "Asia/Kolkata";
```

Move `STATUS_OPTIONS` from `app.js` into `app/store.js` and export it, since both `app/views.js` and `app.js` need it.

In `app.js`, import what the renderer table and the click handler still need:

```js
import {
  renderCompleted, renderPrep, renderCareer, renderHackathons, renderAcademics,
  renderTravel, renderGoldenJubilee, renderInbox, renderMore,
  codexUpdateMarkdown, calendarICS, applicationGoal, dsaGoal,
} from "./app/views.js";
```

- [ ] **Step 4: Check the split left nothing behind**

Run: `node --input-type=module -e "await import('./app/views.js')"`
Expected: it fails only on `localStorage is not defined` or `document is not defined`, which proves the module parses and its imports resolve. Any `SyntaxError` or `does not provide an export named` means a function or import was missed — fix it before continuing.

Run: `grep -c '^function\|^async function' app.js`
Expected: a number below 25. Before this task it is 60.

- [ ] **Step 5: Verify in the browser**

Run: `npm run serve`. Visit **each** of Everything, Completed, Prep, Applications, Hackathons, Academics, Travel, Golden Jubilee, and Inbox & sync.
Expected: every view renders identically to before, with no console errors. Clicking a task title or an event's edit control opens the editor dialog in place — the view behind it never changes and the URL never changes. Calendar export and "Copy for Codex" still work from Inbox & sync.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add app/views.js app/store.js app.js styles.css
git commit -m "Open the editor from every view and extract the area views"
```

---

## Task 12: Collapse the navigation and update the docs

**Files:**
- Modify: `index.html:32-70` (sidebar), `index.html:100-106` (mobile bar)
- Modify: `app.js` (`VIEW_TITLES`, `renderView`, `renderMore`, `init`)
- Modify: `sw.js:1-12`
- Modify: `AGENTS.md`, `README.md`

**Interfaces:**
- Consumes: everything above
- Produces: `list` becomes the default view; `today`, `now`, and `week` redirect to it

- [ ] **Step 1: Replace the sidebar entries**

In `index.html`, replace the three buttons `data-nav="today"`, `data-nav="now"`, and `data-nav="week"` with one:

```html
<button class="nav-item is-active" type="button" data-nav="list">
  <span aria-hidden="true">≡</span><span>Everything</span>
</button>
```

Leave the other eight entries untouched.

- [ ] **Step 2: Replace the mobile bar**

```html
<nav class="mobile-nav" aria-label="Mobile navigation">
  <button class="mobile-nav-item is-active" type="button" data-nav="list"><span>≡</span>Everything</button>
  <button class="mobile-nav-item" type="button" data-nav="completed"><span>✓</span>Done</button>
  <button class="mobile-nav-item" type="button" data-nav="career"><span>↗</span>Apps</button>
  <button class="mobile-nav-item" type="button" data-nav="more"><span>•••</span>More</button>
</nav>
```

- [ ] **Step 3: Redirect the retired views**

In `app.js`, delete `today`, `now`, and `week` from `VIEW_TITLES` and from the renderer table, and delete `renderToday`, `renderNow`, and `renderWeek`. Change `DEFAULT_STATE.view` in `app/store.js` from `"today"` to `"list"`. In `init()`, replace the `if (state.view === "life")` line with:

```js
const RETIRED_VIEWS = { life: "travel", today: "list", now: "list", week: "list" };
if (RETIRED_VIEWS[state.view]) state.view = RETIRED_VIEWS[state.view];
const requestedView = new URLSearchParams(window.location.search).get("view");
const resolvedView = RETIRED_VIEWS[requestedView] || requestedView;
if (resolvedView && VIEW_TITLES[resolvedView]) state.view = resolvedView;
```

In `renderMore`, list the six area views plus `Inbox & sync`, dropping the retired three.

- [ ] **Step 4: Update the service worker**

In `sw.js`, bump the cache name to `anant-week-manager-v7` and add the new modules to `CORE_ASSETS`:

```js
const CACHE_NAME = "anant-week-manager-v7";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./app/store.js",
  "./app/format.js",
  "./app/list.js",
  "./app/editor.js",
  "./app/views.js",
  "./lib/manager-data.js",
  "./lib/manager-edit.js",
  "./lib/manager-order.js",
  "./MANAGER.md",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-maskable.svg"
];
```

- [ ] **Step 5: Update `AGENTS.md`**

Under "Website behavior", replace the Now-view bullet with:

```markdown
- The website shows one unified list of open tasks and events, banded as overdue, today, this week, and later. Preserve the light-only, low-glare palette: colour appears only as a left border and a small chip, never as a full-row fill, and every band is also named in text.
- Manual order is durable and lives in the `## Order` table as `| ID | Rank |` with float ranks. Only deliberately-moved items appear there. Never reorder that table by hand; it is sorted by rank.
- Every task and event is editable from any view through one dialog. Local edits still stay in the browser until they are published.
```

- [ ] **Step 6: Update `README.md`**

Replace the "Everyday use" steps 1 and 2 with:

```markdown
1. Open **Everything** to see every open task and event in one list. Overdue work is red and first, today is amber, this week is slate, and later is grey.
2. Drag any row, or use the ↑ ↓ buttons or `Alt+↑` / `Alt+↓`, to set your own order. It persists until you choose **Reset to automatic**.
3. Click any task or event, in any view, to edit every one of its fields in place.
```

Renumber the remaining steps. In "Edit dates and times", replace the first two bullets with a single line saying any row opens the full editor.

- [ ] **Step 7: Verify the whole app**

Run: `npm run serve`, then check each in turn:
- <http://localhost:8080> opens **Everything** by default.
- <http://localhost:8080/?view=today>, `?view=now`, and `?view=week` all land on **Everything** rather than a blank screen.
- The sidebar shows exactly nine entries.
- The mobile bar shows four; narrow the window below 640px to confirm.
- **More** lists the six area views and Inbox & sync.
- Every one of the nine views renders without a console error.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: all pass

- [ ] **Step 9: Commit**

```bash
git add index.html app.js app/store.js app/views.js sw.js AGENTS.md README.md
git commit -m "Collapse Today, Now, and This week into one Everything view"
```

---

## Done when

- `npm test` passes.
- The sidebar has nine entries and **Everything** is the default.
- Open tasks and events appear in one list, banded and coloured per the table in Global Constraints.
- Dragging a row reorders it durably; a dragged row keeps its true band colour.
- Clicking any task or event in any of the nine views opens the editor without navigating.
- `lib/manager-edit.js` can add, update, complete, delete, and rank without breaking `scripts/validate-manager.mjs`.
- Every untouched line of `MANAGER.md` survives a rewrite byte-for-byte.

## Next plan

Phases C and D — the Cloudflare Worker, the conversational Gemini bot, Groq voice transcription, and browser write-back — are a separate plan, written once the `GEMINI_API_KEY`, `GROQ_API_KEY`, and Cloudflare account exist. `lib/manager-edit.js` is the interface between the two plans: the Worker imports it unchanged.
