import { localISODate } from "../lib/manager-data.js";
import { toListItems, sortListItems } from "../lib/manager-order.js";

export const STORAGE_KEY = "anant-week-manager-v1";
export const TIMEZONE = "Asia/Kolkata";
export const STATUS_OPTIONS = ["Interested", "Applied", "Challenge", "Interview", "Offer", "Rejected", "Withdrawn"];

export const DEFAULT_STATE = {
  schema: 4,
  view: "list",
  completed: {},
  completedAt: {},
  overrides: { tasks: {}, events: {} },
  ranks: {},
  dayPlans: {},
  applicationStatuses: {},
  dsa: {},
  localItems: [],
  applications: [],
  inbox: [],
};

export function migrateOverrides(saved) {
  const legacy = saved?.scheduleOverrides || {};
  const current = saved?.overrides || {};
  return {
    tasks: { ...(legacy.tasks || {}), ...(current.tasks || {}) },
    events: { ...(legacy.events || {}), ...(current.events || {}) },
  };
}

export function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const savedState = saved && typeof saved === "object" ? { ...saved } : {};
    delete savedState.assistantMessages;
    delete savedState.scheduleOverrides;
    const savedCompleted = saved?.completed && typeof saved.completed === "object" ? saved.completed : {};
    const completed = Number(saved?.schema) >= 2
      ? savedCompleted
      : Object.fromEntries(Object.entries(savedCompleted).filter(([, value]) => value === true));
    return {
      ...DEFAULT_STATE,
      ...savedState,
      schema: DEFAULT_STATE.schema,
      completed: { ...DEFAULT_STATE.completed, ...completed },
      completedAt: { ...DEFAULT_STATE.completedAt, ...(saved?.completedAt || {}) },
      overrides: migrateOverrides(saved),
      ranks: { ...DEFAULT_STATE.ranks, ...(saved?.ranks || {}) },
      dayPlans: saved?.dayPlans && typeof saved.dayPlans === "object" ? saved.dayPlans : {},
      applicationStatuses: { ...DEFAULT_STATE.applicationStatuses, ...(saved?.applicationStatuses || {}) },
      dsa: { ...DEFAULT_STATE.dsa, ...(saved?.dsa || {}) },
      localItems: Array.isArray(saved?.localItems) ? saved.localItems : [],
      applications: Array.isArray(saved?.applications) ? saved.applications : [],
      inbox: Array.isArray(saved?.inbox) ? saved.inbox : [],
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

export let state = loadState();

let renderer = () => {};

export function setRenderer(callback) {
  renderer = callback;
}

export function saveState({ render = true } = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (render) renderer();
}

export let manager = { metadata: {}, sections: {} };

export function setManager(parsed) {
  manager = parsed;
}

export function section(name) {
  return manager.sections[name] || [];
}

export function effectiveTaskStatus(task) {
  if (Object.prototype.hasOwnProperty.call(state.completed, task.id)) {
    return state.completed[task.id] ? "Done" : "Open";
  }
  return task.status || "Open";
}

export function isDone(task) {
  return effectiveTaskStatus(task).toLowerCase() === "done";
}

export function sourceTaskDone(task) {
  return (task.status || "Open").toLowerCase() === "done";
}

export function sourceTasks() {
  const localTasks = state.localItems
    .filter((item) => item.kind !== "Note")
    .map((item) => ({
      id: item.id,
      task: item.title,
      area: item.area || item.kind,
      due: item.date || "Date needed",
      priority: item.kind === "Deadline" ? "P0" : "P1",
      status: "Open",
      estimate: "",
      next_action: item.detail || "Decide the next action",
      link: "",
      notes: "Added from the website",
      local: true,
    }));
  return [...section("tasks"), ...localTasks];
}

export function allTasks() {
  return sourceTasks().map((task) => {
    const patch = state.overrides.tasks[task.id];
    return patch ? { ...task, ...patch, schedule_local: true } : task;
  });
}

export function allEvents() {
  return section("events").map((event) => {
    const patch = state.overrides.events[event.id];
    return patch ? { ...event, ...patch, schedule_local: true } : event;
  });
}

export function todayKey() {
  return localISODate(new Date(), TIMEZONE);
}

export function ranks() {
  return state.ranks;
}

export function setRank(id, rank) {
  state.ranks[id] = rank;
}

export function clearRanks() {
  state.ranks = {};
}

export function openListItems() {
  const items = toListItems({
    tasks: allTasks().filter((task) => !isDone(task)),
    events: allEvents(),
    ranks: state.ranks,
    todayISO: todayKey(),
  });
  return sortListItems(items);
}
