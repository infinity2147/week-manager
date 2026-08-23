import test from "node:test";
import assert from "node:assert/strict";

// app/store.js reads localStorage at module load, so the stub must exist first.
const cells = new Map();
globalThis.localStorage = {
  getItem: (key) => (cells.has(key) ? cells.get(key) : null),
  setItem: (key, value) => cells.set(key, value),
};

const { loadState, migrateOverrides, DEFAULT_STATE, STORAGE_KEY } = await import("../app/store.js");

function savedAs(value) {
  cells.set(STORAGE_KEY, JSON.stringify(value));
  return loadState();
}

test("carries a schema-3 date edit forward into the new overrides map", () => {
  const state = savedAs({
    schema: 3,
    scheduleOverrides: { tasks: { "gj-budget": { due: "2026-09-01" } }, events: {} },
  });
  assert.deepEqual(state.overrides.tasks, { "gj-budget": { due: "2026-09-01" } });
});

test("drops the legacy key once it has been migrated", () => {
  const state = savedAs({
    schema: 3,
    scheduleOverrides: { tasks: { "gj-budget": { due: "2026-09-01" } }, events: {} },
  });
  assert.ok(!("scheduleOverrides" in state), "the legacy key must not survive onto the loaded state");
});

test("a reset date edit stays reset across a reload", () => {
  const first = savedAs({
    schema: 3,
    scheduleOverrides: { tasks: { "gj-budget": { due: "2026-09-01" } }, events: {} },
  });
  delete first.overrides.tasks["gj-budget"];
  const reloaded = savedAs(first);
  assert.deepEqual(reloaded.overrides.tasks, {}, "a legacy override must not come back after being reset");
});

test("a newer override wins over a stale legacy one for the same id", () => {
  const state = savedAs({
    schema: 3,
    scheduleOverrides: { tasks: { "gj-budget": { due: "2026-09-01" } }, events: {} },
    overrides: { tasks: { "gj-budget": { due: "2026-10-01" } }, events: {} },
  });
  assert.deepEqual(state.overrides.tasks["gj-budget"], { due: "2026-10-01" });
});

test("migrateOverrides survives every shape a saved state can take", () => {
  for (const input of [null, undefined, {}, { scheduleOverrides: null }, { overrides: {} }, { scheduleOverrides: { tasks: {} } }]) {
    const result = migrateOverrides(input);
    assert.deepEqual(Object.keys(result).sort(), ["events", "tasks"], `bad shape for ${JSON.stringify(input)}`);
  }
});

test("unreadable storage falls back to a clean default state", () => {
  cells.set(STORAGE_KEY, "{not json");
  const state = loadState();
  assert.equal(state.schema, DEFAULT_STATE.schema);
  assert.deepEqual(state.overrides, { tasks: {}, events: {} });
  assert.deepEqual(state.ranks, {});
});

test("the unified list is the default view", () => {
  assert.equal(DEFAULT_STATE.view, "list");
  assert.equal(DEFAULT_STATE.schema, 4);
});

test("a saved view retired by the redesign is not carried forward as-is", () => {
  // app.js maps today/now/week onto "list" at init; the store must not resurrect them.
  for (const retired of ["today", "now", "week"]) {
    assert.notEqual(DEFAULT_STATE.view, retired);
  }
});

test("ranks survive a save and reload", () => {
  const state = savedAs({ schema: 4, ranks: { "gj-budget": 2.5 } });
  assert.deepEqual(state.ranks, { "gj-budget": 2.5 });
});
