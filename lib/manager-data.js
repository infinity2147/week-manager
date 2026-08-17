const TABLE_SEPARATOR = /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/;

function slug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[&/]+/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function splitMarkdownRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let current = "";
  let escaped = false;

  for (const character of trimmed) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseMetadata(markdown) {
  const metadata = {};
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^-\s+([^:]+):\s*(.+)$/);
    if (!match) continue;
    metadata[slug(match[1])] = match[2].trim();
  }
  return metadata;
}

export function parseManagerMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sections = {};
  let currentSection = "";

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^##\s+(.+)$/);
    if (heading) {
      currentSection = slug(heading[1]);
      if (!sections[currentSection]) sections[currentSection] = [];
      continue;
    }

    if (!currentSection || !lines[index].trim().startsWith("|")) continue;
    if (!lines[index + 1] || !TABLE_SEPARATOR.test(lines[index + 1])) continue;

    const headers = splitMarkdownRow(lines[index]).map(slug);
    index += 2;

    while (index < lines.length && lines[index].trim().startsWith("|")) {
      const values = splitMarkdownRow(lines[index]);
      const record = {};
      headers.forEach((header, cellIndex) => {
        record[header] = values[cellIndex] ?? "";
      });
      if (Object.values(record).some(Boolean)) sections[currentSection].push(record);
      index += 1;
    }

    index -= 1;
  }

  return { metadata: parseMetadata(markdown), sections };
}

export function managerDate(value) {
  if (!value || /not |exact |weekly|applied|closed|unknown/i.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function localISODate(date = new Date(), timezone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function startOfLocalWeek(date = new Date(), timezone = "Asia/Kolkata") {
  const dateString = localISODate(date, timezone);
  const localNoon = new Date(`${dateString}T12:00:00+05:30`);
  const weekday = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" })
      .formatToParts(localNoon)
      .find((part) => part.type === "weekday")
      ?.value
      .replace(/Sun/, "0")
      .replace(/Mon/, "1")
      .replace(/Tue/, "2")
      .replace(/Wed/, "3")
      .replace(/Thu/, "4")
      .replace(/Fri/, "5")
      .replace(/Sat/, "6") ?? 0,
  );
  const offset = weekday === 0 ? 6 : weekday - 1;
  localNoon.setDate(localNoon.getDate() - offset);
  return localISODate(localNoon, timezone);
}
