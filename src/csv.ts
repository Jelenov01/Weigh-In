import type { Entry } from "./db";

const HEADER = "date,weight_kg,note";

const quote = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function toCsv(entries: Entry[]): string {
  return [HEADER, ...entries.map((e) => `${e.date},${e.kg.toFixed(3)},${quote(e.note)}`)].join("\n") + "\n";
}

/** Parse RFC 4180-style CSV into rows of fields. */
function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Read entries from a CSV exported by this app. Throws with a readable message on bad input. */
export function fromCsv(text: string): Entry[] {
  const rows = parseRows(text.replace(/^﻿/, "")).filter((r) => r.some((f) => f.trim()));
  if (!rows.length || rows[0].join(",").trim().toLowerCase() !== HEADER) {
    throw new Error(`Expected a CSV with the header "${HEADER}", like the one Export CSV creates.`);
  }
  const now = Date.now();
  return rows.slice(1).map((r, i) => {
    const [date, kgStr, note = ""] = r;
    const kg = parseFloat(kgStr);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !(kg > 0)) {
      throw new Error(`Row ${i + 2} isn't a valid date and weight: "${r.join(",")}"`);
    }
    return { date, kg, note, at: now };
  });
}
