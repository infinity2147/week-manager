import { applyOperations, validateOperation } from "../lib/manager-edit.js";
import { localISODate } from "../lib/manager-data.js";
import { createGitHub, commitWithRetry } from "./github.js";
import { runAgent, trimHistory } from "./agent.js";
import { transcribeVoice } from "./transcribe.js";

const TIMEZONE = "Asia/Kolkata";
const HISTORY_TTL = 60 * 60 * 24;
const MAX_TELEGRAM = 4000;

function today() {
  return localISODate(new Date(), TIMEZONE);
}

function corsHeaders(env) {
  return {
    "access-control-allow-origin": env.ALLOWED_ORIGIN || "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-max-age": "86400",
  };
}

function json(body, env, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(env) },
  });
}

function github(env) {
  return createGitHub({
    token: env.GITHUB_TOKEN,
    repo: env.GITHUB_REPO,
    branch: env.GITHUB_BRANCH || "main",
  });
}

async function telegram(env, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Telegram ${method} failed: ${response.status} ${detail.slice(0, 160)}`);
  }
  return response.json();
}

async function reply(env, chatId, text, replyTo) {
  const payload = {
    chat_id: chatId,
    text: String(text).slice(0, MAX_TELEGRAM),
    link_preview_options: { is_disabled: true },
  };
  if (replyTo) payload.reply_parameters = { message_id: replyTo, allow_sending_without_reply: true };
  await telegram(env, "sendMessage", payload).catch(() => {
    delete payload.reply_parameters;
    return telegram(env, "sendMessage", payload);
  });
}

/** Applies operations one at a time so a single bad one cannot discard the rest. */
export function applyValidated(markdown, operations, when) {
  const applied = [];
  const rejected = [];
  let result = markdown;
  for (const operation of operations) {
    try {
      validateOperation(operation);
      result = applyOperations(result, [operation], { today: when });
      applied.push(operation.op);
    } catch (error) {
      rejected.push(`${operation.op}: ${error.message}`);
    }
  }
  return { markdown: result, applied, rejected };
}

async function handleTelegram(request, env) {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const update = await request.json().catch(() => null);
  const message = update?.message;
  if (!message) return new Response("ok");
  if (String(message.chat?.id) !== String(env.TELEGRAM_CHAT_ID)) return new Response("ok");

  return { message };
}

async function processMessage(env, message) {
  const chatId = String(message.chat.id);
  const replyTo = message.message_id;

  let text = String(message.text || message.caption || "").trim();
  if (message.voice) {
    try {
      text = await transcribeVoice({ groqKey: env.GROQ_API_KEY, telegramToken: env.TELEGRAM_BOT_TOKEN, voice: message.voice });
    } catch (error) {
      await reply(env, chatId, error.message, replyTo);
      return;
    }
  }
  if (!text) {
    await reply(env, chatId, "I can read text and voice notes. Could you send that as one of those?", replyTo);
    return;
  }

  const quoted = String(message.reply_to_message?.text || message.reply_to_message?.caption || "").trim();
  const prompt = quoted ? `(Replying to your earlier message: "${quoted.slice(0, 800)}")\n\n${text}` : text;

  const historyKey = `history:${chatId}`;
  const history = env.MANAGER_KV ? JSON.parse((await env.MANAGER_KV.get(historyKey)) || "[]") : [];
  const gh = github(env);
  const { markdown } = await gh.read();
  const when = today();

  let result;
  try {
    result = await runAgent({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, markdown, history, message: prompt, today: when });
  } catch (error) {
    console.error("agent failed:", error?.stack || error?.message || error);
    const detail = env.DEBUG_ERRORS === "true" && error?.message ? `\n\n${error.message}` : "";
    await reply(
      env,
      chatId,
      error.rateLimited ? error.message : `Something went wrong reading your plan. Nothing was changed — could you send that again?${detail}`,
      replyTo,
    );
    return;
  }

  let note = "";
  if (result.operations.length) {
    try {
      const summary = await commitWithRetry(
        gh,
        (current) => {
          const outcome = applyValidated(current, result.operations, when);
          note = outcome.rejected.length ? `\n\nOne part did not go through: ${outcome.rejected[0]}` : "";
          return outcome.markdown;
        },
        `Update manager from Telegram (${result.operations.map((operation) => operation.op).join(", ")})`,
      );
      if (summary.changed) note += `\n\nSaved. The website will show it after a refresh.`;
    } catch (error) {
      console.error("commit failed:", error?.stack || error?.message || error);
      const detail = env.DEBUG_ERRORS === "true" && error?.message ? `\n\n${error.message}` : "";
      note = `\n\nI could not save that, so nothing changed. ${error.conflict ? "Something else edited the plan at the same time — try once more." : "Please try again."}${detail}`;
    }
  }

  const voiceEcho = message.voice ? `🎙 I heard: “${text.slice(0, 200)}”\n\n` : "";
  await reply(env, chatId, `${voiceEcho}${result.reply}${note}`, replyTo);

  if (env.MANAGER_KV) {
    const next = trimHistory([...result.contents, { role: "model", parts: [{ text: result.reply }] }]);
    await env.MANAGER_KV.put(historyKey, JSON.stringify(next), { expirationTtl: HISTORY_TTL });
  }
}

async function handleApply(request, env) {
  const authorization = request.headers.get("authorization") || "";
  if (!env.APP_SECRET || authorization !== `Bearer ${env.APP_SECRET}`) {
    return json({ error: "unauthorized" }, env, 401);
  }

  const body = await request.json().catch(() => null);
  const operations = body?.ops;
  if (!Array.isArray(operations) || !operations.length) return json({ error: "no operations supplied" }, env, 400);
  if (operations.length > 50) return json({ error: "too many operations in one request" }, env, 400);

  const when = today();
  const gh = github(env);
  let rejected = [];
  try {
    const summary = await commitWithRetry(
      gh,
      (current) => {
        const outcome = applyValidated(current, operations, when);
        rejected = outcome.rejected;
        return outcome.markdown;
      },
      `Update manager from the website (${operations.map((operation) => operation.op).join(", ")})`,
    );
    if (rejected.length && !summary.changed) return json({ error: rejected.join("; ") }, env, 400);
    return json({ markdown: summary.markdown, changed: summary.changed, rejected }, env);
  } catch (error) {
    return json({ error: error.message, conflict: Boolean(error.conflict) }, env, error.conflict ? 409 : 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(env) });

    if (url.pathname === "/manager" && request.method === "GET") {
      try {
        const { markdown, sha } = await github(env).read();
        return json({ markdown, sha, fetchedAt: new Date().toISOString() }, env);
      } catch (error) {
        return json({ error: error.message }, env, 502);
      }
    }

    if (url.pathname === "/apply" && request.method === "POST") return handleApply(request, env);

    if (url.pathname === "/telegram" && request.method === "POST") {
      const outcome = await handleTelegram(request, env);
      if (outcome instanceof Response) return outcome;
      // Answer Telegram immediately; the model call takes far longer than its retry window.
      ctx.waitUntil(processMessage(env, outcome.message).catch((error) => {
        console.error("processMessage failed:", error?.stack || error?.message || error);
      }));
      return new Response("ok");
    }

    return new Response("not found", { status: 404, headers: corsHeaders(env) });
  },
};
