// Remembers the choices a person made for a file name (header row, business key, date order…) in this browser only,
// so the monthly report does not have to be set up again. Nothing from the file itself is stored.
export type SavedSettings = {
  header_row?: number;
  date_order?: "dmy" | "mdy";
  year_era?: "be" | "ce";
  business_key?: string[];
  missing_markers?: string[];
  sheet?: string;
  group_by?: { by: string; measure?: string };
  ignored_warnings?: string[];
};

const STORAGE_KEY = "datalens.settings";
const MAX_ENTRIES = 30;
const exactKey = (filename: string) => filename.trim().toLowerCase();
// A monthly file is renamed every month (sales-2569-01.csv, sales-2569-02.csv), so digits are ignored in the key.
const keyOf = (filename: string) => exactKey(filename).replace(/\d+/g, "#");

function readAll(): Record<string, SavedSettings> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, SavedSettings>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* settings then last for this visit only */
  }
}

export function loadSettings(filename: string): SavedSettings | null {
  const all = readAll();
  const entry = all[keyOf(filename)] ?? all[exactKey(filename)];
  return entry && Object.keys(entry).length ? entry : null;
}

export function saveSettings(filename: string, settings: SavedSettings) {
  const all = readAll();
  const key = keyOf(filename);
  delete all[key];
  delete all[exactKey(filename)];
  if (Object.keys(settings).length) all[key] = settings;
  // Most recently saved last; drop the oldest beyond the limit.
  const entries = Object.entries(all).slice(-MAX_ENTRIES);
  writeAll(Object.fromEntries(entries));
}

export const forgetSettings = (filename: string) => saveSettings(filename, {});
