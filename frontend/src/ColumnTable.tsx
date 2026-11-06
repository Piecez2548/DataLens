import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { Column } from "./types";
import { t, tf } from "./i18n";

type Filter = "all" | "datetime" | "categorical" | "numeric" | "gaps";
const FILTERS: Filter[] = ["all", "datetime", "categorical", "numeric", "gaps"];
const LABEL: Record<Filter, string> = {
  all: "All",
  datetime: "datetime",
  categorical: "categorical",
  numeric: "numeric",
  gaps: "Has gaps",
};

const matches = (c: Column, filter: Filter) =>
  filter === "all" ? true : filter === "gaps" ? c.missing > 0 : c.type === filter;

// Structure table: search, type filters with counts, and a selected column that stays visible when filtered out.
export default function ColumnTable({
  columns,
  selected,
  onSelect,
}: {
  columns: Column[];
  selected: string;
  onSelect: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const search = useRef<HTMLInputElement>(null);
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f, columns.filter((c) => matches(c, f)).length])) as Record<Filter, number>,
    [columns],
  );
  const needle = query.trim().toLowerCase();
  const visible = columns.filter((c) => matches(c, filter) && c.name.toLowerCase().includes(needle));
  const pinned = columns.find((c) => c.name === selected && !visible.includes(c));
  const rows = pinned ? [pinned, ...visible] : visible;
  const filtered = Boolean(needle) || filter !== "all";
  const clear = () => {
    setQuery("");
    setFilter("all");
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        search.current?.focus();
      } else if (event.key === "Escape" && (filtered || el === search.current)) {
        clear();
        if (el === search.current) search.current?.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filtered]);

  return (
    <div className="column-table">
      <div className="column-tools">
        <label className="column-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">{t("Search column name")}</span>
          <input
            ref={search}
            type="search"
            value={query}
            placeholder={t("Search column name (press /)")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="column-filters" role="group" aria-label={t("Filter columns")}>
          {FILTERS.map((f) => (
            <button key={f} aria-pressed={filter === f} className={filter === f ? "chip on" : "chip"} onClick={() => setFilter(f)}>
              {t(LABEL[f])} <span className="chip-count">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="column-count" role="status">
        {tf("Showing {shown} of {total} columns", { shown: visible.length, total: columns.length })}
      </p>
      {visible.length === 0 && (
        <div className="column-empty">
          <p>{t("No columns match these filters.")}</p>
          <button onClick={clear}>{t("Clear filters")}</button>
        </div>
      )}
      {rows.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {["Column", "Inferred type", "Missing", "Type mismatches", "Invalid", "Outliers", "Distinct"].map((h) => (
                  <th key={h}>{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.name} className={c.name === selected ? "selected" : undefined} aria-selected={c.name === selected}>
                  <td>
                    <button className="column-pick" onClick={() => onSelect(c.name)} aria-pressed={c.name === selected}>
                      {c.name}
                    </button>
                    {c === pinned && <small className="pinned-note">{t("Selected · hidden by filter")}</small>}
                  </td>
                  <td>
                    <span className="badge">{t(c.type)}</span>
                    {c.format && <span className="badge">{t(c.format)}</span>}
                    {c.pattern && (
                      <span className="badge">
                        {t(c.pattern === "thai_national_id" ? "Thai ID (personal data)" : "Thai phone (personal data)")}
                      </span>
                    )}
                  </td>
                  <td>{c.missing}</td>
                  <td>{c.mismatches}</td>
                  <td>{c.invalid}</td>
                  <td>{c.outliers}</td>
                  <td>{c.unique}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
