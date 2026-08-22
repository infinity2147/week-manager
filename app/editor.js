import { allTasks, allEvents, sourceTasks, section, state, saveState } from "./store.js";
import { managerDate } from "../lib/manager-data.js";

const FIELD_IDS = {
  name: "editor-name", priority: "editor-priority", area: "editor-area", status: "editor-status",
  location: "editor-location", next: "editor-next", link: "editor-link", notes: "editor-notes",
  dueDate: "editor-due-date", dueTime: "editor-due-time",
  startDate: "editor-start-date", startTime: "editor-start-time",
  endDate: "editor-end-date", endTime: "editor-end-time",
};

const el = {};
let editing = null;
let onSaved = () => {};

function parts(value = "") {
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
  return { date: match?.[1] || "", time: match?.[2] || "" };
}

function compose(date, time) {
  if (!date) return "";
  return time ? `${date}T${time}:00+05:30` : date;
}

function overrides(kind) {
  return state.overrides[kind];
}

export function openEditor(kind, itemId) {
  const isTask = kind === "tasks";
  const item = (isTask ? allTasks() : allEvents()).find((entry) => entry.id === itemId);
  if (!item) return;
  editing = { kind, itemId };

  document.querySelector("#editor-eyebrow").textContent = isTask ? "Task" : "Event";
  document.querySelector("#editor-title").textContent = isTask ? "Edit task" : "Edit event";
  document.querySelector("#editor-task-dates").hidden = !isTask;
  document.querySelector("#editor-event-start").hidden = isTask;
  document.querySelector("#editor-event-end").hidden = isTask;
  document.querySelector("#editor-priority-field").hidden = !isTask;
  document.querySelector("#editor-next-field").hidden = !isTask;
  document.querySelector("#editor-location-field").hidden = isTask;

  el.name.value = isTask ? item.task : item.event;
  el.area.value = item.area || "Career";
  el.status.value = item.status || "Open";
  el.link.value = item.link || "";
  el.notes.value = item.notes || "";

  if (isTask) {
    const due = parts(item.due);
    el.dueDate.value = due.date;
    el.dueTime.value = due.time;
    el.priority.value = item.priority || "P1";
    el.next.value = item.next_action || "";
  } else {
    const start = parts(item.start);
    const end = parts(item.end);
    el.startDate.value = start.date;
    el.startTime.value = start.time;
    el.endDate.value = end.date || start.date;
    el.endTime.value = end.time;
    el.location.value = item.location || "";
  }

  document.querySelector("#editor-reset").hidden = !overrides(kind)[itemId];
  document.querySelector("#editor-delete").hidden = !item.local;
  document.querySelector("#editor-dialog").showModal();
  requestAnimationFrame(() => el.name.focus());
}

function collect(isTask) {
  const common = {
    area: el.area.value,
    status: el.status.value.trim(),
    link: el.link.value.trim(),
    notes: el.notes.value.trim(),
  };
  if (isTask) {
    return {
      ...common,
      task: el.name.value.trim(),
      due: compose(el.dueDate.value, el.dueTime.value),
      priority: el.priority.value,
      next_action: el.next.value.trim(),
    };
  }
  const startTime = el.startTime.value;
  const endTime = el.endTime.value || startTime;
  return {
    ...common,
    event: el.name.value.trim(),
    start: compose(el.startDate.value, startTime),
    end: compose(el.endDate.value || el.startDate.value, endTime),
    location: el.location.value.trim(),
  };
}

function validate(isTask) {
  el.startTime.setCustomValidity("");
  el.endDate.setCustomValidity("");
  if (isTask) return true;

  if (el.endTime.value && !el.startTime.value) {
    el.startTime.setCustomValidity("Add a start time, or leave both blank for an all-day event.");
    el.startTime.reportValidity();
    return false;
  }
  const start = managerDate(compose(el.startDate.value, el.startTime.value))?.getTime();
  const end = managerDate(compose(el.endDate.value || el.startDate.value, el.endTime.value || el.startTime.value))?.getTime();
  if (Number.isFinite(start) && Number.isFinite(end) && end < start) {
    el.endDate.setCustomValidity("The event must end after it starts.");
    el.endDate.reportValidity();
    return false;
  }
  return true;
}

export function attachEditor(afterSave) {
  onSaved = afterSave;
  for (const [key, elementId] of Object.entries(FIELD_IDS)) el[key] = document.querySelector(`#${elementId}`);
  const dialog = document.querySelector("#editor-dialog");

  document.querySelector("#editor-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!editing) return;
    const isTask = editing.kind === "tasks";
    if (!validate(isTask)) return;

    const source = (isTask ? sourceTasks() : section("events")).find((entry) => entry.id === editing.itemId);
    if (!source) return;
    const fields = collect(isTask);
    const changed = Object.fromEntries(
      Object.entries(fields).filter(([key, value]) => value !== (source[key] || "")),
    );

    if (Object.keys(changed).length) overrides(editing.kind)[editing.itemId] = changed;
    else delete overrides(editing.kind)[editing.itemId];

    saveState({ render: false });
    dialog.close();
    onSaved("Saved in this app.");
  });

  document.querySelector("#editor-reset").addEventListener("click", () => {
    if (!editing) return;
    delete overrides(editing.kind)[editing.itemId];
    saveState({ render: false });
    dialog.close();
    onSaved("Published values restored.");
  });

  document.querySelector("#editor-delete").addEventListener("click", () => {
    if (!editing) return;
    state.localItems = state.localItems.filter((item) => item.id !== editing.itemId);
    delete overrides(editing.kind)[editing.itemId];
    delete state.ranks[editing.itemId];
    saveState({ render: false });
    dialog.close();
    onSaved("Removed from this device.");
  });

  dialog.addEventListener("close", () => {
    editing = null;
    el.startTime.setCustomValidity("");
    el.endDate.setCustomValidity("");
  });

  for (const input of [el.startDate, el.startTime, el.endDate, el.endTime]) {
    input.addEventListener("input", () => {
      el.startTime.setCustomValidity("");
      el.endDate.setCustomValidity("");
    });
  }
}
