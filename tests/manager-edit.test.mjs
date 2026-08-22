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
