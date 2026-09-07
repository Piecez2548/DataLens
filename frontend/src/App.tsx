import { lazy, Suspense, useRef, useState } from "react";
import {
  Aperture,
  ArrowUpRight,
  BarChart3,
  Check,
  CircleAlert,
  Database,
  FileSpreadsheet,
  Moon,
  Sun,
  Upload,
  X,
} from "lucide-react";
import type { Analysis } from "./types";
const Charts = lazy(() => import("./Charts"));
const MAX_UPLOAD_MB = import.meta.env.PROD ? 4 : 10;
const tabs = ["Overview", "Data quality", "Explore", "Data preview"] as const;
const explanations: Record<string, string> = {
  Completeness: "Non-empty cells / all cells",
  Consistency: "Type-matching values / non-empty values",
  Uniqueness: "Rows remaining after deduplication / all rows",
  Validity: "Valid typed values / checked typed values",
};
const fmt = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });
export default function App() {
  const [data, setData] = useState<Analysis | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dark, setDark] = useState(false);
  const [page, setPage] = useState(0);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  async function upload(
    file: File,
    headerMode: "auto" | "present" | "absent" = "auto",
  ) {
    if (busy) return;
    if (
      !file.name.toLowerCase().endsWith(".csv") ||
      file.size > MAX_UPLOAD_MB * 1024 * 1024
    ) {
      setError(`Choose a CSV file no larger than ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/analyze?header_mode=${headerMode}`, {
        method: "POST",
        body,
      });
      if (!response.ok) {
        const e = await response
          .json()
          .catch(() => ({
            detail:
              response.status === 413
                ? "This file exceeds the hosting upload limit."
                : "Analysis is temporarily unavailable. Please try again.",
          }));
        throw new Error(
          typeof e.detail === "string"
            ? e.detail
            : "Could not analyze this CSV.",
        );
      }
      const result: Analysis = await response.json();
      setData(result);
      setLastFile(file);
      setSelected(
        result.columns.find((c) => c.type === "numeric")?.name ??
          result.columns[0].name,
      );
      setPage(0);
      setTab("Overview");
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Cannot reach the analysis service. Please try again in a moment."
          : e instanceof Error
            ? e.message
            : "Upload failed. Please try again.",
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function demo() {
    try {
      const r = await fetch("/demo.csv");
      if (!r.ok) throw new Error();
      await upload(
        new File([await r.blob()], "retail-demo.csv", { type: "text/csv" }),
      );
    } catch {
      setError(
        "Could not load the sample CSV. Please upload samples/demo.csv.",
      );
    }
  }
  const column = data?.columns.find((c) => c.name === selected);
  return (
    <div className={dark ? "app dark" : "app"}>
      <aside>
        <a className="brand" href="#">
          <Aperture size={30} />
          <span>
            DataLens<span className="version"> / 0.2</span>
          </span>
        </a>
        <a
          href="https://nexus-lemon-eight-32.vercel.app/projects"
          className="text-button"
          style={{ marginTop: 24, fontSize: 14 }}
        >
          ← Back to Nexus
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <div className="nav-active">
          <Database size={18} /> Dataset explorer
        </div>
        <div className="side-note">
          <span className="status-dot" /> Session workspace
          <p>
            Session-only analysis.
            <br />
            No dataset history is kept.
          </p>
        </div>
        <div className="side-bottom">
          A clearer view of your data.
          <br />
          <span>Executive preview · v0.2</span>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span> Dataset explorer
          </div>
          <button
            className="icon-button"
            aria-label={dark ? "Use light theme" : "Use dark theme"}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">DATASET EXPLORER</div>
              <h1>
                Good insights start
                <br className="mobile-break" /> with good data.
              </h1>
              <p>
                Understand your schema, spot gaps, and explore what matters.
              </p>
            </div>
            <button
              className="primary"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <Upload size={17} />
              {busy ? "Analyzing…" : "Upload CSV"}
            </button>
          </div>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="Upload CSV file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          {error && (
            <div role="alert" className="error">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={18} />
              </button>
            </div>
          )}
          <div aria-live="polite" className="sr-only">
            {busy
              ? "Analyzing your file"
              : data
                ? `${data.filename} analyzed, ${data.rows} rows`
                : ""}
          </div>
          {!data ? (
            <section
              className="upload-area"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) void upload(f);
              }}
            >
              <div className="upload-icon">
                <FileSpreadsheet size={34} />
              </div>
              <h2>Your next discovery starts here</h2>
              <p>Drop a CSV file here to explore its quality and structure.</p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                {busy ? "Analyzing…" : "Choose a CSV file"}
                <ArrowUpRight size={17} />
              </button>
              <small>
                UTF-8 CSV · up to {MAX_UPLOAD_MB} MB · 100,000 rows · 100
                columns
              </small>
              <div className="demo-row">
                <span>Just looking around?</span>
                <button disabled={busy} onClick={() => void demo()}>
                  Explore sample dataset →
                </button>
              </div>
            </section>
          ) : (
            <>
              <div className="file-strip">
                <div className="file-icon">
                  <FileSpreadsheet size={23} />
                </div>
                <div>
                  <strong>{data.filename}</strong>
                  <p>
                    {fmt(data.rows)} rows · {data.column_count} columns
                  </p>
                </div>
                <span className="analyzed">
                  <Check size={14} /> Analysis complete
                </span>
              </div>
              <nav className="tabs" aria-label="Dataset views">
                {tabs.map((t) => (
                  <button
                    key={t}
                    aria-current={tab === t ? "page" : undefined}
                    className={tab === t ? "active" : ""}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </nav>
              {tab === "Overview" && (
                <>
                  <ExecutiveBrief data={data} />
                  {data.header.generated_names && (
                    <section className="header-notice" role="status">
                      <CircleAlert size={20} />
                      <div>
                        <strong>No header row detected</strong>
                        <p>
                          All {fmt(data.rows)} rows were kept as data. Neutral
                          names were generated so the quality score does not
                          hide a structural issue.
                        </p>
                      </div>
                      <button
                        disabled={busy || !lastFile}
                        onClick={() =>
                          lastFile && void upload(lastFile, "present")
                        }
                      >
                        Use first row as header
                      </button>
                    </section>
                  )}
                  <div className="metrics">
                    {[
                      ["Total rows", fmt(data.rows), "Records in your dataset"],
                      [
                        "Columns",
                        fmt(data.column_count),
                        "Automatically inferred",
                      ],
                      [
                        "Missing cells",
                        fmt(data.missing),
                        `${fmt((data.missing / (data.rows * data.column_count)) * 100)}% of all cells`,
                      ],
                      [
                        "Duplicate rows",
                        fmt(data.duplicates),
                        "Beyond the first occurrence",
                      ],
                    ].map(([label, value, detail]) => (
                      <section className="panel metric" key={label}>
                        <p>{label}</p>
                        <strong>{value}</strong>
                        <small>{detail}</small>
                      </section>
                    ))}
                  </div>
                  <Quality data={data} />
                  <div className="section-title">
                    <div>
                      <h2>A closer look</h2>
                      <p>
                        Explore distributions and relationships in your dataset.
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setTab("Explore")}
                    >
                      Explore columns <ArrowUpRight size={16} />
                    </button>
                  </div>
                  {column && (
                    <Suspense fallback={<p>Loading charts…</p>}>
                      <Charts data={data} column={column} />
                    </Suspense>
                  )}
                </>
              )}
              {tab === "Data quality" && (
                <>
                  <Quality data={data} />
                  <section className="panel">
                    <h2>Column health</h2>
                    <p className="muted">
                      Types inferred at an 80% threshold. Empty cells are
                      excluded from type checks.
                    </p>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            {[
                              "Column",
                              "Inferred type",
                              "Missing",
                              "Type mismatches",
                              "Invalid",
                              "Distinct",
                            ].map((h) => (
                              <th key={h}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.columns.map((c) => (
                            <tr key={c.name}>
                              <td>{c.name}</td>
                              <td>
                                <span className="badge">{c.type}</span>
                              </td>
                              <td>{c.missing}</td>
                              <td>{c.mismatches}</td>
                              <td>{c.invalid}</td>
                              <td>{c.unique}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
              {tab === "Explore" && column && (
                <>
                  <div className="section-title">
                    <div>
                      <h2>Explore a column</h2>
                      <p>Charts adapt to the inferred data type.</p>
                    </div>
                    <select
                      aria-label="Column to explore"
                      value={selected}
                      onChange={(e) => setSelected(e.target.value)}
                    >
                      {data.columns.map((c) => (
                        <option key={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  {column.stats && (
                    <div className="stats-strip">
                      {Object.entries(column.stats).map(([k, v]) => (
                        <div key={k}>
                          <span>{k}</span>
                          <strong>{fmt(v)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                  <Suspense fallback={<p>Loading charts…</p>}>
                    <Charts data={data} column={column} />
                  </Suspense>
                </>
              )}
              {tab === "Data preview" && (
                <section className="panel">
                  <div className="section-title">
                    <div>
                      <h2>Data preview</h2>
                      <p>
                        First {data.preview.length} of {fmt(data.rows)} rows ·
                        trimmed values · blanks shown as —
                      </p>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          {data.columns.map((c) => (
                            <th key={c.name}>
                              {c.name}
                              <small>{c.type}</small>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.preview
                          .slice(page * 10, page * 10 + 10)
                          .map((row, i) => (
                            <tr key={page * 10 + i}>
                              <td className="muted">{page * 10 + i + 1}</td>
                              {data.columns.map((c) => (
                                <td key={c.name}>
                                  {row[c.name] ?? (
                                    <span className="missing">—</span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="pagination">
                    <span>
                      Page {page + 1} of {Math.ceil(data.preview.length / 10)}
                    </span>
                    <button disabled={!page} onClick={() => setPage(page - 1)}>
                      Previous
                    </button>
                    <button
                      disabled={(page + 1) * 10 >= data.preview.length}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
          <footer>
            <span>
              <BarChart3 size={14} /> DataLens
            </span>
            <span>Transparent metrics. No AI. Just your data.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
function ExecutiveBrief({ data }: { data: Analysis }) {
  const tone =
    data.executive.status === "Action required"
      ? "danger"
      : data.executive.status === "Review needed"
        ? "review"
        : "ready";
  return (
    <section
      className={`panel executive ${tone}`}
      aria-labelledby="executive-title"
    >
      <div className="executive-heading">
        <div>
          <span className="eyebrow">EXECUTIVE BRIEF</span>
          <h2 id="executive-title">{data.executive.status}</h2>
          <p>{data.executive.message}</p>
        </div>
        <div className="executive-count">
          <strong>{data.executive.issue_count}</strong>
          <span>items to review</span>
        </div>
      </div>
      {data.executive.issues.length > 0 ? (
        <div className="issue-list">
          {data.executive.issues.map((issue) => (
            <article className="issue" key={issue.title}>
              <span className={`severity ${issue.severity}`}>
                {issue.severity}
              </span>
              <div>
                <h3>{issue.title}</h3>
                <p>{issue.detail}</p>
                <small>
                  <strong>Next:</strong> {issue.recommendation}
                </small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="no-issues">
          <Check size={17} /> No supported structural issues detected.
        </p>
      )}
      <p className="scope-note">{data.executive.scope_note}</p>
    </section>
  );
}
function Quality({ data }: { data: Analysis }) {
  return (
    <section className="panel quality">
      <div className="quality-summary">
        <span className="eyebrow">DATA QUALITY</span>
        <div className="score">
          {fmt(data.scores.Overall ?? 0)}
          <span>/100</span>
        </div>
        <h3>Overall score</h3>
        <p>Equal-weight mean of available dimensions.</p>
      </div>
      <div className="quality-dimensions">
        {Object.entries(explanations).map(([name, description]) => (
          <div key={name}>
            <div className="dimension-title">
              <strong>{name}</strong>
              <span>
                {data.scores[name] === null
                  ? "N/A"
                  : `${fmt(data.scores[name])}%`}
              </span>
            </div>
            <div className="track">
              <div style={{ width: `${data.scores[name] ?? 0}%` }} />
            </div>
            <p>{description}</p>
          </div>
        ))}
      </div>
      <p className="quality-note">
        Validity checks finite numbers and calendar dates; booleans must be
        true/false. Text has no domain rules. N/A dimensions are excluded. These
        scores do not establish real-world accuracy.
      </p>
    </section>
  );
}
