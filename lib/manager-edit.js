import { slug, splitMarkdownRow, TABLE_SEPARATOR } from "./manager-data.js";

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
