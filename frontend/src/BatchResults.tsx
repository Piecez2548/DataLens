import { t, tStatus } from "./i18n";

export type BatchRow = { file: File; status?: string; rows?: number; issues?: number; top?: string; error?: string };

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

// One line per file so several files can be checked before they are sent together. Opening a row runs the full check.
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
  return (
    <section className="panel sheet-overview" aria-labelledby="batch-title">
      <div className="section-title">
        <div>
          <h2 id="batch-title">{t("Files checked together")}</h2>
          <p className="muted">{t("Each file was checked on its own with the default settings. Open one to see its details.")}</p>
        </div>
        <button className="text-button" onClick={onClose}>{t("Close")}</button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("File")}</th>
              <th>{t("Rows")}</th>
              <th>{t("Status")}</th>
              <th>{t("Items to review")}</th>
              <th>{t("Main finding")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.file.name}-${index}`}>
                <td>{row.file.name}</td>
                {row.error ? (
                  <td colSpan={4} className="missing">{row.error}</td>
                ) : row.status === undefined ? (
                  <td colSpan={4}>{t("Waiting…")}</td>
                ) : (
                  <>
                    <td>{fmt(row.rows ?? 0)}</td>
                    <td>{tStatus(row.status)}</td>
                    <td>{fmt(row.issues ?? 0)}</td>
                    <td>{row.top ?? "—"}</td>
                  </>
                )}
                <td>
                  <button className="text-button" disabled={busy || Boolean(row.error)} onClick={() => onOpen(row.file)}>
                    {t("Open")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {waiting > 0 && <p className="muted" role="status">{t("Checking the remaining files…")}</p>}
    </section>
  );
}
