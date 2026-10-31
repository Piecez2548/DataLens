import type { Analysis } from "./types";
import { issueKindLabels } from "./issueExport";

const fmt = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const delta = (before: number, after: number) => {
  const change = after - before;
  return change === 0 ? "no change" : `${change > 0 ? "+" : ""}${fmt(change)}`;
};

// Compares two analyses already held in the browser; nothing is sent or stored.
export default function Compare({
  base,
  other,
  onClose,
}: {
  base: Analysis;
  other: Analysis;
  onClose: () => void;
}) {
  const baseColumns = new Map(base.columns.map((c) => [c.name, c]));
  const otherColumns = new Map(other.columns.map((c) => [c.name, c]));
  const added = other.columns.filter((c) => !baseColumns.has(c.name));
  const removed = base.columns.filter((c) => !otherColumns.has(c.name));
  const retyped = other.columns.filter((c) => {
    const before = baseColumns.get(c.name);
    return before && before.type !== c.type;
  });
  const metrics: [string, number, number][] = [
    ["Rows", base.rows, other.rows],
    ["Columns", base.column_count, other.column_count],
    ["Missing cells", base.missing, other.missing],
    ["Duplicate rows", base.duplicates, other.duplicates],
    ["Overall score", base.scores.Overall ?? 0, other.scores.Overall ?? 0],
    ...(["Completeness", "Consistency", "Uniqueness", "Validity"] as const).map(
      (name): [string, number, number] => [
        name,
        base.scores[name] ?? 0,
        other.scores[name] ?? 0,
      ],
    ),
  ];
  const sameFile = base.provenance.sha256 === other.provenance.sha256;
  return (
    <section className="panel" aria-labelledby="compare-title">
      <div className="section-title">
        <div>
          <h2 id="compare-title">Compare files</h2>
          <p>
            Baseline <strong>{base.filename}</strong> vs{" "}
            <strong>{other.filename}</strong>. Both analyses stay in this
            browser session.
          </p>
        </div>
        <button className="text-button" onClick={onClose}>
          Close comparison
        </button>
      </div>
      {sameFile && (
        <p role="status" className="muted">
          Both files have the same SHA-256 fingerprint, so their contents are
          identical.
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Measure</th>
              <th>Baseline</th>
              <th>Comparison</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map(([label, before, after]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{fmt(before)}</td>
                <td>{fmt(after)}</td>
                <td>{delta(before, after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Issue resolution</h3>
      <p className="muted">
        Status: {base.executive.status} → {other.executive.status}. Counts are
        exact totals for each issue type, so a lower number after your fixes
        means issues were resolved.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Issue type</th>
              <th>Baseline</th>
              <th>Comparison</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(
              new Set([
                ...Object.keys(base.issue_samples.kinds),
                ...Object.keys(other.issue_samples.kinds),
              ]),
            ).map((kind) => {
              const before = base.issue_samples.kinds[kind]?.total ?? 0;
              const after = other.issue_samples.kinds[kind]?.total ?? 0;
              return (
                <tr key={kind}>
                  <td>{issueKindLabels[kind] ?? kind}</td>
                  <td>{fmt(before)}</td>
                  <td>{fmt(after)}</td>
                  <td>
                    {after < before
                      ? `${fmt(before - after)} resolved`
                      : after > before
                        ? `${fmt(after - before)} new`
                        : before === 0
                          ? "none"
                          : "unchanged"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h3>Schema changes</h3>
      {added.length + removed.length + retyped.length === 0 ? (
        <p className="muted">Same column names and types.</p>
      ) : (
        <ul>
          {added.map((c) => (
            <li key={`a-${c.name}`}>
              Added column <strong>{c.name}</strong> ({c.type})
            </li>
          ))}
          {removed.map((c) => (
            <li key={`r-${c.name}`}>
              Removed column <strong>{c.name}</strong>
            </li>
          ))}
          {retyped.map((c) => (
            <li key={`t-${c.name}`}>
              <strong>{c.name}</strong> changed type from{" "}
              {baseColumns.get(c.name)?.type} to {c.type}
            </li>
          ))}
        </ul>
      )}
      <h3>Per-column change</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Column</th>
              <th>Missing</th>
              <th>Invalid</th>
              <th>Distinct</th>
            </tr>
          </thead>
          <tbody>
            {other.columns
              .filter((c) => baseColumns.has(c.name))
              .map((c) => {
                const before = baseColumns.get(c.name)!;
                return (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td>{before.missing} → {c.missing}</td>
                    <td>{before.invalid} → {c.invalid}</td>
                    <td>{before.unique} → {c.unique}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Differences describe the two uploaded files only. They do not show which
        file is correct.
      </p>
    </section>
  );
}
