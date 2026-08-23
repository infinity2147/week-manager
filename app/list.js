import { BAND_LABELS, rankForMove } from "../lib/manager-order.js";
import { openListItems, setRank, saveState, state } from "./store.js";
import { escapeHTML, formatDate, dueInfo, id } from "./format.js";

const BAND_ORDER = ["overdue", "today", "week", "later"];

function itemMeta(item) {
  if (item.kind === "event") {
    const start = formatDate(item.when, { includeTime: true, weekday: true });
    const end = item.source.end && item.source.end !== item.when
      ? ` – ${formatDate(item.source.end, { includeTime: true })}`
      : "";
    return `<span class="list-due">${escapeHTML(start)}${escapeHTML(end)}</span>`;
  }
  const due = dueInfo(item.when);
  return `<span class="list-due ${item.band === "overdue" ? "is-overdue" : ""}">${escapeHTML(due.label)}</span>`;
}

function listRow(item, index, total) {
  const priority = item.priority ? `<span class="list-priority">${escapeHTML(item.priority)}</span>` : "";
  const lead = item.kind === "task"
    ? `<button class="list-check" type="button" data-task-id="${id(item.id)}" aria-label="Mark ${escapeHTML(item.title)} complete"></button>`
    : `<span class="list-mark" aria-hidden="true">▦</span>`;
  const edited = item.schedule_local || item.source.schedule_local
    ? `<span class="local-edit-note">Edited here</span>`
    : "";

  return `
    <li class="list-row band-${item.band}" draggable="true"
        data-list-id="${id(item.id)}" data-list-kind="${item.kind}" data-list-index="${index}" tabindex="0"
        aria-label="${escapeHTML(BAND_LABELS[item.band])}: ${escapeHTML(item.title)}">
      ${lead}
      <button class="list-open" type="button" data-edit-${item.kind === "task" ? "task" : "event"}="${id(item.id)}">
        <span class="list-title">${escapeHTML(item.title)}</span>
        <span class="list-meta">${priority}<span class="list-area">${escapeHTML(item.area)}</span>${itemMeta(item)}${edited}</span>
      </button>
      <span class="list-move">
        <button class="icon-button" type="button" data-list-move="${id(item.id)}" data-direction="-1"
                ${index === 0 ? "disabled" : ""} aria-label="Move ${escapeHTML(item.title)} up">↑</button>
        <button class="icon-button" type="button" data-list-move="${id(item.id)}" data-direction="1"
                ${index === total - 1 ? "disabled" : ""} aria-label="Move ${escapeHTML(item.title)} down">↓</button>
      </span>
    </li>`;
}

export function renderList() {
  const items = openListItems();
  if (!items.length) {
    return `<section class="panel"><div class="empty-state"><strong>Nothing open.</strong><p>Every task is complete. Use “Add something” to capture the next one.</p></div></section>`;
  }

  const manual = Object.keys(state.ranks).length;
  let lastBand = "";
  const rows = items.map((item, index) => {
    const heading = item.band === lastBand
      ? ""
      : `<li class="list-band-heading band-${item.band}" role="presentation">${escapeHTML(BAND_LABELS[item.band])}</li>`;
    lastBand = item.band;
    return heading + listRow(item, index, items.length);
  }).join("");

  const counts = BAND_ORDER
    .map((band) => ({ band, count: items.filter((item) => item.band === band).length }))
    .filter((entry) => entry.count)
    .map((entry) => `<span class="band-count band-${entry.band}">${entry.count} ${escapeHTML(BAND_LABELS[entry.band].toLowerCase())}</span>`)
    .join("");

  return `
    <section class="panel">
      <div class="section-heading">
        <div><span class="eyebrow">Everything open</span><h2>${items.length} ${items.length === 1 ? "item" : "items"}</h2></div>
        <div class="heading-actions">${manual ? `<button class="button button-quiet" type="button" data-clear-ranks>Reset to automatic</button>` : ""}</div>
      </div>
      <div class="band-counts">${counts}</div>
      <ol class="list-rows" id="unified-list">${rows}</ol>
      <p class="quiet-note">Drag a row, or use ↑ ↓ or Alt+↑ / Alt+↓, to set your own order. Click any row to edit it.</p>
    </section>`;
}

export function moveItem(itemId, targetIndex) {
  const items = openListItems();
  if (!items.some((item) => item.id === itemId)) return false;
  const bounded = Math.max(0, Math.min(targetIndex, items.length - 1));
  setRank(itemId, rankForMove(items, itemId, bounded));
  saveState();
  return true;
}

let dragId = null;

function clearDropMarks(list) {
  for (const row of list.querySelectorAll(".is-dragging, .is-drop-target")) {
    row.classList.remove("is-dragging", "is-drop-target");
  }
}

export function attachListDrag(root) {
  const list = root.querySelector("#unified-list");
  if (!list) return;

  list.addEventListener("dragstart", (event) => {
    const row = event.target.closest("[data-list-id]");
    if (!row) return;
    dragId = row.dataset.listId;
    row.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dragId);
  });

  list.addEventListener("dragover", (event) => {
    const row = event.target.closest("[data-list-id]");
    if (!row || !dragId) return;
    event.preventDefault();
    for (const other of list.querySelectorAll(".is-drop-target")) other.classList.remove("is-drop-target");
    row.classList.add("is-drop-target");
  });

  list.addEventListener("drop", (event) => {
    const row = event.target.closest("[data-list-id]");
    if (!row || !dragId) return;
    event.preventDefault();
    const moved = dragId;
    dragId = null;
    clearDropMarks(list);
    moveItem(moved, Number(row.dataset.listIndex));
  });

  list.addEventListener("dragend", () => {
    dragId = null;
    clearDropMarks(list);
  });
}
