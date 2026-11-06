import { t, tStatus } from "./i18n";
import type { BatchRow } from "./BatchResults";

// Files that were checked together stay one click apart in the workspace.
export default function FileSwitcher({
  files,
  current,
  busy,
  onPick,
}: {
  files: BatchRow[];
  current: File | null;
  busy: boolean;
  onPick: (file: File) => void;
}) {
  if (files.length < 2) return null;
  return (
    <nav className="file-switcher" aria-label={t("Files checked together")}>
      <span className="file-switcher-label">{t("Files")}</span>
      {files.map((row, index) => {
        const active = row.file === current;
        return (
          <button
            key={`${row.file.name}-${index}`}
            className={active ? "chip on" : "chip"}
            aria-current={active ? "true" : undefined}
            disabled={busy || Boolean(row.error)}
            onClick={() => !active && onPick(row.file)}
            title={row.error ?? undefined}
          >
            <span className="file-name">{row.file.name}</span>
            <span className="chip-count">{row.error ? "!" : row.status ? tStatus(row.status) : "…"}</span>
          </button>
        );
      })}
    </nav>
  );
}
