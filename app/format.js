import { localISODate, managerDate } from "../lib/manager-data.js";

const TIMEZONE = "Asia/Kolkata";

export function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeURL(value = "") {
  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function id(value = "") {
  return escapeHTML(value.replace(/[^a-zA-Z0-9_-]/g, ""));
}

export function dateAtNoon(isoDate) {
  return new Date(`${isoDate}T12:00:00+05:30`);
}

export function addDays(isoDate, amount) {
  const date = dateAtNoon(isoDate);
  date.setUTCDate(date.getUTCDate() + amount);
  return localISODate(date, TIMEZONE);
}

export function dateOnly(value) {
  const date = managerDate(value);
  return date ? localISODate(date, TIMEZONE) : "";
}

export function daysFromToday(value) {
  const target = dateOnly(value);
  if (!target) return null;
  const today = localISODate(new Date(), TIMEZONE);
  return Math.round((dateAtNoon(target) - dateAtNoon(today)) / 86_400_000);
}

export function formatDate(value, { includeTime = true, weekday = false } = {}) {
  const date = managerDate(value);
  if (!date) return value || "Date needed";
  const hasTime = includeTime && /T\d{2}:\d{2}/.test(value);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TIMEZONE,
    weekday: weekday ? "short" : undefined,
    day: "numeric",
    month: "short",
    hour: hasTime ? "numeric" : undefined,
    minute: hasTime ? "2-digit" : undefined,
  }).format(date);
}

export function formatLongDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export function dueInfo(value) {
  const difference = daysFromToday(value);
  const date = managerDate(value);
  if (!date || difference === null) return { label: value || "Date needed", className: "status-unknown" };

  const time = /T\d{2}:\d{2}/.test(value)
    ? new Intl.DateTimeFormat("en-IN", { timeZone: TIMEZONE, hour: "numeric", minute: "2-digit" }).format(date)
    : "";

  if (difference < 0) return { label: `${Math.abs(difference)}d overdue`, className: "status-overdue" };
  if (difference === 0) return { label: time ? `Today · ${time}` : "Today", className: "status-soon" };
  if (difference === 1) return { label: time ? `Tomorrow · ${time}` : "Tomorrow", className: "status-soon" };
  if (difference <= 7) return { label: formatDate(value, { weekday: true }), className: "status-soon" };
  return { label: formatDate(value), className: "status-open" };
}

export function statusClass(value = "") {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `status-${normalized || "unknown"}`;
}
