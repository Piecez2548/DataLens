import type { Analysis, FollowUp, FollowUps, SheetSummary } from "./types";

// A snapshot is the finished analysis saved as a file, so it can be passed on without storing anything on the server.
const KIND = "datalens.snapshot";
const VERSION = 1;
const MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024;

export type Snapshot = {
  kind: typeof KIND;
  version: typeof VERSION;
  saved_at: string;
  analysis: Analysis;
  follow_ups: FollowUps;
  sheet_overview: SheetSummary[];
};

export const isSnapshotName = (name: string) => /\.datalens\.json$/i.test(name);

export function buildSnapshot(
  analysis: Analysis,
  followUps: FollowUps,
  sheetOverview: SheetSummary[],
): Snapshot {
  return {
    kind: KIND,
    version: VERSION,
    saved_at: new Date().toISOString(),
    analysis,
    follow_ups: followUps,
    sheet_overview: sheetOverview,
  };
}

export function downloadSnapshot(snapshot: Snapshot) {
  const base =
    snapshot.analysis.filename.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") ||
    "dataset";
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(snapshot)], { type: "application/json;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${base}.datalens.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

/** Reads a snapshot file. The content is untrusted, so only the shape the app needs is accepted and text is trimmed. */
export function parseSnapshot(raw: string): Snapshot {
  if (raw.length > MAX_SNAPSHOT_BYTES) throw new Error("This snapshot file is too large.");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("This is not a DataLens snapshot file.");
  }
  if (!isObject(value) || value.kind !== KIND) throw new Error("This is not a DataLens snapshot file.");
  if (value.version !== VERSION) throw new Error("This snapshot was made by a different version of DataLens.");
  const a = value.analysis;
  if (
    !isObject(a) ||
    typeof a.filename !== "string" ||
    !Array.isArray(a.columns) ||
    !a.columns.length ||
    !a.columns.every((c) => isObject(c) && typeof c.name === "string") ||
    !isObject(a.issue_samples) ||
    !isObject(a.issue_samples.kinds) ||
    !isObject(a.executive) ||
    !Array.isArray(a.executive.issues) ||
    !isObject(a.executive.thai) ||
    !isObject(a.scores) ||
    !isObject(a.provenance) ||
    !isObject(a.business_rules) ||
    !Array.isArray(a.business_rules.results)
  ) {
    throw new Error("This snapshot is damaged or incomplete.");
  }
  const followUps: FollowUps = {};
  if (isObject(value.follow_ups)) {
    for (const [kind, entry] of Object.entries(value.follow_ups).slice(0, 20)) {
      if (!isObject(entry)) continue;
      const item: FollowUp = { owner: text(entry.owner, 80), due: text(entry.due, 10), note: text(entry.note, 500) };
      if (item.owner || item.due || item.note) followUps[kind] = item;
    }
  }
  const sheets = Array.isArray(value.sheet_overview)
    ? value.sheet_overview.filter(isObject).slice(0, 12).map(
        (item): SheetSummary => ({
          sheet: text(item.sheet, 64),
          rows: Number(item.rows) || 0,
          columns: Number(item.columns) || 0,
          status: text(item.status, 80),
          issues: Number(item.issues) || 0,
          scores: isObject(item.scores)
            ? Object.fromEntries(
                Object.entries(item.scores).map(([k, v]) => [k, typeof v === "number" ? v : null]),
              )
            : {},
          error: item.error ? text(item.error, 200) : undefined,
        }),
      )
    : [];
  return {
    kind: KIND,
    version: VERSION,
    saved_at: text(value.saved_at, 40),
    analysis: a as unknown as Analysis,
    follow_ups: followUps,
    sheet_overview: sheets,
  };
}
