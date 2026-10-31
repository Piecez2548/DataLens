import { t, tReason } from "./i18n";
import { useState } from "react";
import { Download } from "lucide-react";
import type { Analysis } from "./types";
import {
  downloadIssuesCsv,
  downloadIssuesJson,
  issueKindLabels,
} from "./issueExport";

const fmt = (n: number) => n.toLocaleString();

export default function IssueExplorer({ data }: { data: Analysis }) {
  const kinds = Object.entries(data.issue_samples.kinds).filter(
    ([, entry]) => entry.total > 0,
  );
  const [chosen, setChosen] = useState(kinds[0]?.[0] ?? "");
  const [column, setColumn] = useState("");
  const label = data.issue_samples.row_label;
  const entry = data.issue_samples.kinds[chosen];
  const examples = (entry?.examples ?? []).filter(
    (item) => !column || item.column === column,
  );
  const columns = Array.from(
    new Set((entry?.examples ?? []).map((item) => item.column ?? "")),
  ).filter(Boolean);
  if (!kinds.length) {
    return (
      <section className="panel">
        <h2>{t("Issue locations")}</h2>
        <p className="muted">{t("No missing, duplicate, conflicting, invalid, outlier or rule-violating values were found, so there is nothing to locate.")}</p>
      </section>
    );
  }
  return (
    <section className="panel issue-explorer">
      <div className="section-title">
        <div>
          <h2>{t("Issue locations")}</h2>
          <p>
            {t(label === "row" ? "Find the exact rows to correct in the source file. Row numbers match the original file, counting the header." : "Find the exact records to correct in the source file. Record numbers follow the order in the file.")}
          </p>
        </div>
        <div className="file-actions">
          <button className="report-button" onClick={() => downloadIssuesCsv(data)}>
            <Download size={15} />{t("Export issue list (CSV)")}</button>
          <button className="report-button" onClick={() => downloadIssuesJson(data)}>
            <Download size={15} />{t("Export (JSON)")}</button>
        </div>
      </div>
      <div className="issue-kinds" role="tablist" aria-label="Issue type">
        {kinds.map(([kind, item]) => (
          <button
            key={kind}
            role="tab"
            aria-selected={kind === chosen}
            className={kind === chosen ? "active" : ""}
            onClick={() => {
              setChosen(kind);
              setColumn("");
            }}
          >
            {t(issueKindLabels[kind] ?? kind)} · {fmt(item.total)}
          </button>
        ))}
      </div>
      {columns.length > 1 && (
        <label className="issue-filter">{t("Column")}<select value={column} onChange={(event) => setColumn(event.target.value)}>
            <option value="">{t("All columns")}</option>
            {columns.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t(label === "row" ? "Row" : "Record")}</th>
              <th>{t("Column")}</th>
              <th>{t("Value")}</th>
              <th>{t("Why it was flagged")}</th>
            </tr>
          </thead>
          <tbody>
            {examples.slice(0, 100).map((item, index) => (
              <tr key={`${item.row}-${item.column}-${index}`}>
                <td>{fmt(item.row)}</td>
                <td>{item.column ?? t("(entire row)")}</td>
                <td>{item.value ?? <span className="missing">—</span>}</td>
                <td>{tReason(item.reason)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Showing {Math.min(examples.length, 100)} of {fmt(entry?.total ?? 0)}.
        {entry && entry.total > entry.examples.length
          ? ` Only the first ${fmt(entry.examples.length)} are listed and exported; fix them and re-upload to see the rest.`
          : " The export contains the complete list."}
      </p>
    </section>
  );
}
