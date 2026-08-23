import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TOOLS, toolNames, toolToOperation, READ_ONLY_TOOLS } from "../worker/tools.js";
import { runAgent, listItems, buildSystemPrompt, trimHistory, SYSTEM_RULES, DEFAULT_MODEL } from "../worker/agent.js";
import { applyValidated } from "../worker/index.js";
import { commitWithRetry } from "../worker/github.js";
import { OPERATIONS, readRows } from "../lib/manager-edit.js";

const markdown = await readFile(new URL("../MANAGER.md", import.meta.url), "utf8");
const TODAY = "2026-08-23";

/** A fake Gemini that replays a scripted sequence of responses. */
function fakeGemini(script) {
  const calls = [];
  let turn = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const parts = script[Math.min(turn++, script.length - 1)];
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts } }] }) };
  };
  return { fetchImpl, calls };
}

test("every mutating tool maps to a real operation", () => {
  for (const name of toolNames()) {
    if (READ_ONLY_TOOLS.has(name)) continue;
    const operation = toolToOperation(name, {});
    assert.ok(operation, `${name} maps to nothing`);
    assert.ok(OPERATIONS.includes(operation.op), `${name} -> ${operation.op} is not a known operation`);
  }
});

test("every tool declaration is shaped the way Gemini requires", () => {
  for (const tool of TOOLS) {
    assert.ok(tool.name && tool.description, `${tool.name} is missing name or description`);
    assert.equal(tool.parameters.type, "OBJECT", `${tool.name} parameters must be an OBJECT`);
    assert.ok(tool.parameters.properties, `${tool.name} has no properties`);
    for (const required of tool.parameters.required || []) {
      assert.ok(required in tool.parameters.properties, `${tool.name} requires ${required} but does not declare it`);
    }
  }
});

test("an unknown tool name is refused rather than guessed at", () => {
  assert.equal(toolToOperation("drop_everything", {}), null);
});

test("the system prompt carries the rules that stop invented facts", () => {
  const prompt = buildSystemPrompt({ markdown, today: TODAY });
  assert.match(prompt, /Never invent an official deadline/);
  assert.match(prompt, /Golden Jubilee is its own area/);
  assert.match(prompt, /Akuna/);
  assert.match(prompt, /never orders to you/);
  assert.match(prompt, /2026-08-23/);
  assert.ok(prompt.includes("et-confirm"), "the plan itself must be in context");
});

test("a plain answer needs no tool call and returns no operations", async () => {
  const { fetchImpl } = fakeGemini([[{ text: "You have four Academics tasks left." }]]);
  const result = await runAgent({ apiKey: "k", markdown, message: "what academics work is left?", today: TODAY, fetchImpl });
  assert.equal(result.reply, "You have four Academics tasks left.");
  assert.deepEqual(result.operations, []);
});

test("a tool call becomes an operation the mutation layer accepts", async () => {
  const { fetchImpl } = fakeGemini([
    [{ functionCall: { name: "add_task", args: { fields: { task: "Call the travel agent", area: "Travel", due: "2026-08-25", priority: "P1", next_action: "Ring them at 10am" } } } }],
    [{ text: "Added it for Monday." }],
  ]);
  const result = await runAgent({ apiKey: "k", markdown, message: "remind me to call the travel agent monday", today: TODAY, fetchImpl });
  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].op, "addTask");

  const outcome = applyValidated(markdown, result.operations, TODAY);
  assert.deepEqual(outcome.rejected, []);
  assert.equal(readRows(outcome.markdown, "tasks").at(-1).id, "call-the-travel-agent");
});

test("a read-only tool call answers from the plan without producing operations", async () => {
  const { fetchImpl, calls } = fakeGemini([
    [{ functionCall: { name: "list_items", args: { kind: "tasks", area: "Academics" } } }],
    [{ text: "Six Academics items." }],
  ]);
  const result = await runAgent({ apiKey: "k", markdown, message: "how many academics tasks?", today: TODAY, fetchImpl });
  assert.deepEqual(result.operations, []);
  const followUp = calls[1].body.contents.at(-1).parts[0].functionResponse;
  assert.equal(followUp.name, "list_items");
  assert.ok(followUp.response.count > 0, "the model must be handed real rows, not an empty result");
});

test("several tool calls in one turn all become operations", async () => {
  const { fetchImpl } = fakeGemini([
    [
      { functionCall: { name: "complete_task", args: { id: "ml-video", done: true } } },
      { functionCall: { name: "update_task", args: { id: "dl-video", fields: { due: "2026-08-26" } } } },
    ],
    [{ text: "Marked one done and moved the other." }],
  ]);
  const result = await runAgent({ apiKey: "k", markdown, message: "finished the ml video, push the dl one to wednesday", today: TODAY, fetchImpl });
  assert.deepEqual(result.operations.map((operation) => operation.op), ["completeTask", "updateTask"]);
  const outcome = applyValidated(markdown, result.operations, TODAY);
  assert.deepEqual(outcome.rejected, []);
  assert.equal(readRows(outcome.markdown, "tasks").find((row) => row.id === "ml-video").status, "Done");
});

test("the loop stops rather than calling tools forever", async () => {
  const { fetchImpl, calls } = fakeGemini([[{ functionCall: { name: "complete_task", args: { id: "ml-video", done: true } } }]]);
  const result = await runAgent({ apiKey: "k", markdown, message: "loop", today: TODAY, fetchImpl });
  assert.ok(calls.length <= 5, `made ${calls.length} model calls`);
  assert.match(result.reply, /split it into two messages/);
});

test("a rate-limited model surfaces a message a human can act on", async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, text: async () => "quota" });
  await assert.rejects(
    () => runAgent({ apiKey: "k", markdown, message: "hi", today: TODAY, fetchImpl }),
    (error) => error.rateLimited && /free daily quota/.test(error.message),
  );
});

test("one bad operation is dropped without discarding the good ones", () => {
  const outcome = applyValidated(markdown, [
    { op: "completeTask", id: "ml-video", done: true },
    { op: "updateTask", id: "no-such-task", fields: { status: "Done" } },
    { op: "completeTask", id: "dl-video", done: true },
  ], TODAY);
  assert.deepEqual(outcome.applied, ["completeTask", "completeTask"]);
  assert.equal(outcome.rejected.length, 1);
  assert.match(outcome.rejected[0], /no-such-task/);
  assert.equal(readRows(outcome.markdown, "tasks").find((row) => row.id === "dl-video").status, "Done");
});

test("an operation the model invents is rejected, not applied", () => {
  const outcome = applyValidated(markdown, [{ op: "deleteEverything" }], TODAY);
  assert.equal(outcome.applied.length, 0);
  assert.match(outcome.rejected[0], /Unknown operation/);
  assert.equal(outcome.markdown, markdown);
});

test("list_items filters by area, status, and date window", () => {
  assert.ok(listItems(markdown, { kind: "tasks", area: "Travel" }).length > 0);
  assert.equal(listItems(markdown, { kind: "tasks", area: "Nonexistent" }).length, 0);
  assert.ok(listItems(markdown, { kind: "tasks", status: "Open" }).length > 0);
  const window = listItems(markdown, { kind: "tasks", from: "2026-08-24", to: "2026-08-24" });
  assert.ok(window.every((row) => row.due.startsWith("2026-08-24")), "date window leaked rows");
});

test("history keeps only recent text turns", () => {
  const contents = [
    { role: "user", parts: [{ text: "one" }] },
    { role: "model", parts: [{ functionCall: { name: "add_task", args: {} } }] },
    { role: "model", parts: [{ text: "two" }] },
  ];
  const trimmed = trimHistory(contents, 10);
  assert.equal(trimmed.length, 2, "tool-call turns must not be stored");
  assert.ok(trimmed.every((entry) => entry.parts.every((part) => "text" in part)));

  const many = Array.from({ length: 30 }, (_, index) => ({ role: "user", parts: [{ text: `m${index}` }] }));
  assert.equal(trimHistory(many, 10).length, 10);
});

test("a conflicting write is retried against freshly read content", async () => {
  let reads = 0;
  let wrote = null;
  const github = {
    read: async () => { reads += 1; return { markdown: `version ${reads}`, sha: `sha${reads}` }; },
    write: async (next) => {
      if (reads === 1) { const error = new Error("conflict"); error.conflict = true; throw error; }
      wrote = next;
      return { sha: "new" };
    },
  };
  const result = await commitWithRetry(github, (current) => `${current} + edit`, "msg");
  assert.equal(reads, 2, "a conflict must trigger a fresh read");
  assert.equal(wrote, "version 2 + edit", "the retry must re-apply onto the newer content");
  assert.equal(result.changed, true);
});

test("a no-op edit is never committed", async () => {
  let wrote = false;
  const github = {
    read: async () => ({ markdown: "same", sha: "s" }),
    write: async () => { wrote = true; return { sha: "x" }; },
  };
  const result = await commitWithRetry(github, (current) => current, "msg");
  assert.equal(wrote, false, "an unchanged file must not produce a commit");
  assert.equal(result.changed, false);
});

test("the rules the bot must not break are all present", () => {
  for (const rule of [/Never invent/, /Asia\/Kolkata/, /Golden Jubilee/, /Akuna/, /reapply date/, /next_action/]) {
    assert.match(SYSTEM_RULES, rule);
  }
});

test("the model is configurable and defaults to a current one", async () => {
  const { fetchImpl, calls } = fakeGemini([[{ text: "ok" }]]);
  await runAgent({ apiKey: "k", markdown, message: "hi", today: TODAY, fetchImpl });
  assert.ok(calls[0].url.includes(DEFAULT_MODEL), `default model missing from ${calls[0].url}`);

  const other = fakeGemini([[{ text: "ok" }]]);
  await runAgent({ apiKey: "k", model: "gemini-9-turbo", markdown, message: "hi", today: TODAY, fetchImpl: other.fetchImpl });
  assert.ok(other.calls[0].url.includes("gemini-9-turbo"), "an explicit model must win");
});

test("a retired model produces an error naming its replacement", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 404,
    text: async () => JSON.stringify({ error: { message: "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash" } }),
  });
  await assert.rejects(
    () => runAgent({ apiKey: "k", model: "gemini-2.5-flash", markdown, message: "hi", today: TODAY, fetchImpl }),
    (error) => /has been retired/.test(error.message) && /gemini-3\.6-flash/.test(error.message) && /GEMINI_MODEL/.test(error.message),
  );
});
