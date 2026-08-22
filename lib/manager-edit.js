import { slug, splitMarkdownRow, TABLE_SEPARATOR } from "./manager-data.js";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function findTable(markdown, sectionSlug) {
  const lines = markdown.split("\n");
  let current = "";

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^##\s+(.+)$/);
    if (heading) {
      current = slug(heading[1]);
      continue;
    }
    if (current !== sectionSlug) continue;
    if (!lines[index].trim().startsWith("|")) continue;
    if (!lines[index + 1] || !TABLE_SEPARATOR.test(lines[index + 1])) continue;

    const headers = splitMarkdownRow(lines[index]);
    let endRow = index + 2;
    while (endRow < lines.length && lines[endRow].trim().startsWith("|")) endRow += 1;

    return {
      headerIndex: index,
      separatorIndex: index + 1,
      firstRow: index + 2,
      endRow,
      headers,
      keys: headers.map(slug),
    };
  }

  return null;
}

export function readRows(markdown, sectionSlug) {
  const table = findTable(markdown, sectionSlug);
  if (!table) return [];
  return markdown
    .split("\n")
    .slice(table.firstRow, table.endRow)
    .map((line) => {
      const values = splitMarkdownRow(line);
      return Object.fromEntries(table.keys.map((key, index) => [key, values[index] ?? ""]));
    });
}

export function escapeCell(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

export function renderRow(keys, record) {
  return `| ${keys.map((key) => escapeCell(record[key])).join(" | ")} |`;
}

export function replaceRows(markdown, sectionSlug, rows) {
  const table = findTable(markdown, sectionSlug);
  if (!table) throw new Error(`MANAGER.md has no table for section: ${sectionSlug}`);
  const lines = markdown.split("\n");
  const rendered = rows.map((row) => renderRow(table.keys, row));
  lines.splice(table.firstRow, table.endRow - table.firstRow, ...rendered);
  return lines.join("\n");
}

const SECTION_FOR = {
  addTask: "tasks",
  updateTask: "tasks",
  completeTask: "tasks",
  deleteTask: "tasks",
  addEvent: "events",
  updateEvent: "events",
  deleteEvent: "events",
  addApplication: "applications",
  updateApplication: "applications",
  recordRejection: "rejections",
  addWaitingFor: "waiting_for",
};

export const OPERATIONS = Object.keys(SECTION_FOR);

export function validateOperation(operation) {
  if (!operation || typeof operation !== "object") throw new Error("An operation must be an object.");
  if (!OPERATIONS.includes(operation.op)) throw new Error(`Unknown operation: ${operation.op}`);
  return operation;
}

export function slugId(text, taken) {
  const base = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "") || "item";
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function assertKnownFields(table, fields, section) {
  if (!fields || typeof fields !== "object") throw new Error(`An operation on ${section} needs a fields object.`);
  const unknown = Object.keys(fields).filter((key) => !table.keys.includes(key));
  if (unknown.length) throw new Error(`Unknown ${section} field(s): ${unknown.join(", ")}`);
}

function addRow(markdown, section, fields) {
  const table = findTable(markdown, section);
  if (!table) throw new Error(`MANAGER.md has no table for section: ${section}`);
  assertKnownFields(table, fields, section);
  const rows = readRows(markdown, section);
  const taken = new Set(rows.map((row) => row.id));
  const title = String(fields[table.keys[1]] ?? "").trim();
  if (!fields.id && !title) throw new Error(`A new ${section} row needs a "${table.keys[1]}" value, or an explicit id.`);
  const id = fields.id || slugId(title, taken);
  if (!ID_PATTERN.test(id)) throw new Error(`An ID must be lowercase words separated by hyphens, received: ${id}`);
  if (taken.has(id)) throw new Error(`${section} already contains ID ${id}`);
  const blank = Object.fromEntries(table.keys.map((key) => [key, ""]));
  return replaceRows(markdown, section, [...rows, { ...blank, ...fields, id }]);
}

function updateRow(markdown, section, id, fields) {
  const table = findTable(markdown, section);
  if (!table) throw new Error(`MANAGER.md has no table for section: ${section}`);
  if ("id" in fields) throw new Error("An ID cannot be changed.");
  assertKnownFields(table, fields, section);
  const rows = readRows(markdown, section);
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new Error(`${section} has no row with ID ${id}`);
  rows[index] = { ...rows[index], ...fields };
  return replaceRows(markdown, section, rows);
}

function deleteRow(markdown, section, id) {
  const rows = readRows(markdown, section);
  if (!rows.some((row) => row.id === id)) throw new Error(`${section} has no row with ID ${id}`);
  return replaceRows(markdown, section, rows.filter((row) => row.id !== id));
}

const APPLY = {
  addTask: (markdown, op) => addRow(markdown, "tasks", op.fields),
  updateTask: (markdown, op) => updateRow(markdown, "tasks", op.id, op.fields),
  completeTask: (markdown, op) => updateRow(markdown, "tasks", op.id, { status: op.done ? "Done" : "Open" }),
  deleteTask: (markdown, op) => deleteRow(markdown, "tasks", op.id),
  addEvent: (markdown, op) => addRow(markdown, "events", op.fields),
  updateEvent: (markdown, op) => updateRow(markdown, "events", op.id, op.fields),
  deleteEvent: (markdown, op) => deleteRow(markdown, "events", op.id),
  addApplication: (markdown, op) => addRow(markdown, "applications", op.fields),
  updateApplication: (markdown, op) => updateRow(markdown, "applications", op.id, op.fields),
  recordRejection: (markdown, op) => {
    if (!op.applicationId) throw new Error("recordRejection needs an applicationId naming the application being rejected.");
    return addRow(
      updateRow(markdown, "applications", op.applicationId, { status: "Rejected" }),
      "rejections",
      op.fields,
    );
  },
  addWaitingFor: (markdown, op) => addRow(markdown, "waiting_for", op.fields),
};

function touchUpdated(markdown, today) {
  return markdown.replace(/^- Updated: .*$/m, `- Updated: ${today}`);
}

export function applyOperations(markdown, operations, { today }) {
  if (!today) throw new Error("applyOperations needs a today date in Asia/Kolkata.");
  let result = markdown;
  for (const operation of operations) {
    validateOperation(operation);
    result = APPLY[operation.op](result, operation);
  }
  return operations.length ? touchUpdated(result, today) : result;
}
