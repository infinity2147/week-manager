import { localISODate, managerDate } from "./manager-data.js";

const TIMEZONE = "Asia/Kolkata";
const DAY = 86_400_000;
const PRIORITY_SCORE = { P0: 0, P1: 25, P2: 50 };
const UNDATED_SCORE = 100_000;

export const BAND_LABELS = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
};

function noon(isoDate) {
  return new Date(`${isoDate}T12:00:00+05:30`);
}

export function addDaysISO(isoDate, amount) {
  const date = noon(isoDate);
  date.setDate(date.getDate() + amount);
  return localISODate(date, TIMEZONE);
}

function dayOf(value) {
  const date = managerDate(value);
  return date ? localISODate(date, TIMEZONE) : "";
}

export function bandFor(value, todayISO) {
  const day = dayOf(value);
  if (!day) return "later";
  if (day < todayISO) return "overdue";
  if (day === todayISO) return "today";
  return day <= addDaysISO(todayISO, 7) ? "week" : "later";
}

export function autoScore(item, todayISO) {
  const priority = PRIORITY_SCORE[item.priority] ?? 40;
  const day = dayOf(item.when);
  if (!day) return UNDATED_SCORE + priority;
  const days = Math.round((noon(day) - noon(todayISO)) / DAY);
  return days < 0 ? days * 8 - 1000 + priority : days * 12 + priority;
}

export function toListItems({ tasks = [], events = [], ranks = {}, todayISO }) {
  const items = [
    ...tasks.map((task) => ({
      kind: "task",
      id: task.id,
      title: task.task,
      when: task.due,
      priority: task.priority || "",
      area: task.area || "",
      source: task,
    })),
    ...events.map((event) => ({
      kind: "event",
      id: event.id,
      title: event.event,
      when: event.start,
      priority: "",
      area: event.area || "",
      source: event,
    })),
  ];

  return items
    .map((item) => ({ ...item, band: bandFor(item.when, todayISO), score: autoScore(item, todayISO) }))
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
    .map((item, index) => ({ ...item, autoRank: index, rank: ranks[item.id], key: ranks[item.id] ?? index }));
}

export function sortListItems(items) {
  return [...items].sort((a, b) => a.key - b.key || a.autoRank - b.autoRank);
}

export function rankForMove(sortedItems, movedId, targetIndex) {
  const others = sortedItems.filter((item) => item.id !== movedId);
  const before = others[targetIndex - 1];
  const after = others[targetIndex];
  if (!before && !after) return 0;
  if (!before) return after.key - 1;
  if (!after) return before.key + 1;
  return (before.key + after.key) / 2;
}
