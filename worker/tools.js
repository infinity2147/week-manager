import { OPERATIONS } from "../lib/manager-edit.js";

const STRING = { type: "STRING" };

const TASK_FIELDS = {
  task: { type: "STRING", description: "The task title." },
  area: { type: "STRING", description: "Career, Hackathon, Prep, Academics, Travel, Golden Jubilee, Project, Skill, Planning, or Personal." },
  due: { type: "STRING", description: "ISO date, or ISO datetime with the +05:30 offset. Empty when no deadline is known." },
  priority: { type: "STRING", description: "P0 for a real deadline or high-cost miss, P1 for important progress, P2 for movable work." },
  status: { type: "STRING", description: "Open or Done." },
  estimate: STRING,
  next_action: { type: "STRING", description: "The smallest concrete next step. Every task needs one." },
  link: { type: "STRING", description: "An https:// URL, or empty." },
  notes: { type: "STRING", description: "Label any inferred or self-imposed date here as an assumption." },
};

const EVENT_FIELDS = {
  event: STRING,
  area: STRING,
  start: { type: "STRING", description: "ISO date or datetime with the +05:30 offset." },
  end: { type: "STRING", description: "ISO date or datetime. Same as start for a point in time." },
  status: { type: "STRING", description: "Confirmed, Tentative, Recurring, Finalist, or Interested." },
  location: STRING,
  link: STRING,
  notes: STRING,
};

const APPLICATION_FIELDS = {
  company: STRING,
  role: STRING,
  status: { type: "STRING", description: "Interested, Applied, Challenge, Interview, Offer, Rejected, or Withdrawn." },
  applied_on: STRING,
  next_action: STRING,
  follow_up: STRING,
  link: STRING,
  notes: STRING,
};

const REJECTION_FIELDS = {
  company: STRING,
  role: STRING,
  rejected_on: STRING,
  stage: { type: "STRING", description: "The stage reached, e.g. Application, Challenge, Interview." },
  reason_or_signal: { type: "STRING", description: "What was actually observed. Never invent a reason." },
  recovery_action: STRING,
  reapply_after: STRING,
  notes: STRING,
};

const WAITING_FIELDS = {
  missing_information: STRING,
  area: STRING,
  why_it_matters: STRING,
  next_check: STRING,
};

function fieldsTool(name, description, properties, required) {
  return {
    name,
    description,
    parameters: { type: "OBJECT", properties: { fields: { type: "OBJECT", properties } }, required: required ?? ["fields"] },
  };
}

function updateTool(name, description, properties) {
  return {
    name,
    description,
    parameters: {
      type: "OBJECT",
      properties: { id: { type: "STRING", description: "The existing row's ID." }, fields: { type: "OBJECT", properties } },
      required: ["id", "fields"],
    },
  };
}

export const TOOLS = [
  {
    name: "list_items",
    description: "Read the plan. Use for filtered or counted questions, e.g. how many Academics tasks are still open. The whole plan is already in context, so simple lookups need no tool call.",
    parameters: {
      type: "OBJECT",
      properties: {
        kind: { type: "STRING", description: "tasks, events, applications, hackathons, or waiting_for." },
        area: STRING,
        status: STRING,
        from: { type: "STRING", description: "Inclusive ISO start date." },
        to: { type: "STRING", description: "Inclusive ISO end date." },
      },
      required: ["kind"],
    },
  },
  fieldsTool("add_task", "Add a new task. Every task needs a concrete next_action.", TASK_FIELDS),
  updateTool("update_task", "Change fields on an existing task, including moving its deadline.", TASK_FIELDS),
  {
    name: "complete_task",
    description: "Mark a task done, or reopen it.",
    parameters: {
      type: "OBJECT",
      properties: { id: STRING, done: { type: "BOOLEAN" } },
      required: ["id", "done"],
    },
  },
  { name: "delete_task", description: "Remove a task that should never have existed. Prefer complete_task for finished work.", parameters: { type: "OBJECT", properties: { id: STRING }, required: ["id"] } },
  fieldsTool("add_event", "Add a calendar event, deadline moment, or scheduled commitment.", EVENT_FIELDS),
  updateTool("update_event", "Change an existing event's schedule or details.", EVENT_FIELDS),
  { name: "delete_event", description: "Remove an event that is no longer happening.", parameters: { type: "OBJECT", properties: { id: STRING }, required: ["id"] } },
  fieldsTool("add_application", "Log a submitted job application.", APPLICATION_FIELDS),
  updateTool("update_application", "Change an application's status or details.", APPLICATION_FIELDS),
  {
    name: "record_rejection",
    description: "Record a rejection. This also flips the application's status. Never invent a reason: record only what was actually observed.",
    parameters: {
      type: "OBJECT",
      properties: { applicationId: { type: "STRING", description: "The ID of the application being rejected." }, fields: { type: "OBJECT", properties: REJECTION_FIELDS } },
      required: ["applicationId", "fields"],
    },
  },
  fieldsTool("add_waiting_for", "Record a missing detail rather than inventing it.", WAITING_FIELDS),
];

const TOOL_TO_OPERATION = {
  add_task: "addTask",
  update_task: "updateTask",
  complete_task: "completeTask",
  delete_task: "deleteTask",
  add_event: "addEvent",
  update_event: "updateEvent",
  delete_event: "deleteEvent",
  add_application: "addApplication",
  update_application: "updateApplication",
  record_rejection: "recordRejection",
  add_waiting_for: "addWaitingFor",
};

export const READ_ONLY_TOOLS = new Set(["list_items"]);

/** Every mutating tool must map to an operation the mutation layer actually has. */
export function toolToOperation(name, args = {}) {
  const op = TOOL_TO_OPERATION[name];
  if (!op) return null;
  if (!OPERATIONS.includes(op)) throw new Error(`Tool ${name} maps to unknown operation ${op}`);
  return { op, ...args };
}

export function toolNames() {
  return TOOLS.map((tool) => tool.name);
}
