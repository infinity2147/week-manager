import test from "node:test";
import assert from "node:assert/strict";
import {
  authorizedMessagesFromUpdates,
  buildAgentPrompt,
  buildTelegramReply,
  parseAgentResponse,
} from "../scripts/telegram-manager.mjs";

test("accepts only messages from the configured Telegram chat", () => {
  const updates = [
    { update_id: 1, message: { message_id: 10, chat: { id: 2147 }, date: 1, text: "Move the flight task" } },
    { update_id: 2, message: { message_id: 11, chat: { id: 9999 }, date: 2, text: "Ignore me" } },
  ];
  const messages = authorizedMessagesFromUpdates(updates, "2147");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, "Move the flight task");
  assert.equal(messages[0].kind, "text");
});

test("keeps reply context so short Telegram follow-ups are understandable", () => {
  const updates = [{
    update_id: 3,
    message: {
      message_id: 12,
      chat: { id: 2147 },
      text: "Yes, 7 PM",
      reply_to_message: { text: "What time is your VNG presentation?" },
    },
  }];
  const [message] = authorizedMessagesFromUpdates(updates, "2147");
  assert.equal(message.replyContext, "What time is your VNG presentation?");
});

test("builds a natural-language agent prompt without command rules", () => {
  const prompt = buildAgentPrompt([
    { messageId: 31, kind: "text", text: "I applied to Linear today", replyContext: "" },
  ], { date: "2026-08-18" });
  assert.match(prompt, /personal planning agent/);
  assert.match(prompt, /I applied to Linear today/);
  assert.match(prompt, /Only edit `MANAGER\.md`/);
  assert.match(prompt, /2026-08-18/);
});

test("parses structured Codex replies", () => {
  const result = parseAgentResponse('```json\n{"responses":[{"message_id":31,"status":"updated","reply":"Added Linear."}],"change_summary":"One application"}\n```');
  assert.equal(result.responses[0].reply, "Added Linear.");
});

test("voice replies include the understood transcript and publish link", () => {
  const reply = buildTelegramReply(
    { kind: "voice", text: "Add resume review tomorrow", transcriptionError: "" },
    "Added resume review for tomorrow.",
    { published: true },
  );
  assert.match(reply, /I heard/);
  assert.match(reply, /Add resume review tomorrow/);
  assert.match(reply, /week-manager/);
});
