import type { Analysis } from "./types";
import { t, tReason } from "./i18n";

export const issueKindLabels: Record<string, string> = {
  missing: "Missing values",
  duplicate: "Duplicate rows",
  mismatch: "Type conflicts",
  invalid: "Invalid values",
  outlier: "Outliers",
  rule: "Business-rule violations",
  key_duplicate: "Repeated business keys",
};

export type IssueRow = {
  kind: string;
  row: number;
  column: string;
  value: string;
  reason: string;
};

export function issueRows(data: Analysis): IssueRow[] {
  return Object.entries(data.issue_samples.kinds).flatMap(([kind, entry]) =>
    entry.examples.map((item) => ({
      kind,
      row: item.row,
      column: item.column ?? t("(entire row)"),
      value: item.value ?? "",
      reason: tReason(item.reason),
    })),
  );
}

// Spreadsheet apps run text starting with these characters as formulas.
const safeCell = (value: string) =>
  /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
const quote = (value: string | number) =>
  `"${safeCell(String(value)).replaceAll('"', '""')}"`;

function download(name: string, mime: string, body: string, bom = "") {
  const url = URL.createObjectURL(new Blob([bom + body], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const baseName = (data: Analysis) =>
  data.filename.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "dataset";

export function downloadIssuesCsv(data: Analysis) {
  const label = data.issue_samples.row_label;
  const header = [t("Issue type"), t(label === "row" ? "Row" : "Record"), t("Column"), t("Value"), t("Why it was flagged")].join(",");
  const lines = issueRows(data).map((item) =>
    [
      t(issueKindLabels[item.kind] ?? item.kind),
      item.row,
      item.column,
      item.value,
      item.reason,
    ]
      .map(quote)
      .join(","),
  );
  // The BOM lets Excel open Thai text correctly.
  download(`${baseName(data)}-issues.csv`, "text/csv;charset=utf-8", [header, ...lines].join("\r\n"), "﻿");
}

export function downloadIssuesJson(data: Analysis) {
  const body = {
    file: data.filename,
    source_sha256: data.provenance.sha256,
    row_label: data.issue_samples.row_label,
    status: data.executive.status,
    issues: Object.fromEntries(
      Object.entries(data.issue_samples.kinds).map(([kind, entry]) => [
        kind,
        { total: entry.total, listed: entry.examples.length, examples: entry.examples },
      ]),
    ),
  };
  download(`${baseName(data)}-issues.json`, "application/json;charset=utf-8", JSON.stringify(body, null, 2));
}
