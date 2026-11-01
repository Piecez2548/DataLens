import { Check, CircleAlert, Upload } from "lucide-react";
import { t, tf } from "./i18n";
import type { Analysis } from "./types";

type Row = { key: string; label: string; problem: boolean; text: string; tab?: string };

const fmt = (n: number) => n.toLocaleString();

/** One short checklist and the actions that follow from it, so the answer to "can I send this?" is in one place. */
export default function SendCheck({
  data,
  onGo,
  onExportRows,
}: {
  data: Analysis;
  onGo: (tab: "Issues") => void;
  onExportRows: () => void;
}) {
  const personal = data.columns.filter((column) => column.pattern || column.type === "email").map((column) => column.name);
  const conflicts = data.columns.reduce((sum, column) => sum + column.mismatches + column.invalid, 0);
  const kinds = data.issue_samples.kinds;
  const rows: Row[] = [
    {
      key: "personal",
      label: t("Personal data"),
      problem: personal.length > 0,
      text: personal.length ? tf("Found in {names}", { names: personal.slice(0, 3).join(", ") }) : t("None found"),
    },
    {
      key: "missing",
      label: t("Missing values"),
      problem: data.missing > 0,
      text: data.missing ? tf("{count} empty cells", { count: fmt(data.missing) }) : t("None"),
      tab: "Issues",
    },
    {
      key: "duplicates",
      label: t("Duplicate rows"),
      problem: data.duplicates > 0,
      text: data.duplicates ? tf("{count} repeated rows", { count: fmt(data.duplicates) }) : t("None"),
      tab: "Issues",
    },
    {
      key: "types",
      label: t("Wrong or impossible values"),
      problem: conflicts > 0,
      text: conflicts ? tf("{count} values", { count: fmt(conflicts) }) : t("None"),
      tab: "Issues",
    },
  ];
  if (data.business_rules.configured) {
    rows.push({
      key: "rules",
      label: t("Your business rules"),
      problem: !data.business_rules.passed,
      text: data.business_rules.passed
        ? t("All passed")
        : tf("{count} values break a rule", { count: fmt(data.business_rules.total_violations) }),
      tab: "Issues",
    });
  }
  const located = Object.values(kinds).reduce((sum, entry) => sum + entry.total, 0);
  return (
    <section className="panel send-check" aria-label={t("Before you send")}>
      <h2>{t("Before you send")}</h2>
      <ul>
        {rows.map((row) => (
          <li key={row.key} className={row.problem ? "problem" : "ok"}>
            {row.problem ? <CircleAlert size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
            <strong>{row.label}</strong>
            <span>{row.text}</span>
            {row.problem && row.tab && located > 0 && (
              <button className="text-button" onClick={() => onGo("Issues")}>
                {t("See where")}
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="send-actions">
        {data.problem_rows.total > 0 && (
          <button className="report-button" onClick={onExportRows}>
            <Upload size={15} />
            {t("Export rows to fix (Excel)")}
          </button>
        )}
      </div>
    </section>
  );
}
