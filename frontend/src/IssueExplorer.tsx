import { t, tf, tReason } from "./i18n";
import { useState } from "react";
import { Upload } from "lucide-react";
import type { Analysis, FollowUp, FollowUps } from "./types";
import {
  downloadIssuesCsv,
  downloadIssuesJson,
  downloadIssuesXlsx,
  downloadProblemRowsXlsx,
  issueKindLabels,
} from "./issueExport";

const fmt = (n: number) => n.toLocaleString();

export default function IssueExplorer({
  data,
  followUps,
  onFollowUp,
}: {
  data: Analysis;
  followUps: FollowUps;
  onFollowUp: (kind: string, value: FollowUp) => void;
}) {
  const kinds = Object.entries(data.issue_samples.kinds).filter(
    ([, entry]) => entry.total > 0,
  );
  const [chosen, setChosen] = useState(kinds[0]?.[0] ?? "");
  const [column, setColumn] = useState("");
  const label = data.issue_samples.row_label;
  const entry = data.issue_samples.kinds[chosen];
  const current: FollowUp = followUps[chosen] ?? { owner: "", due: "", note: "" };
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
            <Upload size={15} />{t("Export issue list (CSV)")}</button>
          <button className="report-button" onClick={() => downloadIssuesXlsx(data, followUps)}>
            <Upload size={15} />{t("Export issue list (Excel)")}</button>
          <button className="report-button" onClick={() => downloadProblemRowsXlsx(data)}>
            <Upload size={15} />{t("Export rows to fix (Excel)")}</button>
          <button className="report-button" onClick={() => downloadIssuesJson(data, followUps)}>
            <Upload size={15} />{t("Export (JSON)")}</button>
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
      {entry && (
        <fieldset className="follow-up">
          <legend>{t("Follow-up for this issue type")}</legend>
          <label>{t("Owner")}<input
              maxLength={80}
              value={current.owner}
              onChange={(event) => onFollowUp(chosen, { ...current, owner: event.target.value })}
            />
          </label>
          <label>{t("Due date")}<input
              type="date"
              value={current.due}
              onChange={(event) => onFollowUp(chosen, { ...current, due: event.target.value })}
            />
          </label>
          <label className="wide">{t("Note")}<input
              maxLength={500}
              value={current.note}
              onChange={(event) => onFollowUp(chosen, { ...current, note: event.target.value })}
            />
          </label>
          <small>{t("Included in the executive brief, the Excel issue list, the JSON export and the snapshot. Not sent to the server.")}</small>
        </fieldset>
      )}
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
        {tf("Showing {shown} of {total}.", { shown: Math.min(examples.length, 100), total: fmt(entry?.total ?? 0) })}
        {entry && entry.total > entry.examples.length
          ? tf(" Only the first {listed} are listed and exported; fix them and re-upload to see the rest.", { listed: fmt(entry.examples.length) })
          : t(" The export contains the complete list.")}
      </p>
    </section>
  );
}
