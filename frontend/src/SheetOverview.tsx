import { t, tf, tStatus } from "./i18n";
import type { SheetSummary } from "./types";

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function SheetOverview({
  sheets,
  current,
  busy,
  canOpen,
  onOpen,
}: {
  sheets: SheetSummary[];
  current: string;
  busy: boolean;
  canOpen: boolean;
  onOpen: (sheet: string) => void;
}) {
  return (
    <section className="panel sheet-overview">
      <h2>{t("All sheets")}</h2>
      <p className="muted">{t("Each sheet was analyzed on its own with the same settings. Open one to see its details.")}</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Worksheet")}</th>
              <th>{t("Rows")}</th>
              <th>{t("Columns")}</th>
              <th>{t("Status")}</th>
              <th>{t("Items to review")}</th>
              <th>{t("Quality scorecard")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sheets.map((item) => (
              <tr key={item.sheet}>
                <td>{item.sheet}</td>
                {item.error ? (
                  <td colSpan={5} className="missing">{item.error}</td>
                ) : (
                  <>
                    <td>{fmt(item.rows)}</td>
                    <td>{fmt(item.columns)}</td>
                    <td>{tStatus(item.status)}</td>
                    <td>{fmt(item.issues)}</td>
                    <td>
                      {Object.entries(item.scores)
                        .map(([label, score]) => `${t(label)} ${score === null ? "N/A" : `${fmt(score)}%`}`)
                        .join(" · ")}
                    </td>
                  </>
                )}
                <td>
                  {item.sheet === current ? (
                    <small>{t("Shown below")}</small>
                  ) : (
                    <button
                      className="text-button"
                      disabled={busy || !canOpen || Boolean(item.error)}
                      aria-label={tf("Open sheet {sheet}", { sheet: item.sheet })}
                      onClick={() => onOpen(item.sheet)}
                    >
                      {t("Open")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
