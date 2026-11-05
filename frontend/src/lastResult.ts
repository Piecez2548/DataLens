import type { Analysis } from "./types";

// Keeps only the totals of the previous check for a file name (never any cell values), so next month's file
// can be compared with it. It stays in this browser; nothing is sent or stored on the server.
const STORAGE_KEY = "datalens.last";
const MAX_ENTRIES = 20;
export type LastResult = { saved_at: string; analysis: Analysis };

const keyOf = (filename: string) => filename.trim().toLowerCase().replace(/\d+/g, "#");

function readAll(): Record<string, LastResult> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function loadLastResult(filename: string): LastResult | null {
  return readAll()[keyOf(filename)] ?? null;
}

export function saveLastResult(filename: string, analysis: Analysis) {
  const kinds: Analysis["issue_samples"]["kinds"] = {};
  for (const [kind, entry] of Object.entries(analysis.issue_samples.kinds)) {
    kinds[kind] = { total: entry.total, examples: [] };
  }
  const lite = {
    filename: analysis.filename,
    rows: analysis.rows,
    column_count: analysis.column_count,
    missing: analysis.missing,
    duplicates: analysis.duplicates,
    scores: analysis.scores,
    executive: { status: analysis.executive.status, issue_count: analysis.executive.issue_count },
    issue_samples: { kinds },
    provenance: { sha256: analysis.provenance.sha256 },
    columns: analysis.columns.map((c) => ({ name: c.name, type: c.type, missing: c.missing, invalid: c.invalid, unique: c.unique })),
  } as unknown as Analysis;
  const all = readAll();
  const key = keyOf(filename);
  delete all[key];
  all[key] = { saved_at: new Date().toISOString(), analysis: lite };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(Object.entries(all).slice(-MAX_ENTRIES))));
  } catch {
    /* comparison with last time is then simply unavailable */
  }
}
