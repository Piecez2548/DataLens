import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Aperture,
  ArrowUpRight,
  BarChart3,
  Check,
  CircleAlert,
  Database,
  Download,
  FileSpreadsheet,
  Moon,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { Analysis, AuditEvent, BusinessRule } from "./types";
import {
  GovernancePanel,
  UploadPolicy,
  type GovernanceInput,
} from "./Governance";
import { downloadExecutiveReport } from "./report";
import ChartBoundary from "./ChartBoundary";
import Compare from "./Compare";
import IssueExplorer from "./IssueExplorer";
import GroupSummary from "./GroupSummary";
const Charts = lazy(() => import("./Charts"));
const MAX_UPLOAD_MB = import.meta.env.PROD ? 4 : 10;
const baseTabs = ["Overview", "Data quality", "Issues", "Summary", "Explore", "Data preview"] as const;
type SchemaOptions = {
  column_names?: string[];
  type_overrides?: Record<string, string>;
  business_rules?: Record<string, BusinessRule>;
  missing_markers?: string[];
  sheet?: string;
  header_row?: number | null;
  date_order?: "dmy" | "mdy";
  business_key?: string[];
  group_by?: { by: string; measure?: string } | null;
};
type Tab = (typeof baseTabs)[number] | "Compare";
const MARKER_PRESET = ["NA", "N/A", "null", "none", "nan", "-", "?"];
const parseMarkers = (text: string) =>
  Array.from(new Set(text.split(",").map((item) => item.trim()).filter(Boolean)));
const schemaTypes = [
  "auto",
  "identifier",
  "email",
  "numeric",
  "categorical",
  "datetime",
  "boolean",
] as const;
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
  const [tab, setTab] = useState<Tab>("Overview");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  // Serverless cold starts make the first request slow; explain the wait.
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => setSlow(true), 3500);
    return () => {
      window.clearTimeout(timer);
      setSlow(false);
    };
  }, [busy]);
  const [error, setError] = useState("");
  const [dark, setDark] = useState(false);
  const [page, setPage] = useState(0);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [columnNames, setColumnNames] = useState<string[]>([]);
  const [columnTypes, setColumnTypes] = useState<string[]>([]);
  const [governance, setGovernance] = useState<GovernanceInput>({
    owner: "",
    source_url: "",
    verified_at: "",
    classification: "",
    purpose: "",
  });
  const [authorized, setAuthorized] = useState(false);
  const [businessRules, setBusinessRules] = useState<
    Record<string, BusinessRule>
  >({});
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [markerText, setMarkerText] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState("");
  const [dateOrder, setDateOrder] = useState<"" | "dmy" | "mdy">("");
  const [keyColumns, setKeyColumns] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState({ by: "", measure: "" });
  const [other, setOther] = useState<Analysis | null>(null);
  const compareInput = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const uploadTrigger = useRef<HTMLButtonElement>(null);
  const governanceReady = Boolean(
    authorized &&
      governance.owner.trim() &&
      governance.purpose.trim() &&
      governance.classification &&
      (governance.classification !== "public" ||
        (governance.source_url.startsWith("https://") && governance.verified_at)),
  );
  async function requestAnalysis(
    file: File,
    headerMode: "auto" | "present" | "absent",
    schema?: SchemaOptions,
  ): Promise<Analysis> {
    const body = new FormData();
    body.append("file", file);
    body.append(
      "schema",
      JSON.stringify({
        ...schema,
        governance: { ...governance, authorized_to_process: authorized },
        business_rules: schema?.business_rules ?? businessRules,
        missing_markers: schema?.missing_markers ?? parseMarkers(markerText),
        sheet: schema?.sheet,
        header_row:
          schema?.header_row === null
            ? undefined
            : (schema?.header_row ?? (headerRow ? Number(headerRow) : undefined)),
        date_order: schema?.date_order ?? (dateOrder || undefined),
        business_key: schema?.business_key ?? (keyColumns.length ? keyColumns : undefined),
        group_by:
          schema?.group_by === null
            ? undefined
            : (schema?.group_by ??
              (groupBy.by
                ? { by: groupBy.by, measure: groupBy.measure || undefined }
                : undefined)),
      }),
    );
    const response = await fetch(`/api/analyze?header_mode=${headerMode}`, {
      method: "POST",
      body,
    });
    if (!response.ok) {
      const e = await response.json().catch(() => ({
        detail:
          response.status === 413
            ? "This file exceeds the hosting upload limit."
            : "Analysis is temporarily unavailable. Please try again.",
      }));
      throw new Error(
        typeof e.detail === "string" ? e.detail : "Could not analyze this file.",
      );
    }
    return response.json();
  }
  const validFile = (file: File) =>
    /\.(csv|xlsx|json|jsonl|ndjson)$/i.test(file.name) && file.size <= MAX_UPLOAD_MB * 1024 * 1024;
  async function compareWith(file: File) {
    if (busy || !data) return;
    if (!validFile(file)) {
      setError(`Choose a CSV, XLSX or JSON file no larger than ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      setOther(await requestAnalysis(file, "auto"));
      setTab("Compare");
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Cannot reach the analysis service. Please try again in a moment."
          : e instanceof Error
            ? e.message
            : "Comparison failed. Please try again.",
      );
    } finally {
      setBusy(false);
      if (compareInput.current) compareInput.current.value = "";
    }
  }
  async function upload(
    file: File,
    headerMode: "auto" | "present" | "absent" = "auto",
    schema?: SchemaOptions,
  ) {
    if (busy) return;
    if (!authorized) {
      setError("Confirm that you are allowed to upload this file before analysis.");
      return;
    }
    if (!validFile(file)) {
      setError(`Choose a CSV or XLSX file no larger than ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const fresh = file !== lastFile;
      const sheet = schema?.sheet ?? (fresh ? undefined : sheetName || undefined);
      const result = await requestAnalysis(file, headerMode, {
        ...schema,
        sheet,
        ...(fresh ? { business_key: [], group_by: null } : {}),
      });
      setSheetName(result.provenance.sheet ?? "");
      if (schema?.business_key) setKeyColumns(schema.business_key);
      if (fresh || schema?.sheet || schema?.header_row) {
        setKeyColumns(schema?.business_key ?? []);
        setGroupBy({ by: "", measure: "" });
      }
      if (fresh) setBusinessRules({});
      setData(result);
      setAuditEvents([result.audit_event]);
      setLastFile(file);
      setColumnNames(result.columns.map((item) => item.name));
      setColumnTypes(
        result.columns.map((item) =>
          item.type_overridden ? item.type : "auto",
        ),
      );
      setSelected(
        result.columns.find((c) => c.type === "numeric")?.name ??
          result.columns[0].name,
      );
      setPage(0);
      if (fresh) setTab("Overview");
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
  async function recordAudit(action: "review" | "approve", note: string) {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/audit/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis_id: data.governance.analysis_id,
          analysis_event: data.audit_event,
          review_event:
            action === "approve"
              ? [...auditEvents].reverse().find((event) => event.action === "analysis.reviewed")
              : undefined,
          note,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail ?? "Could not record this audit event.");
      }
      setAuditEvents((events) => [...events, result as AuditEvent]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not record this audit event.",
      );
    } finally {
      setBusy(false);
    }
  }
  function clearDataset() {
    setData(null);
    setOther(null);
    setSheetName("");
    setHeaderRow("");
    setDateOrder("");
    setKeyColumns([]);
    setGroupBy({ by: "", measure: "" });
    setMarkerText("");
    setLastFile(null);
    setColumnNames([]);
    setColumnTypes([]);
    setBusinessRules({});
    setAuditEvents([]);
    setGovernance({
      owner: "",
      source_url: "",
      verified_at: "",
      classification: "",
      purpose: "",
    });
    setAuthorized(false);
    setSelected("");
    setPage(0);
    setError("");
    if (input.current) input.current.value = "";
    window.setTimeout(() => uploadTrigger.current?.focus(), 0);
  }
  const column = data?.columns.find((c) => c.name === selected);
  const approved = Boolean(
    data && auditEvents.some((event) => event.action === "analysis.approved" && event.analysis_id === data.governance.analysis_id),
  );
  return (
    <div className={dark ? "app dark" : "app"}>
      <aside>
        <a className="brand" href="#">
          <Aperture size={30} />
          <span>
            DataLens<span className="version"> / 0.8.0</span>
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
          <span>Simple analysis · v0.8.0</span>
        </div>
      </aside>
      <main>
        <header>
          <a
            className="mobile-home"
            href="https://nexus-lemon-eight-32.vercel.app/projects"
            aria-label="Back to Nexus All"
          >
            <Aperture size={22} aria-hidden="true" />
            <span>DataLens</span>
          </a>
          <div className="breadcrumb">
            Workspace <span>/</span> Dataset explorer
          </div>
          <div className="header-actions">
            <button
              className="icon-button"
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
          </div>
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
              ref={uploadTrigger}
              className="primary"
              disabled={busy || !authorized}
              onClick={() => input.current?.click()}
            >
              <Upload size={17} />
              {busy ? "Analyzing…" : "Upload file"}
            </button>
          </div>
          <input
            ref={input}
            type="file"
            accept=".csv,.xlsx,.json,.jsonl,.ndjson,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            aria-label="Upload CSV file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <input
            ref={compareInput}
            type="file"
            accept=".csv,.xlsx,.json,.jsonl,.ndjson,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            aria-label="Choose a file to compare"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void compareWith(f);
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
          {busy && slow && (
            <div role="status" className="slow-notice">
              Still working. The first analysis after a quiet period can take up to
              about 15 seconds while the service starts; later ones take under a second.
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
              <p>Drop a CSV, Excel (.xlsx) or JSON file here to explore its quality and structure.</p>
              <p>
                Current release: use synthetic or confirmed non-personal data only.
                CSV bytes are sent to the analysis service and may be handled transiently
                by the hosting framework. DataLens does not intentionally persist the file.
              </p>
              <label className="authorization upload-authorization">
                <input
                  type="checkbox"
                  checked={authorized}
                  onChange={(event) => setAuthorized(event.target.checked)}
                />
                I am allowed to analyze this file, and it contains no personal or sensitive data.
              </label>
              <label className="header-row-field">
                Header row (optional)
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={headerRow}
                  onChange={(event) => setHeaderRow(event.target.value)}
                  placeholder="1"
                />
                <small>Use when column names start below a report title.</small>
              </label>
              <button
                className="primary"
                disabled={busy || !authorized}
                onClick={() => input.current?.click()}
              >
                {busy ? "Analyzing…" : "Choose a CSV file"}
                <ArrowUpRight size={17} />
              </button>
              <small>
                CSV (UTF-8, Thai Windows-874, UTF-16; comma, semicolon, tab or pipe) Excel .xlsx (choose any sheet) or JSON records · up to {MAX_UPLOAD_MB} MB · 100,000 rows · 100
                columns
              </small>
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
                <div className="file-actions">
                  <button className="report-button" onClick={clearDataset}>
                    <Trash2 size={15} /> Clear dataset
                  </button>
                  <button
                    className="report-button"
                    disabled={busy}
                    onClick={() => compareInput.current?.click()}
                  >
                    <FileSpreadsheet size={15} /> Compare with another file
                  </button>
                  <button
                    className="report-button"
                    onClick={() => downloadExecutiveReport(data, auditEvents)}
                  >
                    <Download size={15} /> {approved ? "Export approved brief" : "Export draft profile"}
                  </button>
                  <span className="analyzed">
                    <Check size={14} /> Analysis complete
                  </span>
                </div>
              </div>
              <div className="provenance-strip" role="status">
                <strong>Uploaded source file</strong>
                <span>
                  All displayed values and metrics derive from this file; no
                  data rows or values were invented.
                </span>
                <small>
                  SHA-256 {data.provenance.sha256.slice(0, 12)}… · Method v
                  {data.provenance.method_version} ·{" "}
                  {data.provenance.source_format === "xlsx"
                    ? `Excel sheet “${data.provenance.sheet}”`
                    : data.provenance.source_format === "json"
                      ? "JSON records"
                      : `${data.provenance.encoding} · ${data.provenance.delimiter}`}{" "}
                  ·{" "}
                  {fmt(data.provenance.input_bytes)} bytes
                </small>
              </div>
              <nav className="tabs" aria-label="Dataset views">
                {(other ? [...baseTabs, "Compare" as const] : [...baseTabs]).map((t) => (
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
                  {data.provenance.sheets && data.provenance.sheets.length > 1 && (
                    <section className="header-notice" role="status">
                      <FileSpreadsheet size={20} />
                      <div>
                        <strong>This workbook has {data.provenance.sheets.length} sheets</strong>
                        <p>Each sheet is analyzed on its own. Choose the sheet to analyze.</p>
                      </div>
                      <select
                        aria-label="Worksheet"
                        value={data.provenance.sheet ?? ""}
                        disabled={busy || !lastFile}
                        onChange={(event) => {
                          if (!lastFile) return;
                          setBusinessRules({});
                          void upload(lastFile, "auto", {
                            sheet: event.target.value,
                            business_rules: {},
                          });
                        }}
                      >
                        {data.provenance.sheets.map((name) => (
                          <option key={name}>{name}</option>
                        ))}
                      </select>
                    </section>
                  )}
                  {data.provenance.header_row_suggestion && !headerRow && (
                    <section className="header-notice" role="status">
                      <CircleAlert size={20} />
                      <div>
                        <strong>
                          Row {data.provenance.header_row_suggestion} looks like the column names
                        </strong>
                        <p>
                          Rows above it look like a title or notes, so they are being read as data.
                        </p>
                      </div>
                      <button
                        disabled={busy || !lastFile}
                        onClick={() => {
                          const row = data.provenance.header_row_suggestion;
                          if (!lastFile || !row) return;
                          setHeaderRow(String(row));
                          setBusinessRules({});
                          void upload(lastFile, "auto", {
                            header_row: row,
                            business_rules: {},
                          });
                        }}
                      >
                        Use row {data.provenance.header_row_suggestion} as headers
                      </button>
                    </section>
                  )}
                  {data.provenance.date_order_ambiguous && (
                    <section className="header-notice" role="status">
                      <CircleAlert size={20} />
                      <div>
                        <strong>Confirm how dates like 05/06/2024 are written</strong>
                        <p>
                          Every date could be read either way, so day/month was assumed.
                        </p>
                      </div>
                      {(["dmy", "mdy"] as const).map((order) => (
                        <button
                          key={order}
                          disabled={busy || !lastFile}
                          onClick={() => {
                            if (!lastFile) return;
                            setDateOrder(order);
                            void upload(lastFile, data.header.used ? "present" : "absent", {
                              date_order: order,
                              column_names: columnNames,
                              type_overrides: Object.fromEntries(
                                columnNames.flatMap((name, index) =>
                                  columnTypes[index] === "auto" ? [] : [[name, columnTypes[index]]],
                                ),
                              ),
                            });
                          }}
                        >
                          {order === "dmy" ? "Day / month / year" : "Month / day / year"}
                        </button>
                      ))}
                    </section>
                  )}
                  {data.header.mode === "auto" && (
                    <section className="header-notice" role="status">
                      <CircleAlert size={20} />
                      <div>
                        <strong>Confirm how row 1 was read</strong>
                        <p>
                          {data.header.used
                            ? `We treated row 1 as column names: ${data.columns.slice(0, 3).map((item) => item.name).join(", ")}.`
                            : `We kept row 1 as data and generated neutral column names.`}
                        </p>
                      </div>
                      <button
                        disabled={busy || !lastFile}
                        onClick={() => lastFile && void upload(lastFile, data.header.used ? "present" : "absent")}
                      >
                        This is correct
                      </button>
                      <button
                        disabled={busy || !lastFile}
                        onClick={() => lastFile && void upload(lastFile, data.header.used ? "absent" : "present")}
                      >
                        {data.header.used ? "Row 1 is data" : "Row 1 is headers"}
                      </button>
                    </section>
                  )}
                  {lastFile && (
                    <SchemaSetup
                      data={data}
                      names={columnNames}
                      types={columnTypes}
                      markers={markerText}
                      onMarkers={setMarkerText}
                      keyColumns={keyColumns}
                      onKey={(name, checked) =>
                        setKeyColumns((current) =>
                          checked
                            ? [...current, name].slice(0, 5)
                            : current.filter((item) => item !== name),
                        )
                      }
                      dateOrder={dateOrder || data.provenance.date_order}
                      onDateOrder={setDateOrder}
                      busy={busy}
                      onName={(index, value) =>
                        setColumnNames(
                          columnNames.map((name, item) =>
                            item === index ? value : name,
                          ),
                        )
                      }
                      onType={(index, value) =>
                        setColumnTypes(
                          columnTypes.map((type, item) =>
                            item === index ? value : type,
                          ),
                        )
                      }
                      onApply={() => {
                        const overrides = Object.fromEntries(
                          columnNames.flatMap((name, index) =>
                            columnTypes[index] === "auto"
                              ? []
                              : [[name, columnTypes[index]]],
                          ),
                        );
                        void upload(
                          lastFile,
                          data.header.used ? "present" : "absent",
                          {
                            column_names: columnNames,
                            type_overrides: overrides,
                            missing_markers: parseMarkers(markerText),
                            business_key: keyColumns,
                            date_order: dateOrder || undefined,
                          },
                        );
                      }}
                    />
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
                    <ChartBoundary><Suspense fallback={<p>Loading charts…</p>}>
                      <Charts data={data} column={column} />
                    </Suspense></ChartBoundary>
                  )}
                  {lastFile && (
                    <UploadPolicy
                      value={governance}
                      authorized={authorized}
                      ready={governanceReady}
                      busy={busy}
                      saved={Boolean(
                        data.governance.declared.owner &&
                          data.governance.declared.purpose,
                      )}
                      onChange={setGovernance}
                      onAuthorized={setAuthorized}
                      onSave={() => {
                        const overrides = Object.fromEntries(
                          columnNames.flatMap((name, index) =>
                            columnTypes[index] === "auto"
                              ? []
                              : [[name, columnTypes[index]]],
                          ),
                        );
                        void upload(
                          lastFile,
                          data.header.used ? "present" : "absent",
                          {
                            column_names: columnNames,
                            type_overrides: overrides,
                            business_rules: businessRules,
                          },
                        );
                      }}
                    />
                  )}
                  <GovernancePanel
                    data={data}
                    rules={businessRules}
                    auditEvents={auditEvents}
                    busy={busy}
                    canApprove={
                      data.executive.status === "Ready for exploration" &&
                      data.business_rules.configured &&
                      data.business_rules.passed &&
                      data.header.mode !== "auto" &&
                      governanceReady &&
                      Boolean(data.governance.declared.owner) &&
                      auditEvents.some((event) => event.action === "analysis.reviewed")
                    }
                    onRule={(name, rule) =>
                      setBusinessRules((rules) => ({ ...rules, [name]: rule }))
                    }
                    onLoadRules={setBusinessRules}
                    onApplyRules={() => {
                      if (!lastFile) return;
                      const overrides = Object.fromEntries(
                        columnNames.flatMap((name, index) =>
                          columnTypes[index] === "auto"
                            ? []
                            : [[name, columnTypes[index]]],
                        ),
                      );
                      void upload(
                        lastFile,
                        data.header.used ? "present" : "absent",
                        {
                          column_names: columnNames,
                          type_overrides: overrides,
                          business_rules: businessRules,
                        },
                      );
                    }}
                    onAudit={(action, note) =>
                      void recordAudit(action, note)
                    }
                  />
                </>
              )}
              {tab === "Issues" && <IssueExplorer data={data} />}
              {tab === "Summary" && (
                <GroupSummary
                  data={data}
                  by={groupBy.by}
                  measure={groupBy.measure}
                  busy={busy}
                  onChange={(by, measure) => setGroupBy({ by, measure })}
                  onApply={() => {
                    if (!lastFile) return;
                    void upload(lastFile, data.header.used ? "present" : "absent", {
                      column_names: columnNames,
                      type_overrides: Object.fromEntries(
                        columnNames.flatMap((name, index) =>
                          columnTypes[index] === "auto" ? [] : [[name, columnTypes[index]]],
                        ),
                      ),
                      group_by: { by: groupBy.by, measure: groupBy.measure || undefined },
                    });
                  }}
                />
              )}
              {tab === "Compare" && other && (
                <Compare base={data} other={other} onClose={() => { setOther(null); setTab("Overview"); }} />
              )}
              {tab === "Data quality" && (
                <>
                  <Quality data={data} />
                  <section className="panel">
                    <h2>Column health</h2>
                    <p className="muted">
                      A type is inferred only when it has a clear majority.
                      Empty cells are excluded from type checks.
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
                              "Outliers",
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
                                {c.format && <span className="badge">{c.format}</span>}
                                {c.pattern && (
                                  <span className="badge">
                                    {c.pattern === "thai_national_id" ? "Thai ID (personal data)" : "Thai phone (personal data)"}
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
                  <ChartBoundary><Suspense fallback={<p>Loading charts…</p>}>
                    <Charts data={data} column={column} />
                  </Suspense></ChartBoundary>
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
function SchemaSetup({
  data,
  names,
  types,
  markers,
  onMarkers,
  keyColumns,
  onKey,
  dateOrder,
  onDateOrder,
  busy,
  onName,
  onType,
  onApply,
}: {
  data: Analysis;
  names: string[];
  types: string[];
  markers: string;
  onMarkers: (value: string) => void;
  keyColumns: string[];
  onKey: (name: string, checked: boolean) => void;
  dateOrder: "dmy" | "mdy";
  onDateOrder: (value: "dmy" | "mdy") => void;
  busy: boolean;
  onName: (index: number, value: string) => void;
  onType: (index: number, value: string) => void;
  onApply: () => void;
}) {
  const duplicateNames = new Set(
    names.filter((name, index) => names.indexOf(name) !== index),
  );
  const invalid = names.some((name) => !name.trim()) || duplicateNames.size > 0;
  return (
    <details className="panel schema-setup" open={data.header.generated_names}>
      <summary>
        <span>
          <strong>Dataset setup</strong>
          <small>
            Name columns and confirm how each field should be treated.
          </small>
        </span>
        <span>
          {data.header.configured_names ? "Configured" : "Review schema"}
        </span>
      </summary>
      <div className="schema-grid">
        {data.columns.map((column, index) => (
          <div className="schema-row" key={`${column.name}-${index}`}>
            <label htmlFor={`column-name-${index}`}>Column {index + 1}</label>
            <input
              id={`column-name-${index}`}
              value={names[index] ?? ""}
              onChange={(event) => onName(index, event.target.value)}
              aria-invalid={
                !names[index]?.trim() || duplicateNames.has(names[index])
              }
            />
            <select
              aria-label={`Type for column ${index + 1}`}
              value={types[index] ?? "auto"}
              onChange={(event) => onType(index, event.target.value)}
            >
              {schemaTypes.map((type) => (
                <option value={type} key={type}>
                  {type === "auto" ? `Auto (${column.inferred_type})` : type}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <fieldset className="key-setup">
        <legend>Business key (optional, up to 5 columns)</legend>
        <p>
          Columns that together identify one record, such as an order number.
          Rows that repeat the key are reported even if other values differ.
        </p>
        <div className="key-options">
          {data.columns.map((column) => (
            <label key={column.name}>
              <input
                type="checkbox"
                checked={keyColumns.includes(column.name)}
                disabled={!keyColumns.includes(column.name) && keyColumns.length >= 5}
                onChange={(event) => onKey(column.name, event.target.checked)}
              />
              {column.name}
            </label>
          ))}
        </div>
        <label className="date-order">
          Dates written as 05/06/2024 mean
          <select
            value={dateOrder}
            onChange={(event) => onDateOrder(event.target.value as "dmy" | "mdy")}
          >
            <option value="dmy">5 June 2024 (day / month / year)</option>
            <option value="mdy">6 May 2024 (month / day / year)</option>
          </select>
        </label>
      </fieldset>
      <div className="marker-setup">
        <label htmlFor="missing-markers">
          Treat these values as missing (comma-separated)
        </label>
        <input
          id="missing-markers"
          value={markers}
          onChange={(event) => onMarkers(event.target.value)}
          placeholder="For example, NA, N/A, null, -"
        />
        <button type="button" onClick={() => onMarkers(MARKER_PRESET.join(", "))}>
          Use common markers
        </button>
        <small>
          Matching ignores case. Without markers only empty cells count as
          missing.
        </small>
      </div>
      {invalid && (
        <p role="alert" className="schema-error">
          Every column needs a unique name.
        </p>
      )}
      <div className="schema-actions">
        <p>
          Applying this setup reanalyzes the original file in this browser
          session.
        </p>
        <button
          className="primary"
          disabled={busy || invalid}
          onClick={onApply}
        >
          Apply dataset setup
        </button>
      </div>
    </details>
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
      {data.executive.signals.map((signal) => (
        <p className="signal" key={signal}>
          <BarChart3 size={15} /> {signal}
        </p>
      ))}
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
