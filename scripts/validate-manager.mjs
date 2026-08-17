import { readFile } from "node:fs/promises";
import { parseManagerMarkdown } from "../lib/manager-data.js";

const markdown = await readFile(new URL("../MANAGER.md", import.meta.url), "utf8");
const data = parseManagerMarkdown(markdown);
const requiredSections = ["tasks", "events", "applications", "rejections", "hackathons", "recurring", "interview_and_ml_prep", "weekly_rhythm", "waiting_for"];
const errors = [];

for (const name of requiredSections) {
  if (!data.sections[name]) errors.push(`Missing section: ${name}`);
}

for (const field of ["updated", "timezone", "current_week", "application_goal", "dsa_daily_goal"]) {
  if (!data.metadata[field]) errors.push(`Missing metadata: ${field}`);
}

for (const [name, rows] of Object.entries(data.sections)) {
  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    if (!row.id) errors.push(`${name} row ${index + 1} has no ID`);
    if (seen.has(row.id)) errors.push(`${name} contains duplicate ID: ${row.id}`);
    seen.add(row.id);
    for (const [field, value] of Object.entries(row)) {
      if (field === "link" && value && !/^https:\/\//.test(value)) errors.push(`${name}/${row.id} link is not HTTPS`);
    }
  }
}

for (const task of data.sections.tasks || []) {
  if (!new Set(["P0", "P1", "P2"]).has(task.priority)) errors.push(`Task ${task.id} has invalid priority ${task.priority}`);
  if (!task.next_action) errors.push(`Task ${task.id} has no next action`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  const counts = requiredSections.map((name) => `${name}:${data.sections[name].length}`).join(" · ");
  console.log(`MANAGER.md is valid · ${counts}`);
}
