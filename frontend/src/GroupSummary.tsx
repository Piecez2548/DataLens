import { t } from "./i18n";
import { Download } from "lucide-react";
import type { Analysis } from "./types";

const fmt = (n: number | null) =>
  n === null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const quote = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
};

export default function GroupSummary({
  data,
  by,
  measure,
  busy,
  onChange,
  onApply,
}: {
  data: Analysis;
  by: string;
  measure: string;
  busy: boolean;
  onChange: (by: string, measure: string) => void;
  onApply: () => void;
}) {
  const summary = data.group_summary;
  const numericColumns = data.columns.filter((c) => c.type === "numeric");
  const groupable = data.columns.filter(
    (c) => c.type !== "numeric" || c.unique <= 50,
  );
  const biggest = Math.max(
    1,
    ...(summary?.rows ?? []).map((row) =>
      Math.abs(summary?.measure ? (row.sum ?? 0) : row.rows),
    ),
  );
  function exportCsv() {
    if (!summary) return;
    const lines = [
      [summary.by, "rows", "sum", "mean", "min", "max"].join(","),
      ...summary.rows.map((row) =>
        [row.group, row.rows, row.sum, row.mean, row.min, row.max].map(quote).join(","),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "group-summary.csv";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return (
    <section className="panel group-summary">
      <div className="section-title">
        <div>
          <h2>{t("Summary by group")}</h2>
          <p>{t("See how rows and a numeric measure divide across the values of one column, for example by team, region or status.")}</p>
        </div>
      </div>
      <div className="group-controls">
        <label>{t("Group by")}<select value={by} onChange={(e) => onChange(e.target.value, measure)}>
            <option value="">{t("Choose a column")}</option>
            {groupable.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
        </label>
        <label>{t("Measure")}<select value={measure} onChange={(e) => onChange(by, e.target.value)}>
            <option value="">{t("Count rows only")}</option>
            {numericColumns.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={busy || !by} onClick={onApply}>{t("Show summary")}</button>
        {summary && (
          <button className="report-button" onClick={exportCsv}>
            <Download size={15} />{t("Export summary (CSV)")}</button>
        )}
      </div>
      {summary && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{summary.by}</th>
                  <th>{t("Rows")}</th>
                  {summary.measure && (
                    <>
                      <th>{t("Sum of")} {summary.measure}</th>
                      <th>{t("Average")}</th>
                      <th>{t("Min")}</th>
                      <th>{t("Max")}</th>
                    </>
                  )}
                  <th aria-hidden="true">{t("Share")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => (
                  <tr key={row.group}>
                    <td>{row.group}</td>
                    <td>{fmt(row.rows)}</td>
                    {summary.measure && (
                      <>
                        <td>{fmt(row.sum)}</td>
                        <td>{fmt(row.mean)}</td>
                        <td>{fmt(row.min)}</td>
                        <td>{fmt(row.max)}</td>
                      </>
                    )}
                    <td aria-hidden="true">
                      <span
                        className="bar"
                        style={{
                          width: `${(Math.abs(summary.measure ? (row.sum ?? 0) : row.rows) / biggest) * 100}%`,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            {summary.truncated
              ? `Showing the top 50 of ${fmt(summary.total_groups)} groups. `
              : `${fmt(summary.total_groups)} group(s). `}
            Blank values are grouped as “(blank)”. Sums and averages skip blank
            and non-numeric cells in the measure.
          </p>
        </>
      )}
    </section>
  );
}
