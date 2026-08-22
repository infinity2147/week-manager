import {
  STATUS_OPTIONS, state, manager, TIMEZONE, section, allTasks, allEvents, sourceTasks,
  isDone, sourceTaskDone, effectiveTaskStatus, todayKey,
} from "./store.js";
import {
  escapeHTML, safeURL, id, dateAtNoon, addDays, dateOnly, daysFromToday,
  formatDate, formatLongDate, dueInfo, statusClass,
} from "./format.js";
import { localISODate, managerDate, startOfLocalWeek } from "../lib/manager-data.js";

let applicationFilter = "All";

export function setApplicationFilter(value) {
  applicationFilter = value;
}

export function taskStatusChanges() {
  return allTasks().filter((task) => Object.prototype.hasOwnProperty.call(state.completed, task.id)
    && Boolean(state.completed[task.id]) !== sourceTaskDone(task));
}

export function scheduleOverrideCount() {
  return Object.keys(state.overrides.tasks).length + Object.keys(state.overrides.events).length;
}

export function eventEditButton(eventId, label = "Edit date") {
  return `<button class="button button-quiet button-small schedule-inline" type="button" data-edit-event="${id(eventId)}">✎ ${escapeHTML(label)}</button>`;
}

export function taskScore(task) {
  const priority = { P0: 0, P1: 25, P2: 50 }[task.priority] ?? 75;
  const difference = daysFromToday(task.due);
  const dateScore = difference === null ? 500 : difference < 0 ? difference * 8 - 100 : difference * 12;
  return priority + dateScore;
}

export function openTasks(tasks = allTasks()) {
  return tasks.filter((task) => !isDone(task)).sort((a, b) => taskScore(a) - taskScore(b));
}

export function taskRow(task, { showArea = true, completionView = false } = {}) {
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
        <span class="task-title">${link
          ? `<a href="${escapeHTML(link)}" target="_blank" rel="noreferrer">${escapeHTML(task.task)}</a>`
          : `<button class="row-open" type="button" data-edit-task="${id(task.id)}">${escapeHTML(task.task)}</button>`}</span>
        ${action ? `<span class="task-action">${escapeHTML(action)}</span>` : ""}
        <div class="task-meta">
          ${showArea ? `<span class="area-pill">${escapeHTML(task.area)}</span>` : ""}
          <span class="priority-pill priority-${escapeHTML((task.priority || "P2").toLowerCase())}">${escapeHTML(task.priority || "P2")}</span>
          ${task.estimate ? `<span class="area-pill">${escapeHTML(task.estimate)}</span>` : ""}
          ${task.schedule_local ? `<span class="local-edit-note">Date edited here</span>` : ""}
        </div>
      </div>
      <button class="task-side schedule-button" type="button" data-edit-task="${id(task.id)}" aria-label="Edit deadline for ${escapeHTML(task.task)}">
        <strong>${escapeHTML(completionView ? "Completed" : due.label)} <span class="schedule-pencil" aria-hidden="true">✎</span></strong>
        <span>${escapeHTML(completionView ? completionDetail : formatDate(task.due))}</span>
      </button>
    </article>`;
}

export function weekDates() {
  const start = startOfLocalWeek(new Date(), TIMEZONE);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function currentWeekApplicationCount() {
  const dates = new Set(weekDates());
  return allApplications().filter((application) => dates.has(dateOnly(application.applied_on))).length;
}

export function applicationStatus(application) {
  return state.applicationStatuses[application.id] || application.status || "Interested";
}

export function allApplications() {
  return [...section("applications"), ...state.applications];
}

export function applicationGoal() {
  return Number(manager.metadata.application_goal) || 25;
}

export function dsaGoal() {
  return Number(manager.metadata.dsa_daily_goal) || 5;
}

export function todayDsa() {
  return Number(state.dsa[localISODate(new Date(), TIMEZONE)]) || 0;
}

export function progress(value, goal) {
  return Math.min(100, Math.round((value / Math.max(goal, 1)) * 100));
}

export function renderCompleted() {
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

export function prepCard(item) {
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

export function renderDsaWeek() {
  const dates = weekDates();
  const today = localISODate(new Date(), TIMEZONE);
  return `<div class="dsa-week">${dates.map((dateString) => {
    const label = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short" }).format(dateAtNoon(dateString));
    return `<div class="dsa-day ${dateString === today ? "is-today" : ""}"><span>${escapeHTML(label)}</span><strong>${Number(state.dsa[dateString]) || 0}</strong></div>`;
  }).join("")}</div>`;
}

export function renderPrep() {
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

export function applicationRow(application) {
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

export function rejectionRecords() {
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

export function renderCareer() {
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

export function renderHackathons() {
  const hackathons = section("hackathons");
  const etEvent = allEvents().find((event) => event.id === "et-ai-finale");
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
        <div class="section-heading"><div><span class="eyebrow">ET AI · ${escapeHTML(formatDate(etEvent?.start || "2026-08-25", { includeTime: false }))}</span><h3>Finale facts</h3></div><div class="heading-actions"><span class="status-pill status-confirmed">Confirmed</span>${etEvent ? eventEditButton(etEvent.id, "Edit") : ""}</div></div>
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

export function renderAcademics() {
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

export function renderTravel() {
  const travel = openTasks().filter((task) => task.area === "Travel");
  const events = allEvents().filter((event) => event.area === "Travel");
  const waiting = section("waiting_for").filter((item) => item.area === "Travel");
  return `<section class="view">
    <div class="page-intro"><div><span class="eyebrow">Travel only</span><h2>Every trip is a short chain of decisions.</h2><p>Transport, accommodation, packing, and the return journey live here—separate from your coordinator work.</p></div></div>
    <div class="content-grid">
      <article class="card card-pad span-8"><div class="section-heading"><div><span class="eyebrow">Open logistics</span><h3>Travel chain</h3></div><span class="count-badge">${travel.length}</span></div><div class="task-list">${travel.length ? travel.map((task) => taskRow(task, { showArea: false })).join("") : `<div class="empty-state"><strong>No open travel actions.</strong><p>Add the next trip when its dates are known.</p></div>`}</div></article>
      <article class="card card-pad span-4"><div class="section-heading"><div><span class="eyebrow">Known itinerary</span><h3>Travel events</h3></div></div><div class="timeline-list">${events.length ? events.map((event) => `<div class="timeline-item timeline-editable"><span class="timeline-mark"></span><div class="timeline-copy"><strong>${escapeHTML(event.event)}</strong><p>${escapeHTML(formatDate(event.start, { weekday: true }))} · ${escapeHTML(event.location || "Location needed")}</p>${eventEditButton(event.id, "Edit")}</div></div>`).join("") : `<div class="empty-state"><strong>No journey recorded.</strong><p>Tell Codex when a trip is confirmed.</p></div>`}</div></article>
      <article class="card card-pad span-12"><div class="section-heading"><div><span class="eyebrow">Before booking</span><h3>Missing travel details</h3></div></div><div class="strip-grid">${waiting.length ? waiting.map((item) => `<div class="mini-card"><span class="area-pill">Needed</span><h3>${escapeHTML(item.missing_information)}</h3><p>${escapeHTML(item.why_it_matters)}</p></div>`).join("") : `<div class="empty-state"><strong>Nothing is blocking a booking.</strong></div>`}</div></article>
    </div>
  </section>`;
}

export function renderGoldenJubilee() {
  const tasks = openTasks().filter((task) => ["Golden Jubilee", "Leadership"].includes(task.area));
  return `<section class="view">
    <div class="page-intro"><div><span class="eyebrow">Overall coordinator</span><h2>Golden Jubilee has its own command board.</h2><p>Decisions, owners, follow-ups, and deadlines stay here. Travel is tracked separately.</p></div></div>
    <div class="content-grid">
      <article class="card card-pad span-8"><div class="section-heading"><div><span class="eyebrow">Coordinator queue</span><h3>Open Golden Jubilee actions</h3></div><span class="count-badge">${tasks.length}</span></div><div class="task-list">${tasks.length ? tasks.map((task) => taskRow(task, { showArea: false })).join("") : `<div class="empty-state"><strong>The coordinator queue is clear.</strong><p>Tell Codex the next decision, owner, or deadline when it arrives.</p></div>`}</div></article>
      <article class="card card-pad span-4"><div class="section-heading"><div><span class="eyebrow">No manual entry</span><h3>Just tell Codex</h3></div></div><p class="quiet-note">Open this folder in Codex and speak naturally. For example:</p><div class="intent-example">Golden Jubilee: vendor quotes are due Friday. Ask Riya for the stage estimate by Wednesday, then publish.</div><p class="quiet-note">Codex will split that into concrete tasks, update MANAGER.md, test it, and publish the site.</p></article>
    </div>
  </section>`;
}

export function localChangeCount() {
  return taskStatusChanges().length
    + scheduleOverrideCount()
    + Object.keys(state.applicationStatuses).length
    + state.localItems.length
    + state.applications.length
    + state.inbox.length
    + Object.keys(state.dsa).length;
}

export function renderInbox() {
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
          <div class="info-row"><dt>Changes made here</dt><dd><strong>Local.</strong> Check-offs, Now ordering, date/time edits, and DSA counts stay in the browser or Dock app where you made them.</dd></div>
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

export function renderMore() {
  const links = [
    ["completed", "Completed", "Everything you have finished"],
    ["prep", "Prep", "Interview and ML preparation"],
    ["hackathons", "Hackathons", "Deadlines, finals, and travel"],
    ["academics", "Academics", "Courses, quizzes, and presentations"],
    ["travel", "Travel", "Journeys and logistics"],
    ["golden", "Golden Jubilee", "Your coordinator board"],
    ["inbox", "Inbox & sync", "Notes, export, and publishing"],
  ];
  return `
    <section class="panel">
      <div class="section-heading"><div><span class="eyebrow">More</span><h2>Other views</h2></div></div>
      <div class="card-grid">
        ${links.map(([view, title, blurb]) => `
          <button class="card card-pad more-link" type="button" data-nav="${view}">
            <strong>${escapeHTML(title)}</strong>
            <p>${escapeHTML(blurb)}</p>
          </button>`).join("")}
      </div>
    </section>`;
}

export function codexUpdateMarkdown() {
  const completed = allTasks().filter((task) => state.completed[task.id] === true && !sourceTaskDone(task));
  const reopened = allTasks().filter((task) => state.completed[task.id] === false && sourceTaskDone(task));
  const statusChanges = allApplications().filter((application) => state.applicationStatuses[application.id]);
  const dsaEntries = Object.entries(state.dsa).filter(([, count]) => Number(count) > 0).sort(([a], [b]) => a.localeCompare(b));
  const taskScheduleChanges = Object.entries(state.overrides.tasks).map(([taskId, override]) => {
    const task = sourceTasks().find((item) => item.id === taskId);
    return `- Task: ${task?.task || taskId} (${taskId}) — due ${override.due}`;
  });
  const eventScheduleChanges = Object.entries(state.overrides.events).map(([eventId, override]) => {
    const event = section("events").find((item) => item.id === eventId);
    return `- Event: ${event?.event || eventId} (${eventId}) — start ${override.start}; end ${override.end}`;
  });
  const scheduleChanges = [...taskScheduleChanges, ...eventScheduleChanges];
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
    "## Date and time changes",
    "",
    ...(scheduleChanges.length ? scheduleChanges : ["- None recorded"]),
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

export function escapeICS(value = "") {
  return String(value).replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll("\n", "\\n");
}

export function icsDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { value: value.replaceAll("-", ""), allDay: true };
  const date = managerDate(value);
  if (!date) return null;
  return { value: date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""), allDay: false };
}

export function calendarICS() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const entries = [];
  for (const event of allEvents()) {
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
