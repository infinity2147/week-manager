import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";

const ORIGIN = "https://infinity2147.github.io";

function envWith(overrides = {}) {
  return {
    APP_SECRET: "correct-horse",
    TELEGRAM_WEBHOOK_SECRET: "hook-secret",
    TELEGRAM_CHAT_ID: "2147",
    TELEGRAM_BOT_TOKEN: "bot",
    GEMINI_API_KEY: "gem",
    GITHUB_TOKEN: "gh",
    GITHUB_REPO: "infinity2147/week-manager",
    ALLOWED_ORIGIN: ORIGIN,
    ...overrides,
  };
}

const ctx = { waitUntil() {} };

function post(path, { body = {}, headers = {} } = {}) {
  return new Request(`https://worker.dev${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("/apply refuses a request with no bearer token", async () => {
  const response = await worker.fetch(post("/apply", { body: { ops: [{ op: "completeTask", id: "ml-video", done: true }] } }), envWith(), ctx);
  assert.equal(response.status, 401);
});

test("/apply refuses a wrong bearer token", async () => {
  const response = await worker.fetch(
    post("/apply", { body: { ops: [{ op: "completeTask", id: "ml-video", done: true }] }, headers: { authorization: "Bearer guess" } }),
    envWith(),
    ctx,
  );
  assert.equal(response.status, 401);
});

test("/apply refuses everything when no secret is configured", async () => {
  const response = await worker.fetch(
    post("/apply", { body: { ops: [{ op: "completeTask", id: "x", done: true }] }, headers: { authorization: "Bearer " } }),
    envWith({ APP_SECRET: "" }),
    ctx,
  );
  assert.equal(response.status, 401, "an unset secret must not mean open access");
});

test("/apply rejects a malformed body before touching GitHub", async () => {
  const auth = { authorization: "Bearer correct-horse" };
  for (const body of [{}, { ops: [] }, { ops: "nope" }, { ops: Array.from({ length: 51 }, () => ({ op: "deleteTask", id: "x" })) }]) {
    const response = await worker.fetch(post("/apply", { body, headers: auth }), envWith(), ctx);
    assert.equal(response.status, 400, `accepted a bad body: ${JSON.stringify(body).slice(0, 60)}`);
  }
});

test("/telegram refuses an update without the secret header", async () => {
  const response = await worker.fetch(post("/telegram", { body: { message: { chat: { id: 2147 }, text: "hi" } } }), envWith(), ctx);
  assert.equal(response.status, 403);
});

test("/telegram refuses a wrong secret header", async () => {
  const response = await worker.fetch(
    post("/telegram", { body: { message: { chat: { id: 2147 }, text: "hi" } }, headers: { "x-telegram-bot-api-secret-token": "wrong" } }),
    envWith(),
    ctx,
  );
  assert.equal(response.status, 403);
});

test("/telegram ignores a message from any other chat", async () => {
  let scheduled = false;
  const response = await worker.fetch(
    post("/telegram", { body: { message: { chat: { id: 9999 }, text: "let me in" } }, headers: { "x-telegram-bot-api-secret-token": "hook-secret" } }),
    envWith(),
    { waitUntil() { scheduled = true; } },
  );
  assert.equal(response.status, 200);
  assert.equal(scheduled, false, "a stranger's message must never reach the model");
});

test("/telegram accepts the authorised chat and answers immediately", async () => {
  let scheduled = false;
  const response = await worker.fetch(
    post("/telegram", { body: { message: { chat: { id: 2147 }, message_id: 5, text: "hello" } }, headers: { "x-telegram-bot-api-secret-token": "hook-secret" } }),
    envWith(),
    { waitUntil() { scheduled = true; } },
  );
  assert.equal(response.status, 200);
  assert.equal(scheduled, true, "work must be handed to waitUntil, not awaited inline");
});

test("preflight allows only the configured origin", async () => {
  const response = await worker.fetch(new Request("https://worker.dev/apply", { method: "OPTIONS" }), envWith(), ctx);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
});

test("an unknown path is a 404", async () => {
  const response = await worker.fetch(new Request("https://worker.dev/secrets"), envWith(), ctx);
  assert.equal(response.status, 404);
});

test("/manager reports a read failure instead of pretending to succeed", async () => {
  const response = await worker.fetch(new Request("https://worker.dev/manager"), envWith({ GITHUB_REPO: "not-a-repo" }), ctx);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /owner\/name/);
});
