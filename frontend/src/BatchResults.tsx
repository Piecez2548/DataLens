import { t, tf, tStatus } from "./i18n";
import { downloadBatchCsv } from "./report";

export type BatchRow = { file: File; status?: string; rows?: number; issues?: number; top?: string; error?: string };

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const tone = (status?: string) => (status === "Action required" ? "danger" : status === "Review needed" ? "review" : "ok");

// Several files checked together: one card per file, the ones with the most to fix first, each with a clear next step.
export default function BatchResults({
  rows,
  busy,
  onOpen,
  onClose,
}: {
  rows: BatchRow[];
  busy: boolean;
  onOpen: (file: File) => void;
  onClose: () => void;
}) {
  const waiting = rows.filter((row) => row.status === undefined && !row.error).length;
  const needReview = rows.filter((row) => row.status !== undefined && row.status !== "Ready for exploration").length;
  const ordered = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (b.row.issues ?? -1) - (a.row.issues ?? -1) || a.index - b.index);
  return (
    <section className="batch" aria-labelledby="batch-title">
      <div className="batch-head">
        <div>
          <span className="eyebrow">{t("Files checked together")}</span>
          <h1 id="batch-title">{tf("Checked {count} files", { count: rows.length })}</h1>
          <p>
            {waiting > 0
              ? t("Checking the remaining files…")
              : needReview > 0
                ? tf("{count} file(s) need a look before you send them. Open one to see what to fix.", { count: needReview })
                : t("All files look ready to send.")}
          </p>
        </div>
        <div className="batch-actions">
          <button disabled={waiting > 0} onClick={() => downloadBatchCsv(rows)}>{t("Export summary of all files (CSV)")}</button>
          <button onClick={onClose}>{t("Check a new set")}</button>
        </div>
      </div>
      <ul className="batch-list" role="status" aria-live="polite">
        {ordered.map(({ row, index }) => (
          <li key={`${row.file.name}-${index}`} className={`batch-card ${row.error ? "danger" : tone(row.status)}`}>
            <div className="batch-main">
              <strong className="batch-name">{row.file.name}</strong>
              {row.error ? (
                <p className="batch-finding">{row.error}</p>
              ) : row.status === undefined ? (
                <p className="batch-finding">{t("Waiting…")}</p>
              ) : (
                <>
                  <span className={`batch-status ${tone(row.status)}`}>{tStatus(row.status)}</span>
                  <p className="batch-finding">{row.top ?? t("No main finding")}</p>
                  <small>
                    {tf("{rows} rows", { rows: fmt(row.rows ?? 0) })} · {tf("{count} items to review", { count: fmt(row.issues ?? 0) })}
                  </small>
                </>
              )}
            </div>
            <button className="primary" disabled={busy || Boolean(row.error) || row.status === undefined} onClick={() => onOpen(row.file)}>
              {t("See details")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
