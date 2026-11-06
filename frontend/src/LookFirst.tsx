import { CircleAlert, CircleCheck } from "lucide-react";
import type { Column } from "./types";
import { t, tf } from "./i18n";

// "Look first" strip: how many columns have gaps, and the three with the most missing cells (from the real analysis).
export default function LookFirst({
  columns,
  rows,
  onPick,
}: {
  columns: Column[];
  rows: number;
  onPick: (name: string) => void;
}) {
  const gaps = columns.filter((c) => c.missing > 0);
  const top = [...gaps].sort((a, b) => b.missing - a.missing).slice(0, 3);
  if (!gaps.length) {
    return (
      <section className="look-first ok" aria-label={t("Look at first")}>
        <CircleCheck size={20} aria-hidden="true" />
        <strong>{t("No column has empty cells.")}</strong>
      </section>
    );
  }
  return (
    <section className="look-first" aria-label={t("Look at first")}>
      <div className="look-first-text">
        <CircleAlert size={20} aria-hidden="true" />
        <div>
          <span className="eyebrow">{t("Look at first")}</span>
          <strong>{tf("{count} of {total} columns have empty cells", { count: gaps.length, total: columns.length })}</strong>
        </div>
      </div>
      <div className="look-first-buttons" role="group" aria-label={t("Columns with the most empty cells")}>
        {top.map((c) => (
          <button key={c.name} onClick={() => onPick(c.name)}>
            <span className="look-name">{c.name}</span>
            <span className="look-pct">{rows ? `${Math.round((c.missing / rows) * 1000) / 10}%` : c.missing}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
