import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { managerDate, parseManagerMarkdown } from "../lib/manager-data.js";
import { buildDigest } from "../scripts/telegram-reminder.mjs";

const markdown = await readFile(new URL("../MANAGER.md", import.meta.url), "utf8");
const manager = parseManagerMarkdown(markdown);

test("parses manager metadata and all core tables", () => {
  assert.equal(manager.metadata.timezone, "Asia/Kolkata");
  assert.ok(manager.sections.tasks.length >= 20);
  assert.equal(manager.sections.applications.length, 4);
  assert.equal(manager.sections.hackathons.length, 3);
  assert.equal(manager.sections.interview_and_ml_prep.length, 8);
});

test("keeps empty Rejections table as an empty section", () => {
  assert.deepEqual(manager.sections.rejections, []);
});

test("rejects human placeholders as dates", () => {
  assert.equal(managerDate("Date not announced"), null);
  assert.equal(managerDate("Exact time not published"), null);
  assert.ok(managerDate("2026-08-25T08:00:00+05:30") instanceof Date);
});

test("builds a useful deadline-aware Telegram digest", () => {
  const digest = buildDigest(manager, { mode: "morning", date: "2026-08-17" });
  assert.match(digest, /Your next three/);
  assert.match(digest, /ET AI finale attendance/);
  assert.match(digest, /DSA questions/);
  assert.ok(digest.length < 4097);
});

test("task IDs are unique", () => {
  const ids = manager.sections.tasks.map((task) => task.id);
  assert.equal(new Set(ids).size, ids.length);
});
