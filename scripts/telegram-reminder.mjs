import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { localISODate, managerDate, parseManagerMarkdown } from "../lib/manager-data.js";

const TIMEZONE = "Asia/Kolkata";
const HERE = dirname(fileURLToPath(import.meta.url));

function argument(name, fallback = "") {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function dateAtNoon(dateString) {
  return new Date(`${dateString}T12:00:00+05:30`);
}

function dateOnly(value) {
  const date = managerDate(value);
  return date ? localISODate(date, TIMEZONE) : "";
}

function daysBetween(fromDate, value) {
  const target = dateOnly(value);
  if (!target) return null;
  return Math.round((dateAtNoon(target) - dateAtNoon(fromDate)) / 86_400_000);
}

function formatDate(value) {
  const date = managerDate(value);
  if (!date) return value || "date needed";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: /T\d{2}:\d{2}/.test(value) ? "numeric" : undefined,
    minute: /T\d{2}:\d{2}/.test(value) ? "2-digit" : undefined,
  }).format(date);
}

function duePhrase(value, today) {
  const difference = daysBetween(today, value);
  if (difference === null) return formatDate(value);
  if (difference < 0) return `${Math.abs(difference)}d overdue`;
  if (difference === 0) return `today · ${formatDate(value)}`;
  if (difference === 1) return `tomorrow · ${formatDate(value)}`;
  return formatDate(value);
}

function priorityScore(task, today) {
  const priority = { P0: 0, P1: 30, P2: 60 }[task.priority] ?? 90;
  const difference = daysBetween(today, task.due);
  const date = difference === null ? 400 : difference < 0 ? -100 + difference : difference * 10;
  return priority + date;
}

function weekdayFor(dateString) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "long" }).format(dateAtNoon(dateString));
}

export function buildDigest(data, { mode = "morning", date = localISODate(new Date(), TIMEZONE) } = {}) {
  const tasks = (data.sections.tasks || [])
    .filter((task) => task.status.toLowerCase() !== "done")
    .sort((a, b) => priorityScore(a, date) - priorityScore(b, date));
  const urgent = tasks.filter((task) => {
    const difference = daysBetween(date, task.due);
    return difference !== null && difference <= (mode === "evening" ? 2 : 3);
  });
  const events = (data.sections.events || [])
    .filter((event) => {
      const difference = daysBetween(date, event.start);
      return difference !== null && difference >= 0 && difference <= 8;
    })
    .sort((a, b) => managerDate(a.start) - managerDate(b.start));
  const weekday = weekdayFor(date);
  const applicationGoal = data.metadata.application_goal || "25";
  const dsaGoal = data.metadata.dsa_daily_goal || "5";
  const title = mode === "evening" ? "🌙 Evening reset" : "🌤 Morning brief";
  const shortDate = formatDate(date).replace(/^[^,]+,\s*/, "");
  const lines = [`<b>${title}</b>`, `<i>${escapeHTML(weekday)}, ${escapeHTML(shortDate)}</i>`, ""];

  if (mode === "morning") {
    lines.push("<b>Your next three</b>");
    for (const task of urgent.slice(0, 3)) {
      lines.push(`• ${escapeHTML(task.task)} <i>(${escapeHTML(duePhrase(task.due, date))})</i>`);
    }
    if (!urgent.length) lines.push("• No deadline-driven task is due in the next three days.");
    lines.push("", `<b>Daily floor</b>`, `• ${escapeHTML(dsaGoal)} DSA questions`, `• 5 applications toward ${escapeHTML(applicationGoal)} this week`);

    if (["Saturday", "Sunday"].includes(weekday)) {
      lines.push("• Prepare Monday's RL SLP and stochastic quiz before the evening");
    } else if (weekday === "Monday") {
      lines.push("• RL SLP presentation + stochastic quiz today; capture feedback after each");
    } else {
      lines.push("• One concrete RL paper-prep step");
    }
  } else {
    lines.push("<b>Close the loops</b>", `• Log DSA: __ / ${escapeHTML(dsaGoal)}`, "• Log applications: __", "• Mark completed tasks on the website");
    const tomorrow = urgent.filter((task) => daysBetween(date, task.due) === 1).slice(0, 3);
    if (tomorrow.length) {
      lines.push("", "<b>Set up tomorrow</b>");
      for (const task of tomorrow) lines.push(`• ${escapeHTML(task.task)} <i>(${escapeHTML(formatDate(task.due))})</i>`);
    }
    lines.push("", "Choose tomorrow's first task now, then stop planning.");
  }

  if (events.length) {
    lines.push("", "<b>Coming up</b>");
    for (const event of events.slice(0, 3)) {
      lines.push(`• ${escapeHTML(event.event)} — ${escapeHTML(formatDate(event.start))}`);
    }
  }

  lines.push("", "<i>Source: MANAGER.md · Browser-only check-offs are not included until synced.</i>");
  return lines.join("\n").slice(0, 4096);
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID repository secret.");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram rejected the reminder: ${result.description || response.status}`);
}

async function main() {
  const mode = argument("mode", process.env.REMINDER_MODE || "morning");
  if (!new Set(["morning", "evening"]).has(mode)) throw new Error("--mode must be morning or evening");
  const date = argument("date", localISODate(new Date(), TIMEZONE));
  const markdown = await readFile(resolve(HERE, "../MANAGER.md"), "utf8");
  const text = buildDigest(parseManagerMarkdown(markdown), { mode, date });
  if (process.argv.includes("--dry-run")) {
    console.log(text);
    return;
  }
  await sendTelegram(text);
  console.log(`Sent ${mode} reminder for ${date}.`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
