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

test("a band always outranks the one below it, whatever the priorities", () => {
  const overdueLow = autoScore({ when: "2026-08-21", priority: "P2" }, TODAY);
  const todayLow = autoScore({ when: "2026-08-22", priority: "P2" }, TODAY);
  const weekHigh = autoScore({ when: "2026-08-26", priority: "P0" }, TODAY);
  const laterHigh = autoScore({ when: "2026-12-01", priority: "P0" }, TODAY);
  assert.ok(overdueLow < todayLow, "an overdue P2 must beat a P2 due today");
  assert.ok(todayLow < weekHigh, "a P2 due today must beat a P0 due this week");
  assert.ok(weekHigh < laterHigh, "this week must beat later");
});

test("the automatic list never interleaves bands", () => {
  const tasks = [
    { id: "a", task: "Later P0", due: "2026-12-01", priority: "P0", area: "Career", status: "Open" },
    { id: "b", task: "Today P2", due: "2026-08-22", priority: "P2", area: "Career", status: "Open" },
    { id: "c", task: "Week P0", due: "2026-08-26", priority: "P0", area: "Career", status: "Open" },
    { id: "d", task: "Overdue P2", due: "2026-08-20", priority: "P2", area: "Career", status: "Open" },
  ];
  const bands = sortListItems(toListItems({ tasks, events: [], ranks: {}, todayISO: TODAY })).map((item) => item.band);
  assert.deepEqual(bands, ["overdue", "today", "week", "later"]);
  const blocks = [];
  for (const band of bands) if (blocks.at(-1) !== band) blocks.push(band);
  assert.equal(blocks.length, new Set(blocks).size, "a band heading must never repeat");
});

test("more overdue sorts before less overdue regardless of priority", () => {
  assert.ok(
    autoScore({ when: "2026-08-10", priority: "P2" }, TODAY) < autoScore({ when: "2026-08-21", priority: "P0" }, TODAY),
  );
});

test("undated work sorts after even the most distant dated work", () => {
  assert.ok(autoScore({ when: "", priority: "P0" }, TODAY) > autoScore({ when: "2099-01-01", priority: "P2" }, TODAY));
});
