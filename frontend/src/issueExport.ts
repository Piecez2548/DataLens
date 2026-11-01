import type { Analysis, FollowUps } from "./types";
import { t, tf, tReason, tStatus } from "./i18n";
import { downloadWorkbook } from "./xlsx";

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

function followUpRows(data: Analysis, followUps: FollowUps) {
  return Object.entries(followUps)
    .filter(([kind, item]) => (data.issue_samples.kinds[kind]?.total ?? 0) > 0 && (item.owner || item.due || item.note))
    .map((entry): (string | number | null)[] => [
      t(issueKindLabels[entry[0]] ?? entry[0]),
      data.issue_samples.kinds[entry[0]].total,
      entry[1].owner,
      entry[1].due,
      entry[1].note,
    ]);
}

export function downloadIssuesXlsx(data: Analysis, followUps: FollowUps = {}) {
  const plan = followUpRows(data, followUps);
  const label = t(data.issue_samples.row_label === "row" ? "Row" : "Record");
  const kinds = Object.entries(data.issue_samples.kinds).filter(([, entry]) => entry.total > 0);
  downloadWorkbook(`${baseName(data)}-issues.xlsx`, [
    ...(plan.length
      ? [
          {
            name: t("Follow-up plan"),
            header: [t("Issue type"), t("Count"), t("Owner"), t("Due date"), t("Note")],
            rows: plan,
          },
        ]
      : []),
    {
      name: t("Summary"),
      header: [t("Issue type"), t("Total"), t("Listed")],
      rows: [
        [t("File"), data.filename, null],
        [t("Status"), tStatus(data.executive.status), null],
        ...kinds.map(([kind, entry]): (string | number | null)[] => [
          t(issueKindLabels[kind] ?? kind),
          entry.total,
          entry.examples.length,
        ]),
      ],
    },
    {
      name: t("Issues"),
      header: [t("Issue type"), label, t("Column"), t("Value"), t("Why it was flagged")],
      rows: issueRows(data).map((item) => [
        t(issueKindLabels[item.kind] ?? item.kind),
        item.row,
        item.column,
        item.value,
        item.reason,
      ]),
    },
  ]);
}

const asCell = (value: string): string | number =>
  /^-?(?:0|[1-9]\d{0,14})(?:\.\d+)?$/.test(value) ? Number(value) : value;

const describeIssue = (label: string) => {
  const [kind, column] = label.split(":");
  return `${t(issueKindLabels[kind] ?? kind)}${column ? ` (${column})` : ""}`;
};

/** The original rows that have problems, with what is wrong in the first columns, ready to hand to whoever fixes them. */
export function downloadProblemRowsXlsx(data: Analysis) {
  const found = data.problem_rows;
  const label = t(data.issue_samples.row_label === "row" ? "Row" : "Record");
  const sheets = [
    {
      name: t("Rows to fix"),
      header: [label, t("What to fix"), ...found.columns],
      rows: found.rows.map((item): (string | number | null)[] => [
        item.row,
        item.issues.map(describeIssue).join("; "),
        ...item.values.map(asCell),
      ]),
    },
  ];
  if (found.total > found.listed) {
    sheets.push({
      name: t("Note"),
      header: [t("Note")],
      rows: [[tf("Only the first {listed} of {total} rows are listed. Fix them and check the file again to see the rest.", { listed: found.listed, total: found.total })]],
    });
  }
  downloadWorkbook(`${baseName(data)}-rows-to-fix.xlsx`, sheets);
}

export function downloadIssuesJson(data: Analysis, followUps: FollowUps = {}) {
  const body = {
    follow_ups: followUps,
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
