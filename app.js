import {
  localISODate,
  managerDate,
  parseManagerMarkdown,
  startOfLocalWeek,
} from "./lib/manager-data.js";

const STORAGE_KEY = "anant-week-manager-v1";
const TIMEZONE = "Asia/Kolkata";
const STATUS_OPTIONS = ["Interested", "Applied", "Challenge", "Interview", "Offer", "Rejected", "Withdrawn"];
const VIEW_TITLES = {
  today: "Today",
  week: "This week",
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

const DEFAULT_STATE = {
  schema: 2,
  view: "today",
  completed: {},
  completedAt: {},
  applicationStatuses: {},
  dsa: {},
  localItems: [],
  applications: [],
  inbox: [],
};

let manager = { metadata: {}, sections: {} };
let state = loadState();
let applicationFilter = "All";
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

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const savedState = saved && typeof saved === "object" ? { ...saved } : {};
    delete savedState.assistantMessages;
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

function saveState({ render = true } = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (render) renderView();
}

function section(name) {
  return manager.sections[name] || [];
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeURL(value = "") {
  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function id(value = "") {
  return escapeHTML(value.replace(/[^a-zA-Z0-9_-]/g, ""));
}

function dateAtNoon(isoDate) {
  return new Date(`${isoDate}T12:00:00+05:30`);
}

function addDays(isoDate, amount) {
  const date = dateAtNoon(isoDate);
  date.setUTCDate(date.getUTCDate() + amount);
  return localISODate(date, TIMEZONE);
}

function dateOnly(value) {
  const date = managerDate(value);
  return date ? localISODate(date, TIMEZONE) : "";
}

function daysFromToday(value) {
  const target = dateOnly(value);
  if (!target) return null;
  const today = localISODate(new Date(), TIMEZONE);
  return Math.round((dateAtNoon(target) - dateAtNoon(today)) / 86_400_000);
}

function formatDate(value, { includeTime = true, weekday = false } = {}) {
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

function formatLongDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function dueInfo(value) {
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

function statusClass(value = "") {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `status-${normalized || "unknown"}`;
}

function effectiveTaskStatus(task) {
  if (Object.prototype.hasOwnProperty.call(state.completed, task.id)) {
    return state.completed[task.id] ? "Done" : "Open";
  }
  return task.status || "Open";
}

function isDone(task) {
  return effectiveTaskStatus(task).toLowerCase() === "done";
}

function sourceTaskDone(task) {
  return (task.status || "Open").toLowerCase() === "done";
}

function taskStatusChanges() {
  return allTasks().filter((task) => Object.prototype.hasOwnProperty.call(state.completed, task.id)
    && Boolean(state.completed[task.id]) !== sourceTaskDone(task));
}

function allTasks() {
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

function taskScore(task) {
  const priority = { P0: 0, P1: 25, P2: 50 }[task.priority] ?? 75;
  const difference = daysFromToday(task.due);
  const dateScore = difference === null ? 500 : difference < 0 ? difference * 8 - 100 : difference * 12;
  return priority + dateScore;
}

function openTasks(tasks = allTasks()) {
  return tasks.filter((task) => !isDone(task)).sort((a, b) => taskScore(a) - taskScore(b));
}

function taskRow(task, { showArea = true, completionView = false } = {}) {
  const done = isDone(task);
  const due = dueInfo(task.due);
  const link = safeURL(task.link);
  const action = task.next_action || task.notes || "";
  const completedAt = state.completedAt[task.id];
  const completionDetail = completedAt
    ? formatDate(completedAt)
    : sourceTaskDone(task) ? "Published plan" : "This app";
  return `
    <article class="task-row ${done ? "is-done" : ""}">
      <button class="check-button ${done ? "is-checked" : ""}" type="button" data-task-id="${id(task.id)}" aria-label="${done ? "Mark incomplete" : "Mark complete"}: ${escapeHTML(task.task)}" aria-pressed="${done}">✓</button>
      <div class="task-copy">
        <span class="task-title">${link ? `<a href="${escapeHTML(link)}" target="_blank" rel="noreferrer">${escapeHTML(task.task)}</a>` : escapeHTML(task.task)}</span>
        ${action ? `<span class="task-action">${escapeHTML(action)}</span>` : ""}
        <div class="task-meta">
          ${showArea ? `<span class="area-pill">${escapeHTML(task.area)}</span>` : ""}
          <span class="priority-pill priority-${escapeHTML((task.priority || "P2").toLowerCase())}">${escapeHTML(task.priority || "P2")}</span>
          ${task.estimate ? `<span class="area-pill">${escapeHTML(task.estimate)}</span>` : ""}
        </div>
      </div>
      <div class="task-side">
        <strong>${escapeHTML(completionView ? "Completed" : due.label)}</strong>
        <span>${escapeHTML(completionView ? completionDetail : formatDate(task.due))}</span>
      </div>
    </article>`;
}

function weekDates() {
  const start = startOfLocalWeek(new Date(), TIMEZONE);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function currentWeekApplicationCount() {
  const dates = new Set(weekDates());
  return allApplications().filter((application) => dates.has(dateOnly(application.applied_on))).length;
}

function applicationStatus(application) {
  return state.applicationStatuses[application.id] || application.status || "Interested";
}

function allApplications() {
  return [...section("applications"), ...state.applications];
}

function topUpcomingEvents(limit = 3) {
  const events = section("events")
    .filter((event) => {
      const difference = daysFromToday(event.start);
      return difference === null || difference >= 0;
    })
    .sort((a, b) => {
      const aDate = managerDate(a.start)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bDate = managerDate(b.start)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    });
  return events.slice(0, limit);
}

function applicationGoal() {
  return Number(manager.metadata.application_goal) || 25;
}

function dsaGoal() {
  return Number(manager.metadata.dsa_daily_goal) || 5;
}

function todayDsa() {
  return Number(state.dsa[localISODate(new Date(), TIMEZONE)]) || 0;
}

function progress(value, goal) {
  return Math.min(100, Math.round((value / Math.max(goal, 1)) * 100));
}

function renderToday() {
  const tasks = openTasks();
  const mustDo = tasks.slice(0, 3);
  const later = tasks.slice(3, 7);
  const dsa = todayDsa();
  const apps = currentWeekApplicationCount();
  const events = topUpcomingEvents();
  const waiting = section("waiting_for").slice(0, 3);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", hour12: false }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return `
    <section class="view">
      <div class="page-intro">
        <div>
          <span class="eyebrow">${escapeHTML(formatLongDate())}</span>
          <h2>${greeting}. Only three things first.</h2>
          <p>The rest of your life is still here, but it does not get to shout at you all at once.</p>
        </div>
        <span class="quiet-note">Updated ${escapeHTML(manager.metadata.updated || "from MANAGER.md")}</span>
      </div>

      <div class="dashboard-grid">
        <article class="card card-pad focus-card">
          <div class="section-heading">
            <div><span class="eyebrow">Must do</span><h2>Your next three</h2></div>
            <span class="count-badge">${mustDo.length} focus items</span>
          </div>
          <div class="task-list">
            ${mustDo.length ? mustDo.map((task) => taskRow(task)).join("") : `<div class="empty-state"><strong>The urgent list is clear.</strong><p>Choose one meaningful next task from This week.</p></div>`}
          </div>
        </article>

        <aside class="card momentum-card">
          <div class="metric-block">
            <div class="metric-label"><span>DSA today</span><div class="stepper"><button type="button" data-dsa-step="-1" aria-label="Remove one DSA question">−</button><button type="button" data-dsa-step="1" aria-label="Add one DSA question">＋</button></div></div>
            <div class="metric-value"><strong>${dsa}</strong><span>of ${dsaGoal()} questions</span></div>
            <div class="progress-track" aria-label="DSA progress"><div class="progress-fill" style="width:${progress(dsa, dsaGoal())}%"></div></div>
            <p class="metric-help">Four is a valid minimum on a deadline-heavy day. Zero is not.</p>
          </div>
          <div class="metric-block">
            <div class="metric-label"><span>Applications this week</span><button class="button-link" type="button" data-open-quick="Application">Log one</button></div>
            <div class="metric-value"><strong>${apps}</strong><span>of ${applicationGoal()} minimum</span></div>
            <div class="progress-track" aria-label="Application progress"><div class="progress-fill" style="width:${progress(apps, applicationGoal())}%"></div></div>
            <p class="metric-help">Stretch ${escapeHTML(manager.metadata.application_stretch || "50")}. Existing applications with unknown dates are not counted.</p>
          </div>
        </aside>
      </div>

      <div class="strip-grid">
        ${events.map((event) => {
          const due = dueInfo(event.start);
          return `<article class="mini-card"><span class="date-pill ${due.className}">${escapeHTML(due.label)}</span><h3>${escapeHTML(event.event)}</h3><p>${escapeHTML(event.location || event.notes)}</p></article>`;
        }).join("")}
      </div>

      <div class="content-grid" style="margin-top:16px">
        <article class="card card-pad span-8">
          <div class="section-heading"><div><span class="eyebrow">After the first three</span><h3>Later, if there is room</h3></div><button class="button button-quiet button-small" type="button" data-nav="week">See full week</button></div>
          <div class="task-list">${later.map((task) => taskRow(task)).join("")}</div>
        </article>
        <article class="card card-pad span-4">
          <div class="section-heading"><div><span class="eyebrow">Missing details</span><h3>Waiting on you</h3></div></div>
          <div class="timeline-list">
            ${waiting.map((item) => `<div class="timeline-item"><span class="timeline-mark"></span><div class="timeline-copy"><strong>${escapeHTML(item.missing_information)}</strong><p>${escapeHTML(item.why_it_matters)}</p></div></div>`).join("")}
          </div>
          <button class="button button-quiet button-small" type="button" data-nav="inbox">Add what you know</button>
        </article>
      </div>
    </section>`;
}

function renderWeek() {
  const dates = weekDates();
  const tasks = allTasks();
  const events = section("events");
  const today = localISODate(new Date(), TIMEZONE);
  const formatter = new Intl.DateTimeFormat("en-IN", { timeZone: TIMEZONE, weekday: "short", day: "numeric", month: "short" });

  return `
    <section class="view">
      <div class="page-intro">
        <div><span class="eyebrow">One screen, seven days</span><h2>See the shape of the week.</h2><p>Hard deadlines and events sit beside movable work. P0 is the only thing allowed to feel urgent.</p></div>
        <button class="button button-quiet" type="button" data-export-calendar>Export calendar</button>
      </div>
      <div class="week-scroll" aria-label="Weekly plan">
        <div class="week-grid">
          ${dates.map((dateString) => {
            const dayTasks = tasks.filter((task) => dateOnly(task.due) === dateString);
            const dayEvents = events.filter((event) => dateOnly(event.start) === dateString);
            const items = [
              ...dayEvents.map((event) => ({ label: event.event, meta: "Event", className: "event" })),
              ...dayTasks.map((task) => ({ label: task.task, meta: task.priority, className: (task.priority || "P2").toLowerCase(), done: isDone(task) })),
            ];
            return `<article class="day-column ${dateString === today ? "is-today" : ""}">
              <div class="day-heading"><strong>${escapeHTML(formatter.format(dateAtNoon(dateString)).split(",")[0])}</strong><span>${escapeHTML(formatter.format(dateAtNoon(dateString)).replace(/^[^,]+,?\s*/, ""))}</span></div>
              <div class="day-items">
                ${items.length ? items.map((item) => `<div class="day-item ${item.className}" style="${item.done ? "opacity:.5;text-decoration:line-through" : ""}"><strong>${escapeHTML(item.meta)}</strong>${escapeHTML(item.label)}</div>`).join("") : `<p class="empty-day">Room to breathe.</p>`}
              </div>
            </article>`;
          }).join("")}
        </div>
      </div>

      <article class="card card-pad" style="margin-top:16px">
        <div class="section-heading"><div><span class="eyebrow">Unscheduled or later</span><h3>Nothing quietly disappears</h3></div></div>
        <div class="task-list">${openTasks().filter((task) => !dates.includes(dateOnly(task.due))).slice(0, 8).map((task) => taskRow(task)).join("")}</div>
      </article>
  </section>`;
}

function renderCompleted() {
  const tasks = allTasks()
    .filter(isDone)
    .sort((a, b) => {
      const aTime = state.completedAt[a.id] ? new Date(state.completedAt[a.id]).getTime() : 0;
      const bTime = state.completedAt[b.id] ? new Date(state.completedAt[b.id]).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return taskScore(a) - taskScore(b);
    });
  const deviceOnly = tasks.filter((task) => state.completed[task.id] === true && !sourceTaskDone(task)).length;
  const published = tasks.length - deviceOnly;
  return `<section class="view completed-view">
    <div class="page-intro"><div><span class="eyebrow">Visible progress</span><h2>Done does not mean disappeared.</h2><p>Every completed task stays here. Tap its green check again if it needs to return to your open plan.</p></div></div>
    <div class="strip-grid">
      <article class="mini-card"><span class="area-pill">Total</span><h3>${tasks.length} completed</h3><p>Visible in this app right now.</p></article>
      <article class="mini-card"><span class="area-pill">Published</span><h3>${published} shared</h3><p>Stored in MANAGER.md and visible wherever the manager opens.</p></article>
      <article class="mini-card"><span class="area-pill">This app only</span><h3>${deviceOnly} waiting to sync</h3><p>Use Inbox & sync to send these check-offs to Codex.</p></article>
    </div>
    <article class="card card-pad" style="margin-top:16px">
      <div class="section-heading"><div><span class="eyebrow">Completion history</span><h3>Your finished work</h3></div>${deviceOnly ? `<button class="button button-quiet button-small" type="button" data-nav="inbox">Sync completions</button>` : ""}</div>
      <div class="task-list">${tasks.length ? tasks.map((task) => taskRow(task, { completionView: true })).join("") : `<div class="empty-state"><strong>No completed tasks yet.</strong><p>When you check something off, it will move here instead of vanishing.</p></div>`}</div>
    </article>
  </section>`;
}

function prepCard(item) {
  const done = isDone(item);
  const isDsa = item.id === "habit-dsa";
  return `<article class="card prep-card ${done ? "is-done" : ""}">
    <span class="status-pill ${statusClass(done ? "Done" : item.status)}">${escapeHTML(done ? "Done" : item.track)}</span>
    <h3>${escapeHTML(item.item)}</h3>
    <p><strong>Next:</strong> ${escapeHTML(item.next_checkpoint)}<br />${escapeHTML(item.evidence_of_done)}</p>
    <div class="prep-footer">
      <span class="quiet-note">${escapeHTML(item.cadence)}</span>
      ${isDsa
        ? `<button class="button button-quiet button-small" type="button" data-dsa-step="1">＋ question</button>`
        : `<button class="check-button ${done ? "is-checked" : ""}" type="button" data-task-id="${id(item.id)}" aria-label="${done ? "Mark incomplete" : "Mark complete"}: ${escapeHTML(item.item)}" aria-pressed="${done}">✓</button>`}
    </div>
  </article>`;
}

function renderDsaWeek() {
  const dates = weekDates();
  const today = localISODate(new Date(), TIMEZONE);
  return `<div class="dsa-week">${dates.map((dateString) => {
    const label = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short" }).format(dateAtNoon(dateString));
    return `<div class="dsa-day ${dateString === today ? "is-today" : ""}"><span>${escapeHTML(label)}</span><strong>${Number(state.dsa[dateString]) || 0}</strong></div>`;
  }).join("")}</div>`;
}

function renderPrep() {
  const prep = section("interview_and_ml_prep");
  const rhythm = section("weekly_rhythm");
  return `
    <section class="view">
      <div class="page-intro"><div><span class="eyebrow">Learn → practice → apply</span><h2>Preparation gets its own room.</h2><p>ML, DL, statistics, DSA, research reading, Pocket FM, and Akuna are visible without mixing them into every other task.</p></div></div>
      <div class="prep-grid">${prep.map(prepCard).join("")}</div>
      <div class="content-grid" style="margin-top:16px">
        <article class="card card-pad span-5">
          <div class="section-heading"><div><span class="eyebrow">Daily practice</span><h3>DSA this week</h3></div><span class="count-badge">${dsaGoal()} / day</span></div>
          ${renderDsaWeek()}
          <div class="sync-actions"><button class="button button-quiet button-small" type="button" data-dsa-step="-1">− one</button><button class="button button-primary button-small" type="button" data-dsa-step="1">＋ solved one</button></div>
        </article>
        <article class="card card-pad span-7">
          <div class="section-heading"><div><span class="eyebrow">Research + quiz rhythm</span><h3>One small step each day</h3></div></div>
          <div class="timeline-list">
            ${rhythm.map((row) => `<div class="timeline-item"><span class="timeline-mark"></span><div class="timeline-copy"><strong>${escapeHTML(row.day)} · ${escapeHTML(row.minimum_viable_day)}</strong><p>RL: ${escapeHTML(row.rl_slp)} · Stochastic: ${escapeHTML(row.stochastic_quiz)}</p></div></div>`).join("")}
          </div>
        </article>
      </div>
    </section>`;
}

function applicationRow(application) {
  const status = applicationStatus(application);
  return `<article class="application-row">
    <div class="application-company"><strong>${escapeHTML(application.company)}</strong><span>${escapeHTML(application.applied_on || "Date not recorded")}</span></div>
    <div class="application-role"><strong>${escapeHTML(application.role)}</strong><span>Follow-up ${escapeHTML(formatDate(application.follow_up, { includeTime: false }))}</span></div>
    <div class="application-action">${escapeHTML(application.next_action || application.notes || "Record the next action")}</div>
    <select class="status-select" data-application-status="${id(application.id)}" aria-label="Status for ${escapeHTML(application.company)}">
      ${STATUS_OPTIONS.map((option) => `<option value="${escapeHTML(option)}" ${option.toLowerCase() === status.toLowerCase() ? "selected" : ""}>${escapeHTML(option)}</option>`).join("")}
    </select>
  </article>`;
}

function rejectionRecords() {
  const fromApplications = allApplications()
    .filter((application) => applicationStatus(application).toLowerCase() === "rejected")
    .map((application) => ({
      id: application.id,
      company: application.company,
      role: application.role,
      rejected_on: "Record date",
      stage: "Record stage",
      reason_or_signal: "No signal recorded yet",
      recovery_action: "Write one lesson, one follow-up, and the next stronger application",
      reapply_after: "Decide after review",
    }));
  return [...section("rejections"), ...fromApplications];
}

function renderCareer() {
  const applications = allApplications();
  const statuses = ["All", "Applied", "Challenge", "Interview", "Offer", "Rejected"];
  const filtered = applicationFilter === "All"
    ? applications
    : applications.filter((application) => applicationStatus(application).toLowerCase() === applicationFilter.toLowerCase());
  const rejected = rejectionRecords();
  const appsThisWeek = currentWeekApplicationCount();
  const followups = applications
    .filter((application) => {
      const difference = daysFromToday(application.follow_up);
      return difference !== null && difference <= 7 && !["Rejected", "Offer", "Withdrawn"].includes(applicationStatus(application));
    })
    .sort((a, b) => (managerDate(a.follow_up)?.getTime() || 0) - (managerDate(b.follow_up)?.getTime() || 0));

  return `<section class="view">
    <div class="page-intro"><div><span class="eyebrow">25 minimum · 50 stretch</span><h2>Every application has a next move.</h2><p>Applied is not a graveyard. Follow-ups, rejections, recovery actions, and reapplication dates stay visible.</p></div><button class="button button-primary" type="button" data-open-quick="Application">＋ Log application</button></div>
    <div class="application-summary">
      <article class="card goal-card">
        <span class="eyebrow">This week's submissions</span>
        <div class="goal-number">${appsThisWeek}<span> / ${applicationGoal()}</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${progress(appsThisWeek, applicationGoal())}%"></div></div>
        <p class="quiet-note">${Math.max(0, applicationGoal() - appsThisWeek)} left for the minimum. Log each submission here.</p>
      </article>
      <article class="card card-pad">
        <div class="section-heading"><div><span class="eyebrow">Follow-up queue</span><h3>Worth checking next</h3></div><span class="count-badge">${followups.length}</span></div>
        <div class="timeline-list">
          ${followups.length ? followups.map((application) => `<div class="timeline-item"><span class="timeline-mark"></span><div class="timeline-copy"><strong>${escapeHTML(application.company)} · ${escapeHTML(application.role)}</strong><p>${escapeHTML(application.next_action)} · ${escapeHTML(formatDate(application.follow_up))}</p></div></div>`).join("") : `<div class="empty-state"><strong>No due follow-ups.</strong><p>Add dates to existing applications so they can surface here.</p></div>`}
        </div>
      </article>
    </div>

    <article class="card card-pad" style="margin-top:16px">
      <div class="section-heading"><div><span class="eyebrow">Pipeline</span><h3>Applications</h3></div><span class="count-badge">${applications.length} tracked</span></div>
      <div class="filters">${statuses.map((status) => `<button class="filter-button ${applicationFilter === status ? "is-active" : ""}" type="button" data-app-filter="${escapeHTML(status)}">${escapeHTML(status)}</button>`).join("")}</div>
      <div class="application-list">${filtered.length ? filtered.map(applicationRow).join("") : `<div class="empty-state"><strong>Nothing in this stage.</strong></div>`}</div>
    </article>

    <article class="card card-pad rejection-card" style="margin-top:16px">
      <div class="section-heading"><div><span class="eyebrow">Rejections & recovery</span><h3>Learn, follow up, re-enter stronger</h3></div><span class="count-badge">${rejected.length}</span></div>
      ${rejected.length ? `<div class="application-list">${rejected.map((item) => `<div class="application-row"><div class="application-company"><strong>${escapeHTML(item.company)}</strong><span>${escapeHTML(item.rejected_on)}</span></div><div class="application-role"><strong>${escapeHTML(item.role)}</strong><span>${escapeHTML(item.stage)}</span></div><div class="application-action">${escapeHTML(item.recovery_action)}</div><span class="status-pill status-rejected">Rejected</span></div>`).join("")}</div>` : `<div class="empty-state"><strong>No rejections recorded.</strong><p>When one arrives, change its status above. This section will ask for the signal, recovery action, and sensible reapply date.</p></div>`}
    </article>
  </section>`;
}

function renderHackathons() {
  const hackathons = section("hackathons");
  const etEvent = section("events").find((event) => event.id === "et-ai-finale");
  const etTasks = openTasks().filter((task) => task.id.startsWith("et-")).slice(0, 6);
  return `<section class="view">
    <div class="page-intro"><div><span class="eyebrow">Apply → prepare → arrive</span><h2>No hackathon deadline gets one line.</h2><p>Each event carries its application step, selection stage, preparation, logistics, and final date.</p></div><button class="button button-quiet" type="button" data-export-calendar>Export all dates</button></div>
    <div class="hackathon-grid">
      ${hackathons.map((hackathon) => {
        const deadline = dueInfo(hackathon.apply_by);
        const link = safeURL(hackathon.link);
        const featured = ["hack-et-ai", "hack-goa"].includes(hackathon.id);
        return `<article class="card hackathon-card ${featured ? "is-featured" : ""}">
          <div><span class="status-pill ${statusClass(hackathon.status)}">${escapeHTML(hackathon.status)}</span></div>
          <h3>${escapeHTML(hackathon.name)}</h3>
          <p>${escapeHTML(formatDate(hackathon.starts, { includeTime: false }))} → ${escapeHTML(formatDate(hackathon.ends, { includeTime: false }))}</p>
          <div class="next-action"><strong>Next action</strong><br />${escapeHTML(hackathon.next_action)}</div>
          <div class="hackathon-footer"><span class="date-pill ${deadline.className}">${escapeHTML(deadline.label)}</span>${link ? `<a class="button button-quiet button-small" href="${escapeHTML(link)}" target="_blank" rel="noreferrer">Open ↗</a>` : ""}</div>
        </article>`;
      }).join("")}
    </div>

    <div class="content-grid" style="margin-top:16px">
      <article class="card card-pad span-5">
        <div class="section-heading"><div><span class="eyebrow">ET AI · 25 August</span><h3>Finale facts</h3></div><span class="status-pill status-confirmed">Confirmed</span></div>
        <dl class="info-list">
          <div class="info-row"><dt>Registration</dt><dd>8:00 AM</dd></div>
          <div class="info-row"><dt>Expected finish</dt><dd>6:00 PM</dd></div>
          <div class="info-row"><dt>Pitch</dt><dd>7–8 minutes</dd></div>
          <div class="info-row"><dt>Jury Q&A</dt><dd>7–8 minutes</dd></div>
          <div class="info-row"><dt>Venue</dt><dd>${escapeHTML(etEvent?.location || "T-Hub, Hyderabad")}</dd></div>
          <div class="info-row"><dt>Bring</dt><dd>Laptop, charger, PPT + PDF backup, ID/Aadhaar, demo materials</dd></div>
        </dl>
        ${safeURL(etEvent?.link) ? `<a class="button button-quiet button-small" href="${escapeHTML(safeURL(etEvent.link))}" target="_blank" rel="noreferrer">Open map ↗</a>` : ""}
      </article>
      <article class="card card-pad span-7">
        <div class="section-heading"><div><span class="eyebrow">ET AI runway</span><h3>What must be closed</h3></div><span class="count-badge">${etTasks.length}</span></div>
        <div class="task-list">${etTasks.map((task) => taskRow(task, { showArea: false })).join("")}</div>
      </article>
    </div>
  </section>`;
}

function renderAcademics() {
  const tasks = openTasks().filter((task) => task.area === "Academics");
  const recurring = section("recurring").filter((item) => item.area === "Academics");
  const waiting = section("waiting_for").filter((item) => item.area === "Academics");
  return `<section class="view">
    <div class="page-intro"><div><span class="eyebrow">Courses without the clutter</span><h2>Monday is prepared during the week.</h2><p>RL SLP and the stochastic quiz are recurring anchors; VNG, CS6103, and Operation Analysis stay visible until their real dates are known.</p></div></div>
    <div class="content-grid">
      <article class="card card-pad span-8"><div class="section-heading"><div><span class="eyebrow">Course work</span><h3>Open academic actions</h3></div><span class="count-badge">${tasks.length}</span></div><div class="task-list">${tasks.map((task) => taskRow(task, { showArea: false })).join("")}</div></article>
      <article class="card card-pad span-4"><div class="section-heading"><div><span class="eyebrow">Recurring anchors</span><h3>Protect these first</h3></div></div><div class="timeline-list">${recurring.map((item) => `<div class="timeline-item"><span class="timeline-mark"></span><div class="timeline-copy"><strong>${escapeHTML(item.commitment)}</strong><p>${escapeHTML(item.schedule)} · ${escapeHTML(item.target)}</p></div></div>`).join("")}</div></article>
      <article class="card card-pad span-12"><div class="section-heading"><div><span class="eyebrow">Dates still missing</span><h3>Give these to Codex when you get them</h3></div></div><div class="strip-grid">${waiting.map((item) => `<div class="mini-card"><span class="area-pill">${escapeHTML(item.area)}</span><h3>${escapeHTML(item.missing_information)}</h3><p>${escapeHTML(item.why_it_matters)}</p></div>`).join("")}</div></article>
    </div>
  </section>`;
}

function renderTravel() {
  const travel = openTasks().filter((task) => task.area === "Travel");
  const events = section("events").filter((event) => event.area === "Travel");
  const waiting = section("waiting_for").filter((item) => item.area === "Travel");
  return `<section class="view">
    <div class="page-intro"><div><span class="eyebrow">Travel only</span><h2>Every trip is a short chain of decisions.</h2><p>Transport, accommodation, packing, and the return journey live here—separate from your coordinator work.</p></div></div>
    <div class="content-grid">
      <article class="card card-pad span-8"><div class="section-heading"><div><span class="eyebrow">Open logistics</span><h3>Travel chain</h3></div><span class="count-badge">${travel.length}</span></div><div class="task-list">${travel.length ? travel.map((task) => taskRow(task, { showArea: false })).join("") : `<div class="empty-state"><strong>No open travel actions.</strong><p>Add the next trip when its dates are known.</p></div>`}</div></article>
      <article class="card card-pad span-4"><div class="section-heading"><div><span class="eyebrow">Known itinerary</span><h3>Travel events</h3></div></div><div class="timeline-list">${events.length ? events.map((event) => `<div class="timeline-item"><span class="timeline-mark"></span><div class="timeline-copy"><strong>${escapeHTML(event.event)}</strong><p>${escapeHTML(formatDate(event.start, { weekday: true }))} · ${escapeHTML(event.location || "Location needed")}</p></div></div>`).join("") : `<div class="empty-state"><strong>No journey recorded.</strong><p>Tell Codex when a trip is confirmed.</p></div>`}</div></article>
      <article class="card card-pad span-12"><div class="section-heading"><div><span class="eyebrow">Before booking</span><h3>Missing travel details</h3></div></div><div class="strip-grid">${waiting.length ? waiting.map((item) => `<div class="mini-card"><span class="area-pill">Needed</span><h3>${escapeHTML(item.missing_information)}</h3><p>${escapeHTML(item.why_it_matters)}</p></div>`).join("") : `<div class="empty-state"><strong>Nothing is blocking a booking.</strong></div>`}</div></article>
    </div>
  </section>`;
}

function renderGoldenJubilee() {
  const tasks = openTasks().filter((task) => ["Golden Jubilee", "Leadership"].includes(task.area));
  return `<section class="view">
    <div class="page-intro"><div><span class="eyebrow">Overall coordinator</span><h2>Golden Jubilee has its own command board.</h2><p>Decisions, owners, follow-ups, and deadlines stay here. Travel is tracked separately.</p></div></div>
    <div class="content-grid">
      <article class="card card-pad span-8"><div class="section-heading"><div><span class="eyebrow">Coordinator queue</span><h3>Open Golden Jubilee actions</h3></div><span class="count-badge">${tasks.length}</span></div><div class="task-list">${tasks.length ? tasks.map((task) => taskRow(task, { showArea: false })).join("") : `<div class="empty-state"><strong>The coordinator queue is clear.</strong><p>Tell Codex the next decision, owner, or deadline when it arrives.</p></div>`}</div></article>
      <article class="card card-pad span-4"><div class="section-heading"><div><span class="eyebrow">No manual entry</span><h3>Just tell Codex</h3></div></div><p class="quiet-note">Open this folder in Codex and speak naturally. For example:</p><div class="intent-example">Golden Jubilee: vendor quotes are due Friday. Ask Riya for the stage estimate by Wednesday, then publish.</div><p class="quiet-note">Codex will split that into concrete tasks, update MANAGER.md, test it, and publish the site.</p></article>
    </div>
  </section>`;
}

function localChangeCount() {
  return taskStatusChanges().length
    + Object.keys(state.applicationStatuses).length
    + state.localItems.length
    + state.applications.length
    + state.inbox.length
    + Object.keys(state.dsa).length;
}

function renderInbox() {
  const waiting = section("waiting_for");
  const localItems = [...state.localItems, ...state.inbox.map((item) => ({ ...item, kind: "Note" }))];
  return `<section class="view">
    <div class="page-intro"><div><span class="eyebrow">No manual tables</span><h2>Tell Codex in normal sentences.</h2><p>Open this project folder in Codex, paste a message or email, and ask it to update and publish. The website inbox is only a fallback when Codex is not open.</p></div></div>
    <div class="content-grid">
      <article class="card card-pad span-12">
        <div class="section-heading"><div><span class="eyebrow">Default workflow</span><h3>One message is enough</h3></div><button class="button button-quiet button-small" type="button" data-copy-template>Copy starter</button></div>
        <div class="intent-example">Add these to my manager and publish: [paste anything here—tasks, an email, application update, rejection, hackathon, course date, travel plan, or Golden Jubilee work].</div>
        <p class="quiet-note">Dates and structure are optional. Codex extracts what is known, records missing facts without inventing them, runs the checks, pushes to GitHub, and waits for Pages to update.</p>
      </article>
      <article class="card card-pad span-12">
        <div class="section-heading"><div><span class="eyebrow">Website ↔ Dock app</span><h3>What is actually linked?</h3></div></div>
        <dl class="info-list">
          <div class="info-row"><dt>Published plan</dt><dd><strong>Linked.</strong> Tasks and dates in MANAGER.md update on both the website and Safari Dock app after deployment and refresh.</dd></div>
          <div class="info-row"><dt>Check-offs and DSA</dt><dd><strong>Local.</strong> Treat Safari and the Dock app as separate storage; a check-off may appear in only the place where you made it.</dd></div>
          <div class="info-row"><dt>Make it shared</dt><dd>Choose <strong>Copy for Codex</strong>, paste it into this project, and say <strong>publish</strong>. Codex writes the changes into MANAGER.md so every copy can see them.</dd></div>
        </dl>
      </article>
      <article class="card card-pad capture-card span-7">
        <div class="section-heading"><div><span class="eyebrow">Website fallback</span><h3>What just changed?</h3></div></div>
        <form class="capture-inline" id="inbox-form"><input name="capture" maxlength="220" required placeholder="e.g. VNG presentation is 3 September at 2 PM" aria-label="New information" /><button class="button button-primary" type="submit">Save note</button></form>
        <p class="quiet-note">No form-filling required. A sentence is enough.</p>
      </article>
      <article class="card card-pad span-5">
        <div class="section-heading"><div><span class="eyebrow">Codex handoff</span><h3>${localChangeCount()} local changes</h3></div></div>
        <p class="quiet-note">GitHub Pages cannot safely hold a Codex or OpenAI secret in the browser. This handoff keeps credentials out of the public site.</p>
        <div class="sync-actions"><button class="button button-primary button-small" type="button" data-copy-codex>Copy for Codex</button><button class="button button-quiet button-small" type="button" data-download-update>Download update.md</button><a class="button button-quiet button-small" href="./MANAGER.md" target="_blank">Open source</a></div>
      </article>

      <article class="card card-pad span-7">
        <div class="section-heading"><div><span class="eyebrow">Local additions</span><h3>Captured on this device</h3></div><span class="count-badge">${localItems.length + state.applications.length}</span></div>
        <div class="local-list">
          ${localItems.map((item) => `<div class="local-row"><div><strong>${escapeHTML(item.title || item.text)}</strong><span>${escapeHTML(item.kind || "Note")}${item.date ? ` · ${escapeHTML(formatDate(item.date, { includeTime: false }))}` : ""}</span></div><button class="icon-button danger-button" type="button" data-delete-local="${id(item.id)}" aria-label="Delete">×</button></div>`).join("")}
          ${state.applications.map((item) => `<div class="local-row"><div><strong>${escapeHTML(item.company)} · ${escapeHTML(item.role)}</strong><span>Application · ${escapeHTML(item.applied_on)}</span></div><button class="icon-button danger-button" type="button" data-delete-local="${id(item.id)}" aria-label="Delete">×</button></div>`).join("")}
          ${localItems.length + state.applications.length === 0 ? `<div class="empty-state"><strong>Nothing waiting to sync.</strong><p>Use the sentence box above or Add something.</p></div>` : ""}
        </div>
      </article>
      <article class="card card-pad span-5">
        <div class="section-heading"><div><span class="eyebrow">Still missing</span><h3>Questions that unblock plans</h3></div></div>
        <div class="timeline-list">${waiting.map((item) => `<div class="timeline-item"><span class="timeline-mark"></span><div class="timeline-copy"><strong>${escapeHTML(item.missing_information)}</strong><p>Next check: ${escapeHTML(item.next_check)}</p></div></div>`).join("")}</div>
      </article>

      <article class="card card-pad span-6">
        <div class="section-heading"><div><span class="eyebrow">Telegram reminders</span><h3>Private tokens, scheduled digests</h3></div><span class="status-pill status-active">Ready to connect</span></div>
        <p class="quiet-note">The repository includes morning and evening GitHub Actions. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID as repository secrets; never paste them into this website.</p>
        <a class="button button-quiet button-small" href="./README.md#telegram-reminders" target="_blank">Setup guide</a>
      </article>
      <article class="card card-pad span-6">
        <div class="section-heading"><div><span class="eyebrow">Instagram plan</span><h3>Keep Telegram primary</h3></div><span class="status-pill status-tentative">Phase 2</span></div>
        <p class="quiet-note">Instagram automation needs a Meta app, an eligible professional account, a server-side token, and messaging permissions. It should be added only after Telegram is reliable—not inside a public Pages site.</p>
      </article>

      <article class="card card-pad span-12">
        <div class="section-heading"><div><span class="eyebrow">Backup & portability</span><h3>Your browser data remains yours</h3></div></div>
        <div class="sync-actions"><button class="button button-quiet button-small" type="button" data-export-backup>Export browser backup</button><button class="button button-quiet button-small" type="button" data-import-backup>Import backup</button><button class="button button-quiet button-small" type="button" data-export-calendar>Export calendar</button></div>
      </article>
    </div>
  </section>`;
}

function renderMore() {
  const links = [
    ["✓", "Completed", "Finished tasks stay visible and can be restored", "completed"],
    ["◇", "Hackathons", "Finales, applications, and logistics", "hackathons"],
    ["□", "Academics", "RL SLP, stochastic quiz, and courses", "academics"],
    ["⌁", "Travel", "Flights, accommodation, packing, and journeys", "travel"],
    ["✦", "Golden Jubilee", "Your overall-coordinator decisions and follow-ups", "golden"],
    ["＋", "Inbox & sync", "Capture, Codex handoff, and reminders", "inbox"],
  ];
  return `<section class="view"><div class="page-intro"><div><span class="eyebrow">Everything else</span><h2>Open only the area you need.</h2></div></div><div class="more-grid">${links.map(([icon, title, description, view]) => `<button class="more-card" type="button" data-nav="${view}"><span>${icon}</span><strong>${title}</strong><p>${description}</p></button>`).join("")}</div></section>`;
}

function renderView() {
  const validView = VIEW_TITLES[state.view] ? state.view : "today";
  state.view = validView;
  viewTitle.textContent = VIEW_TITLES[validView];
  document.title = `${VIEW_TITLES[validView]} · Anant's Week Manager`;
  document.querySelectorAll("[data-nav]").forEach((button) => button.classList.toggle("is-active", button.dataset.nav === validView));
  document.querySelectorAll(".mobile-nav-item").forEach((button) => {
    const isMoreArea = ["completed", "hackathons", "academics", "travel", "golden", "inbox", "more"].includes(validView);
    button.classList.toggle("is-active", button.dataset.nav === validView || (button.dataset.nav === "more" && isMoreArea));
  });

  const renderers = {
    today: renderToday,
    week: renderWeek,
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
}

function navigate(view) {
  state.view = VIEW_TITLES[view] ? view : "today";
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

function codexUpdateMarkdown() {
  const completed = allTasks().filter((task) => state.completed[task.id] === true && !sourceTaskDone(task));
  const reopened = allTasks().filter((task) => state.completed[task.id] === false && sourceTaskDone(task));
  const statusChanges = allApplications().filter((application) => state.applicationStatuses[application.id]);
  const dsaEntries = Object.entries(state.dsa).filter(([, count]) => Number(count) > 0).sort(([a], [b]) => a.localeCompare(b));
  const lines = [
    "# Week Manager update",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "> Please reconcile these browser-local changes into MANAGER.md. Preserve hard vs personal deadlines and ask only if a missing fact would materially change the plan.",
    "",
    "## Completed",
    "",
    ...(completed.length ? completed.map((task) => `- [x] ${task.task} (${task.id})${state.completedAt[task.id] ? `; completed ${state.completedAt[task.id]}` : ""}`) : ["- None recorded"]),
    "",
    "## Reopened",
    "",
    ...(reopened.length ? reopened.map((task) => `- [ ] ${task.task} (${task.id})`) : ["- None recorded"]),
    "",
    "## Application status changes",
    "",
    ...(statusChanges.length ? statusChanges.map((application) => `- ${application.company} — ${application.role}: ${state.applicationStatuses[application.id]}`) : ["- None recorded"]),
    "",
    "## New applications",
    "",
    ...(state.applications.length ? state.applications.map((application) => `- ${application.company} — ${application.role}; applied ${application.applied_on}; status ${applicationStatus(application)}`) : ["- None recorded"]),
    "",
    "## DSA log",
    "",
    ...(dsaEntries.length ? dsaEntries.map(([date, count]) => `- ${date}: ${count} questions`) : ["- None recorded"]),
    "",
    "## New tasks and deadlines",
    "",
    ...(state.localItems.length ? state.localItems.map((item) => `- ${item.kind}: ${item.title}${item.date ? `; ${item.date}` : ""}${item.detail ? `; ${item.detail}` : ""}`) : ["- None recorded"]),
    "",
    "## Raw inbox notes",
    "",
    ...(state.inbox.length ? state.inbox.map((item) => `- ${item.text}`) : ["- None recorded"]),
    "",
  ];
  return lines.join("\n");
}

function escapeICS(value = "") {
  return String(value).replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll("\n", "\\n");
}

function icsDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { value: value.replaceAll("-", ""), allDay: true };
  const date = managerDate(value);
  if (!date) return null;
  return { value: date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""), allDay: false };
}

function calendarICS() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const entries = [];
  for (const event of section("events")) {
    const start = icsDate(event.start);
    if (!start) continue;
    let end = icsDate(event.end) || start;
    if (start.allDay) end = icsDate(addDays(event.end, 1)) || start;
    entries.push([
      "BEGIN:VEVENT",
      `UID:${escapeICS(event.id)}@anant-week-manager`,
      `DTSTAMP:${stamp}`,
      start.allDay ? `DTSTART;VALUE=DATE:${start.value}` : `DTSTART:${start.value}`,
      end.allDay ? `DTEND;VALUE=DATE:${end.value}` : `DTEND:${end.value}`,
      `SUMMARY:${escapeICS(event.event)}`,
      `DESCRIPTION:${escapeICS([event.notes, event.location].filter(Boolean).join(" · "))}`,
      event.location ? `LOCATION:${escapeICS(event.location)}` : "",
      safeURL(event.link) ? `URL:${escapeICS(safeURL(event.link))}` : "",
      "END:VEVENT",
    ].filter(Boolean).join("\r\n"));
  }
  for (const task of openTasks()) {
    const due = icsDate(task.due);
    if (!due) continue;
    entries.push([
      "BEGIN:VEVENT",
      `UID:${escapeICS(task.id)}@anant-week-manager`,
      `DTSTAMP:${stamp}`,
      due.allDay ? `DTSTART;VALUE=DATE:${due.value}` : `DTSTART:${due.value}`,
      `SUMMARY:${escapeICS(`${task.priority || "Task"} · ${task.task}`)}`,
      `DESCRIPTION:${escapeICS([task.next_action, task.notes].filter(Boolean).join(" · "))}`,
      "END:VEVENT",
    ].join("\r\n"));
  }
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Anant Week Manager//EN", "CALSCALE:GREGORIAN", ...entries, "END:VCALENDAR", ""].join("\r\n");
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
    applicationFilter = filter.dataset.appFilter;
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
    event.target.closest("dialog")?.close();
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
    const importedCompleted = imported.completed && typeof imported.completed === "object" ? imported.completed : {};
    const completed = Number(imported.schema) >= 2
      ? importedCompleted
      : Object.fromEntries(Object.entries(importedCompleted).filter(([, value]) => value === true));
    state = {
      ...DEFAULT_STATE,
      ...imported,
      schema: DEFAULT_STATE.schema,
      completed,
      completedAt: { ...(imported.completedAt || {}) },
      applicationStatuses: { ...(imported.applicationStatuses || {}) },
      dsa: { ...(imported.dsa || {}) },
      localItems: Array.isArray(imported.localItems) ? imported.localItems : [],
      applications: Array.isArray(imported.applications) ? imported.applications : [],
      inbox: Array.isArray(imported.inbox) ? imported.inbox : [],
    };
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
  try {
    const response = await fetch("./MANAGER.md", { cache: "no-store" });
    if (!response.ok) throw new Error(`MANAGER.md returned ${response.status}`);
    manager = parseManagerMarkdown(await response.text());
    if (state.view === "life") state.view = "travel";
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView && VIEW_TITLES[requestedView]) state.view = requestedView;
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
