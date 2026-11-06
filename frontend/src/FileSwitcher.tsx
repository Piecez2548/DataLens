import { t, tf, tStatus } from "./i18n";
import type { BatchRow } from "./BatchResults";

// Files that were checked together stay one click apart in the workspace.
export default function FileSwitcher({
  files,
  current,
  busy,
  onPick,
  onOverview,
}: {
  files: BatchRow[];
  current: File | null;
  busy: boolean;
  onPick: (file: File) => void;
  onOverview: () => void;
}) {
  if (files.length < 2) return null;
  const index = files.findIndex((row) => row.file === current);
  const next = files.slice(index + 1).find((row) => !row.error);
  const ready = files.filter((row) => row.status === "Ready for exploration").length;
  return (
    <nav className="file-switcher" aria-label={t("Files checked together")}>
      <span className="file-switcher-label">{t("Files")}</span>
      <span className="file-switcher-ready" role="status">
        {tf("{ready} of {total} files ready to send", { ready, total: files.length })}
      </span>
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
      <span className="file-switcher-nav">
        <button className="text-button" disabled={busy} onClick={onOverview}>{t("All files overview")}</button>
        {next && (
          <button className="primary" disabled={busy} onClick={() => onPick(next.file)}>{t("Next file")} →</button>
        )}
      </span>
    </nav>
  );
}
