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

test("a cell containing a pipe and a backslash survives a full write-read cycle", () => {
  const hostile = "a | b \\ c \\| d";
  const rows = readRows(markdown, "tasks");
  const written = replaceRows(markdown, "tasks", rows.map((row, index) => (index === 0 ? { ...row, notes: hostile } : row)));
  const readBack = readRows(written, "tasks");
  assert.equal(readBack[0].notes, hostile);
  assert.equal(readBack[0].task, rows[0].task, "neighbouring cells must be unaffected");
  assert.equal(readBack.length, rows.length);
});

test("replaceRows handles a row count that shrinks", () => {
  const rows = readRows(markdown, "tasks");
  const fewer = replaceRows(markdown, "tasks", rows.slice(0, 5));
  assert.equal(readRows(fewer, "tasks").length, 5);
  assert.equal(readRows(fewer, "events").length, readRows(markdown, "events").length, "other tables must be untouched");
});

test("replaceRows refuses a section that has no table", () => {
  assert.throws(() => replaceRows(markdown, "operating_rules", []), /has no table for section: operating_rules/);
});

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

test("refuses a caller-supplied ID that is not a clean slug", () => {
  for (const bad of ["Weird ID", "has|pipe", "UPPER", "trailing-", "-leading", "under_score", "double--hyphen"]) {
    assert.throws(
      () => applyOperations(markdown, [{ op: "addTask", fields: { id: bad, task: "X", next_action: "Y" } }], { today: TODAY }),
      /ID must be lowercase words separated by hyphens/,
      `expected ${bad} to be refused`,
    );
  }
});

test("accepts a well-formed caller-supplied ID", () => {
  const next = applyOperations(markdown, [{ op: "addTask", fields: { id: "book-return-train", task: "X", next_action: "Y" } }], { today: TODAY });
  assert.equal(readRows(next, "tasks").at(-1).id, "book-return-train");
});

test("a truncated generated ID is still a clean slug", () => {
  const generated = slugId(`${"x".repeat(39)} ${"y".repeat(10)}`, new Set());
  assert.ok(generated.length <= 40, `too long: ${generated}`);
  assert.match(generated, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `not a clean slug: ${generated}`);
  assert.equal(slugId("!!!", new Set()), "item");
});

test("an operation with no fields object fails with a clear message", () => {
  assert.throws(() => applyOperations(markdown, [{ op: "addTask" }], { today: TODAY }), /needs a fields object/);
});

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

test("refuses a new row that has no title and no explicit id", () => {
  assert.throws(
    () => applyOperations(markdown, [{ op: "addEvent", fields: { area: "Career" } }], { today: TODAY }),
    /needs a "event" value/,
  );
  assert.throws(
    () => applyOperations(markdown, [{ op: "addWaitingFor", fields: { area: "Career" } }], { today: TODAY }),
    /needs a "missing_information" value/,
  );
  assert.throws(
    () => applyOperations(markdown, [{ op: "addTask", fields: { next_action: "Do it" } }], { today: TODAY }),
    /needs a "task" value/,
  );
});

test("recordRejection without an applicationId says so plainly", () => {
  assert.throws(
    () => applyOperations(markdown, [{ op: "recordRejection", id: "app-revolut", fields: { company: "Revolut" } }], { today: TODAY }),
    /recordRejection needs an applicationId/,
  );
});

test("the first row written into a previously empty table round-trips", () => {
  assert.equal(readRows(markdown, "rejections").length, 0, "this test needs rejections to start empty");
  const next = applyOperations(markdown, [{
    op: "recordRejection",
    applicationId: "app-salesforce",
    fields: {
      company: "Salesforce", role: "Role not recorded", rejected_on: "2026-08-22", stage: "Application",
      reason_or_signal: "Portal moved to closed", recovery_action: "Ask for feedback by email", reapply_after: "2027-02-22",
    },
  }], { today: TODAY });
  assert.equal(readRows(next, "rejections").length, 1);
  assert.equal(readRows(next, "rejections")[0].id, "salesforce");
  for (const name of SECTIONS) {
    assert.equal(replaceRows(next, name, readRows(next, name)), next, `${name} did not round-trip`);
  }
});

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

test("deleting a ranked task also removes its order row", () => {
  const ranked = applyOperations(markdown, [{ op: "setRank", id: "ml-video", rank: 3 }], { today: TODAY });
  assert.deepEqual(readRanks(ranked), { "ml-video": 3 });
  const deleted = applyOperations(ranked, [{ op: "deleteTask", id: "ml-video" }], { today: TODAY });
  assert.deepEqual(readRanks(deleted), {}, "a deleted task must not leave a dangling rank");
});

test("deleting a ranked event also removes its order row", () => {
  const ranked = applyOperations(markdown, [{ op: "setRank", id: "go-home", rank: 2 }], { today: TODAY });
  const deleted = applyOperations(ranked, [{ op: "deleteEvent", id: "go-home" }], { today: TODAY });
  assert.deepEqual(readRanks(deleted), {});
});

test("deleting an unranked item leaves other ranks untouched", () => {
  const ranked = applyOperations(markdown, [{ op: "setRank", id: "ml-video", rank: 3 }], { today: TODAY });
  const deleted = applyOperations(ranked, [{ op: "deleteTask", id: "dl-video" }], { today: TODAY });
  assert.deepEqual(readRanks(deleted), { "ml-video": 3 });
});

test("deleting from a file with no Order section does not create one", () => {
  const deleted = applyOperations(markdown, [{ op: "deleteTask", id: "ml-video" }], { today: TODAY });
  assert.equal(findTable(deleted, "order"), null);
});

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = promisify(execFile);

async function validate(content) {
  const directory = await mkdtemp(join(tmpdir(), "manager-"));
  try {
    await cp(new URL("../lib", import.meta.url), join(directory, "lib"), { recursive: true });
    await cp(new URL("../scripts", import.meta.url), join(directory, "scripts"), { recursive: true });
    await writeFile(join(directory, "MANAGER.md"), content, "utf8");
    const { stdout } = await run(process.execPath, [join(directory, "scripts/validate-manager.mjs")]);
    return { ok: true, output: stdout };
  } catch (error) {
    return { ok: false, output: `${error.stdout || ""}${error.stderr || ""}` };
  } finally {
    await rm(directory, { recursive: true, force: true });
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

test("every rank the writer can produce passes validation", async () => {
  for (const rank of [1, -1, 0.5, 1e-7, 1e21, 0.1 + 0.2, 2.5]) {
    const doc = applyOperations(markdown, [{ op: "setRank", id: "gj-budget", rank }], { today: TODAY });
    const result = await validate(doc);
    assert.equal(result.ok, true, `writer produced rank ${String(rank)} that the validator rejects: ${result.output}`);
  }
});

test("a blank or non-numeric rank fails validation", async () => {
  for (const cell of ["", "0x10", "Infinity", "1,5", "soon"]) {
    const broken = markdown.replace(
      "\n## Operating Rules",
      `\n## Order\n\n| ID | Rank |\n| --- | --- |\n| gj-budget | ${cell} |\n\n## Operating Rules`,
    );
    const result = await validate(broken);
    assert.equal(result.ok, false, `rank cell ${JSON.stringify(cell)} was wrongly accepted`);
    assert.match(result.output, /rank is not a number/);
  }
});
