import {
  localISODate,
  managerDate,
  parseManagerMarkdown,
  startOfLocalWeek,
} from "./lib/manager-data.js";
import {
  state,
  manager,
  DEFAULT_STATE,
  TIMEZONE,
  migrateOverrides,
  section,
  saveState,
  setRenderer,
  setManager,
  allTasks,
  allEvents,
  sourceTasks,
  isDone,
  sourceTaskDone,
  effectiveTaskStatus,
  todayKey,
  openListItems,
  ranks,
  setRank,
  clearRanks,
} from "./app/store.js";

const VIEW_TITLES = {
  list: "Everything",
  completed: "Completed",
  prep: "Prep",
  career: "Applications",
  hackathons: "Hackathons",
  academics: "Academics",
  travel: "Travel",
  golden: "Golden Jubilee",
  inbox: "Inbox & sync",
  more: "More",
};

let installPrompt = null;
let toastTimer = null;

const viewRoot = document.querySelector("#view-root");
const viewTitle = document.querySelector("#view-title");
const weekLabel = document.querySelector("#week-label");
const quickDialog = document.querySelector("#quick-dialog");
const quickForm = document.querySelector("#quick-form");
const quickKind = document.querySelector("#quick-kind");
const quickTitle = document.querySelector("#quick-title");
const quickDate = document.querySelector("#quick-date");
const quickArea = document.querySelector("#quick-area");
const quickDetail = document.querySelector("#quick-detail");
const installDialog = document.querySelector("#install-dialog");
const installButton = document.querySelector("#install-button");
const importInput = document.querySelector("#import-input");

import {
  escapeHTML, safeURL, id, dateAtNoon, addDays, dateOnly, daysFromToday,
  formatDate, formatLongDate, dueInfo, statusClass,
} from "./app/format.js";
import { renderList, moveItem, attachListDrag } from "./app/list.js";
import { openEditor, attachEditor } from "./app/editor.js";
import {
  applicationStatus,
  setApplicationFilter,
  calendarICS,
  codexUpdateMarkdown,
  dsaGoal,
  renderAcademics,
  renderCareer,
  renderCompleted,
  renderGoldenJubilee,
  renderHackathons,
  renderInbox,
  renderMore,
  renderPrep,
  renderTravel,
  weekDates,
} from "./app/views.js";























function renderView() {
  const validView = VIEW_TITLES[state.view] ? state.view : "list";
  state.view = validView;
  viewTitle.textContent = VIEW_TITLES[validView];
  document.title = `${VIEW_TITLES[validView]} · Anant's Week Manager`;
  document.querySelectorAll("[data-nav]").forEach((button) => button.classList.toggle("is-active", button.dataset.nav === validView));
  document.querySelectorAll(".mobile-nav-item").forEach((button) => {
    const isMoreArea = ["prep", "hackathons", "academics", "travel", "golden", "inbox", "more"].includes(validView);
    button.classList.toggle("is-active", button.dataset.nav === validView || (button.dataset.nav === "more" && isMoreArea));
  });

  const renderers = {
    list: renderList,
    completed: renderCompleted,
    prep: renderPrep,
    career: renderCareer,
    hackathons: renderHackathons,
    academics: renderAcademics,
    travel: renderTravel,
    golden: renderGoldenJubilee,
    inbox: renderInbox,
    more: renderMore,
  };
  viewRoot.innerHTML = renderers[validView]();
  viewRoot.scrollTop = 0;
  attachListDrag(viewRoot);
}

function navigate(view) {
  state.view = VIEW_TITLES[view] ? view : "list";
  saveState({ render: false });
  renderView();
  history.replaceState(null, "", `${window.location.pathname}?view=${state.view}`);
}

function updateQuickLabels() {
  const kind = quickKind.value;
  document.querySelector("#quick-dialog-title").textContent = kind === "Application" ? "Log an application" : `Add ${kind.toLowerCase()}`;
  document.querySelector("#quick-title-label").textContent = kind === "Application" ? "Company" : "Title";
  document.querySelector("#quick-date-label").textContent = kind === "Application" ? "Applied on" : "Due";
  document.querySelector("#quick-detail-label").textContent = kind === "Application" ? "Role" : "Next action or detail";
  quickTitle.placeholder = kind === "Application" ? "e.g. OpenAI" : "e.g. Book the flight home";
  quickDetail.placeholder = kind === "Application" ? "e.g. Research Engineer" : "The smallest useful next step";
  quickArea.closest("label").hidden = kind === "Application";
}

function openQuick(kind = "Task") {
  quickForm.reset();
  quickKind.value = kind;
  quickDate.value = localISODate(new Date(), TIMEZONE);
  updateQuickLabels();
  quickDialog.showModal();
  requestAnimationFrame(() => quickTitle.focus());
}

function uniqueId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function downloadFile(content, filename, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}



async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

document.addEventListener("click", async (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    navigate(nav.dataset.nav);
    return;
  }

  const editTask = event.target.closest("[data-edit-task]");
  if (editTask) {
    openEditor("tasks", editTask.dataset.editTask);
    return;
  }

  const editEvent = event.target.closest("[data-edit-event]");
  if (editEvent) {
    openEditor("events", editEvent.dataset.editEvent);
    return;
  }


  const listMove = event.target.closest("[data-list-move]");
  if (listMove) {
    const items = openListItems();
    const from = items.findIndex((item) => item.id === listMove.dataset.listMove);
    if (from >= 0 && moveItem(listMove.dataset.listMove, from + Number(listMove.dataset.direction))) {
      showToast("Order updated.");
    }
    return;
  }

  if (event.target.closest("[data-clear-ranks]")) {
    clearRanks();
    saveState();
    showToast("Back to automatic order.");
    return;
  }

  const taskButton = event.target.closest("[data-task-id]");
  if (taskButton) {
    const taskId = taskButton.dataset.taskId;
    const task = allTasks().find((item) => item.id === taskId);
    if (!task) return;
    if (isDone(task)) {
      if (sourceTaskDone(task)) state.completed[taskId] = false;
      else delete state.completed[taskId];
      delete state.completedAt[taskId];
    } else {
      if (sourceTaskDone(task)) delete state.completed[taskId];
      else state.completed[taskId] = true;
      state.completedAt[taskId] = new Date().toISOString();
    }
    saveState();
    showToast(isDone(task) ? "Done. It is saved in Completed." : "Moved back to open.");
    return;
  }

  const dsaButton = event.target.closest("[data-dsa-step]");
  if (dsaButton) {
    const today = localISODate(new Date(), TIMEZONE);
    state.dsa[today] = Math.max(0, (Number(state.dsa[today]) || 0) + Number(dsaButton.dataset.dsaStep));
    saveState();
    if (state.dsa[today] === dsaGoal()) showToast("Daily DSA target reached.");
    return;
  }

  const quickButton = event.target.closest("[data-open-quick]");
  if (quickButton) {
    openQuick(quickButton.dataset.openQuick || "Task");
    return;
  }

  if (event.target.closest("#quick-add-button")) {
    openQuick("Task");
    return;
  }

  const filter = event.target.closest("[data-app-filter]");
  if (filter) {
    setApplicationFilter(filter.dataset.appFilter);
    renderView();
    return;
  }

  const deleteButton = event.target.closest("[data-delete-local]");
  if (deleteButton) {
    const targetId = deleteButton.dataset.deleteLocal;
    state.localItems = state.localItems.filter((item) => item.id !== targetId);
    state.applications = state.applications.filter((item) => item.id !== targetId);
    state.inbox = state.inbox.filter((item) => item.id !== targetId);
    saveState();
    showToast("Removed from this device.");
    return;
  }

  if (event.target.closest("[data-copy-codex]")) {
    await copyText(codexUpdateMarkdown());
    showToast("Update copied. Paste it into Codex in this folder.");
    return;
  }

  if (event.target.closest("[data-copy-template]")) {
    await copyText("Add these to my manager and publish: ");
    showToast("Starter copied. Paste it into Codex and add your update.");
    return;
  }

  if (event.target.closest("[data-download-update]")) {
    downloadFile(codexUpdateMarkdown(), `week-manager-update-${localISODate(new Date(), TIMEZONE)}.md`, "text/markdown;charset=utf-8");
    showToast("Codex update downloaded.");
    return;
  }

  if (event.target.closest("[data-export-calendar]")) {
    downloadFile(calendarICS(), "anant-week-manager.ics", "text/calendar;charset=utf-8");
    showToast("Calendar file downloaded.");
    return;
  }

  if (event.target.closest("[data-export-backup]")) {
    downloadFile(JSON.stringify({ exportedAt: new Date().toISOString(), state }, null, 2), `week-manager-backup-${localISODate(new Date(), TIMEZONE)}.json`, "application/json");
    showToast("Browser backup downloaded.");
    return;
  }

  if (event.target.closest("[data-import-backup]")) {
    importInput.click();
    return;
  }

  if (event.target.closest("[data-close-dialog]")) {
    const dialog = event.target.closest("dialog");
    dialog?.close();
  }
});

document.addEventListener("change", (event) => {
  const statusSelect = event.target.closest("[data-application-status]");
  if (statusSelect) {
    state.applicationStatuses[statusSelect.dataset.applicationStatus] = statusSelect.value;
    saveState();
    showToast(`Application moved to ${statusSelect.value}.`);
  }
});

document.addEventListener("keydown", (event) => {
  if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
  const row = event.target.closest?.("[data-list-id]");
  if (!row) return;
  event.preventDefault();
  const items = openListItems();
  const from = items.findIndex((item) => item.id === row.dataset.listId);
  if (from >= 0 && moveItem(row.dataset.listId, from + (event.key === "ArrowUp" ? -1 : 1))) {
    showToast("Order updated.");
  }
});

quickKind.addEventListener("change", updateQuickLabels);

quickForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const kind = quickKind.value;
  const title = quickTitle.value.trim();
  const detail = quickDetail.value.trim();
  const date = quickDate.value;
  if (!title) return;

  if (kind === "Application") {
    state.applications.push({
      id: uniqueId("app"),
      company: title,
      role: detail || "Role not recorded",
      status: "Applied",
      applied_on: date || localISODate(new Date(), TIMEZONE),
      next_action: "Add a follow-up date and monitor email or portal",
      follow_up: date ? addDays(date, 7) : addDays(localISODate(new Date(), TIMEZONE), 7),
      link: "",
      notes: "Added from the website",
    });
  } else if (kind === "Note") {
    state.inbox.push({ id: uniqueId("note"), text: title + (detail ? ` — ${detail}` : ""), createdAt: new Date().toISOString() });
  } else {
    state.localItems.push({ id: uniqueId("item"), kind, title, date, area: quickArea.value, detail, createdAt: new Date().toISOString() });
  }
  saveState({ render: false });
  quickDialog.close();
  renderView();
  showToast(kind === "Application" ? "Application logged." : "Captured on this device.");
});

document.addEventListener("submit", (event) => {

  if (event.target.id !== "inbox-form") return;
  event.preventDefault();
  const input = event.target.elements.capture;
  const text = input.value.trim();
  if (!text) return;
  state.inbox.push({ id: uniqueId("note"), text, createdAt: new Date().toISOString() });
  input.value = "";
  saveState();
  showToast("Saved. You can sort it with Codex later.");
});

importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const imported = parsed.state || parsed;
    if (!imported || typeof imported !== "object") throw new Error("Invalid backup");
    delete imported.assistantMessages;
    delete imported.scheduleOverrides;
    const importedCompleted = imported.completed && typeof imported.completed === "object" ? imported.completed : {};
    const completed = Number(imported.schema) >= 2
      ? importedCompleted
      : Object.fromEntries(Object.entries(importedCompleted).filter(([, value]) => value === true));
    const nextState = {
      ...DEFAULT_STATE,
      ...imported,
      schema: DEFAULT_STATE.schema,
      completed,
      completedAt: { ...(imported.completedAt || {}) },
      overrides: migrateOverrides(imported),
      ranks: { ...DEFAULT_STATE.ranks, ...(imported.ranks || {}) },
      dayPlans: imported.dayPlans && typeof imported.dayPlans === "object" ? imported.dayPlans : {},
      applicationStatuses: { ...(imported.applicationStatuses || {}) },
      dsa: { ...(imported.dsa || {}) },
      localItems: Array.isArray(imported.localItems) ? imported.localItems : [],
      applications: Array.isArray(imported.applications) ? imported.applications : [],
      inbox: Array.isArray(imported.inbox) ? imported.inbox : [],
    };
    Object.keys(state).forEach((key) => delete state[key]);
    Object.assign(state, nextState);
    saveState();
    showToast("Backup imported.");
  } catch {
    showToast("That file is not a valid Week Manager backup.");
  } finally {
    importInput.value = "";
  }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installButton.hidden = true;
  } else {
    installDialog.showModal();
  }
});

async function init() {
  setRenderer(renderView);
  attachEditor((message) => { renderView(); showToast(message); });
  try {
    const response = await fetch("./MANAGER.md", { cache: "no-store" });
    if (!response.ok) throw new Error(`MANAGER.md returned ${response.status}`);
    setManager(parseManagerMarkdown(await response.text()));
    const RETIRED_VIEWS = { life: "travel", today: "list", now: "list", week: "list" };
    if (RETIRED_VIEWS[state.view]) state.view = RETIRED_VIEWS[state.view];
    const requestedView = new URLSearchParams(window.location.search).get("view");
    const resolvedView = RETIRED_VIEWS[requestedView] || requestedView;
    if (resolvedView && VIEW_TITLES[resolvedView]) state.view = resolvedView;
    const currentWeek = manager.metadata.current_week?.split(" to ") || weekDates();
    weekLabel.textContent = currentWeek.length === 2
      ? `${formatDate(currentWeek[0], { includeTime: false })} – ${formatDate(currentWeek[1], { includeTime: false })}`
      : "Your current week";
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    installButton.hidden = Boolean(standalone);
    renderView();
  } catch (error) {
    viewRoot.innerHTML = `<section class="source-error"><h2>The plan could not load.</h2><p>${escapeHTML(error.message)}</p><p>If you opened <code>index.html</code> directly, start a local web server instead: <code>python3 -m http.server 8080</code>, then open <code>http://localhost:8080</code>.</p><a href="./MANAGER.md">Open MANAGER.md</a></section>`;
  }

  if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

init();
