import { getLanguage, setLanguage, t, tError, tf, tStatus, type Lang } from "./i18n";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Aperture,
  ArrowUpRight,
  BarChart3,
  Check,
  CircleAlert,
  Database,
  Printer,
  FileSpreadsheet,
  Moon,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { Analysis, BusinessRule, FollowUp, FollowUps, SheetSummary } from "./types";
import { buildSnapshot, downloadSnapshot, isSnapshotName, parseSnapshot } from "./snapshot";
import { forgetSettings, loadSettings, saveSettings, type SavedSettings } from "./savedSettings";
import SheetOverview from "./SheetOverview";
import { allowedFile, checkSentSize, MAX_TEXT_MB, MAX_UPLOAD_MB, prepareUpload } from "./upload";
import { RulesPanel } from "./Rules";
import { downloadExecutiveReport, printExecutiveReport } from "./report";
import ChartBoundary from "./ChartBoundary";
import Compare from "./Compare";
import IssueExplorer from "./IssueExplorer";
import GroupSummary from "./GroupSummary";
const Charts = lazy(() => import("./Charts"));
const baseTabs = ["Overview", "Data quality", "Issues", "Summary", "Explore", "Data preview"] as const;
type SchemaOptions = {
  column_names?: string[];
  type_overrides?: Record<string, string>;
  business_rules?: Record<string, BusinessRule>;
  missing_markers?: string[];
  sheet?: string;
  header_row?: number | null;
  date_order?: "dmy" | "mdy";
  year_era?: "be" | "ce";
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
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = window.localStorage.getItem("datalens.lang");
      return saved === "th" || saved === "en" ? saved : "en";
    } catch {
      return "en";
    }
  });
  // Set before children render so every t() call in this pass uses the chosen language.
  setLanguage(lang);
  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      window.localStorage.setItem("datalens.lang", lang);
    } catch {
      /* the choice then lasts for this visit only */
    }
  }, [lang]);
  const [page, setPage] = useState(0);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [columnNames, setColumnNames] = useState<string[]>([]);
  const [columnTypes, setColumnTypes] = useState<string[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [businessRules, setBusinessRules] = useState<
    Record<string, BusinessRule>
  >({});
  const [markerText, setMarkerText] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState("");
  const [dateOrder, setDateOrder] = useState<"" | "dmy" | "mdy">("");
  const [keyColumns, setKeyColumns] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState({ by: "", measure: "" });
  const [yearEra, setYearEra] = useState<"" | "be" | "ce">("");
  const [followUps, setFollowUps] = useState<FollowUps>({});
  const [sheetOverview, setSheetOverview] = useState<SheetSummary[]>([]);
  const [snapshotInfo, setSnapshotInfo] = useState("");
  const [restored, setRestored] = useState(false);
  const [other, setOther] = useState<Analysis | null>(null);
  const compareInput = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const uploadTrigger = useRef<HTMLButtonElement>(null);
  async function requestAnalysis(
    file: File,
    headerMode: "auto" | "present" | "absent",
    schema?: SchemaOptions,
    attested: boolean = authorized,
  ): Promise<Analysis> {
    const body = new FormData();
    const toSend = await prepareUpload(file);
    checkSentSize(toSend);
    body.append("file", toSend);
    body.append(
      "schema",
      JSON.stringify({
        ...schema,
        authorized_to_process: attested,
        business_rules: schema?.business_rules ?? businessRules,
        missing_markers: schema?.missing_markers ?? parseMarkers(markerText),
        sheet: schema?.sheet,
        header_row:
          schema?.header_row === null
            ? undefined
            : (schema?.header_row ?? (headerRow ? Number(headerRow) : undefined)),
        date_order: schema?.date_order ?? (dateOrder || undefined),
        year_era: schema?.year_era ?? (yearEra || undefined),
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
  const validFile = allowedFile;
  async function downloadWithoutColumns(columns: string[]) {
    if (busy || !lastFile || !columns.length) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      const toSend = await prepareUpload(lastFile);
      checkSentSize(toSend);
      body.append("file", toSend);
      body.append(
        "schema",
        JSON.stringify({
          authorized_to_process: authorized,
          drop_columns: columns,
          sheet: data?.provenance.sheet ?? undefined,
          header_row: data?.provenance.header_row && data.provenance.header_row > 1 ? data.provenance.header_row : undefined,
        }),
      );
      const response = await fetch(`/api/redact?header_mode=${data?.header.used ? "present" : "absent"}`, {
        method: "POST",
        body,
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({ detail: "Could not create the copy. Please try again." }));
        throw new Error(typeof failure.detail === "string" ? failure.detail : "Could not create the copy. Please try again.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${lastFile.name.replace(/\.[a-z0-9]+$/i, "")}-without-personal-columns.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the copy. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function compareWith(file: File) {
    if (busy || !data) return;
    if (!validFile(file)) {
      setError(`Choose a CSV, XLSX or JSON file no larger than ${MAX_TEXT_MB} MB.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      setOther(isSnapshotName(file.name) ? parseSnapshot(await file.text()).analysis : await requestAnalysis(file, "auto"));
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
    attested: boolean = authorized,
  ) {
    if (busy) return;
    if (!attested) {
      setError("Confirm that you are allowed to upload this file before analysis.");
      return;
    }
    if (!validFile(file)) {
      setError(`Choose a CSV, XLSX or JSON file no larger than ${MAX_TEXT_MB} MB.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const fresh = file !== lastFile;
      const remembered = fresh && !schema ? loadSettings(file.name) : null;
      const attempt = (extra: SavedSettings | null) =>
        requestAnalysis(
          file,
          headerMode,
          {
            ...schema,
            ...extra,
            sheet: schema?.sheet ?? extra?.sheet ?? (fresh ? undefined : sheetName || undefined),
            ...(fresh
              ? { business_key: schema?.business_key ?? extra?.business_key ?? [], group_by: extra?.group_by ?? null }
              : {}),
          },
          attested,
        );
      let result: Analysis;
      let used: SavedSettings | null = remembered;
      try {
        result = await attempt(remembered);
      } catch (caught) {
        if (!remembered) throw caught;
        // Remembered choices no longer fit this file; start from the defaults.
        forgetSettings(file.name);
        used = null;
        result = await attempt(null);
      }
      setRestored(Boolean(used));
      if (used) {
        setHeaderRow(used.header_row ? String(used.header_row) : "");
        setDateOrder(used.date_order ?? "");
        setYearEra(used.year_era ?? "");
        setMarkerText((used.missing_markers ?? []).join(", "));
      }
      setSheetName(result.provenance.sheet ?? "");
      if (schema?.business_key) setKeyColumns(schema.business_key);
      if (fresh || schema?.sheet || schema?.header_row) {
        setKeyColumns(schema?.business_key ?? used?.business_key ?? []);
        setGroupBy(
          used?.group_by
            ? { by: used.group_by.by, measure: used.group_by.measure ?? "" }
            : { by: "", measure: "" },
        );
      }
      if (fresh || schema?.header_row) {
        setSheetOverview([]);
      }
      if (fresh) {
        setBusinessRules({});
        setFollowUps({});
      }
      setSnapshotInfo("");
      const nextSettings: SavedSettings = {};
      const effectiveHeader = schema?.header_row ?? used?.header_row ?? (headerRow ? Number(headerRow) : undefined);
      if (effectiveHeader) nextSettings.header_row = effectiveHeader;
      const effectiveOrder = schema?.date_order ?? used?.date_order ?? (dateOrder || undefined);
      if (effectiveOrder) nextSettings.date_order = effectiveOrder;
      const effectiveEra = schema?.year_era ?? used?.year_era ?? (yearEra || undefined);
      if (effectiveEra) nextSettings.year_era = effectiveEra;
      const effectiveKey = fresh ? (schema?.business_key ?? used?.business_key ?? []) : (schema?.business_key ?? keyColumns);
      if (effectiveKey.length) nextSettings.business_key = effectiveKey;
      const effectiveMarkers = schema?.missing_markers ?? used?.missing_markers ?? parseMarkers(markerText);
      if (effectiveMarkers.length) nextSettings.missing_markers = effectiveMarkers;
      if ((result.provenance.sheets?.length ?? 0) > 1 && result.provenance.sheet) {
        nextSettings.sheet = result.provenance.sheet;
      }
      const effectiveGroup =
        schema?.group_by === null
          ? undefined
          : (schema?.group_by ?? (fresh ? used?.group_by : groupBy.by ? { by: groupBy.by, measure: groupBy.measure || undefined } : undefined));
      if (effectiveGroup) nextSettings.group_by = effectiveGroup;
      saveSettings(file.name, nextSettings);
      setData(result);
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
  async function trySample(path: string, type: string) {
    if (busy) return;
    try {
      const response = await fetch(`/samples/${path}`);
      if (!response.ok) throw new Error("sample");
      const blob = await response.blob();
      setAuthorized(true);
      await upload(new File([blob], path, { type }), "auto", undefined, true);
    } catch {
      setError("The sample file could not be loaded. Please try again.");
    }
  }
  async function openSnapshot(file: File) {
    if (busy) return;
    setError("");
    try {
      const snapshot = parseSnapshot(await file.text());
      const result = snapshot.analysis;
      setData(result);
      setOther(null);
      setLastFile(null);
      setFollowUps(snapshot.follow_ups);
      setSheetOverview(snapshot.sheet_overview);
      setSheetName(result.provenance.sheet ?? "");
      setColumnNames(result.columns.map((item) => item.name));
      setColumnTypes(result.columns.map((item) => (item.type_overridden ? item.type : "auto")));
      setSelected(result.columns.find((c) => c.type === "numeric")?.name ?? result.columns[0].name);
      setRestored(false);
      setPage(0);
      setTab("Overview");
      setSnapshotInfo(snapshot.saved_at);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This is not a DataLens snapshot file.");
    } finally {
      if (input.current) input.current.value = "";
    }
  }
  function routeFile(file: File) {
    if (isSnapshotName(file.name)) void openSnapshot(file);
    else void upload(file);
    if (input.current) input.current.value = "";
  }
  async function analyzeAllSheets() {
    const names = data?.provenance.sheets;
    if (busy || !lastFile || !names) return;
    setBusy(true);
    setError("");
    try {
      const rows: SheetSummary[] = [];
      for (const name of names.slice(0, 12)) {
        try {
          const result = await requestAnalysis(lastFile, "auto", {
            sheet: name,
            header_row: null,
            business_rules: {},
            business_key: [],
            group_by: null,
          });
          rows.push({
            sheet: name,
            rows: result.rows,
            columns: result.column_count,
            status: result.executive.status,
            issues: result.executive.issue_count,
            scores: result.scores,
          });
        } catch (caught) {
          rows.push({
            sheet: name,
            rows: 0,
            columns: 0,
            status: "",
            issues: 0,
            scores: {},
            error: caught instanceof Error ? caught.message : "Could not analyze this sheet.",
          });
        }
      }
      setSheetOverview(rows);
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
    setYearEra("");
    setFollowUps({});
    setSheetOverview([]);
    setSnapshotInfo("");
    setRestored(false);
    setLastFile(null);
    setColumnNames([]);
    setColumnTypes([]);
    setBusinessRules({});
    setAuthorized(false);
    setSelected("");
    setPage(0);
    setError("");
    if (input.current) input.current.value = "";
    window.setTimeout(() => uploadTrigger.current?.focus(), 0);
  }
  const column = data?.columns.find((c) => c.name === selected);
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
        >{t("← Back to Nexus")}</a>
        <div className="workspace-label">{t("WORKSPACE")}</div>
        <div className="nav-active">
          <Database size={18} />{t("Dataset explorer")}</div>
        <div className="side-note">
          <span className="status-dot" />{t("Session workspace")}<p>{t("Session-only analysis.")}<br />{t("No dataset history is kept.")}</p>
        </div>
        <div className="side-bottom">{t("A clearer view of your data.")}<br />
          <span>Simple analysis · v0.8.0</span>
        </div>
      </aside>
      <main>
        <header>
          <a
            className="mobile-home"
            href="https://nexus-lemon-eight-32.vercel.app/projects"
            aria-label={t("Back to Nexus All")}
          >
            <Aperture size={22} aria-hidden="true" />
            <span>DataLens</span>
          </a>
          <div className="breadcrumb">{t("Workspace")}<span>/</span>{t("Dataset explorer")}</div>
          <div className="header-actions">
            <button
              className="icon-button lang-toggle"
              aria-label={lang === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย"}
              onClick={() => setLang(lang === "th" ? "en" : "th")}
            >
              {lang === "th" ? "EN" : "ไทย"}
            </button>
            <button
              className="icon-button"
              aria-label={t(dark ? "Use light theme" : "Use dark theme")}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">{t("DATASET EXPLORER")}</div>
              <h1>{t("Good insights start")}<br className="mobile-break" />{t("with good data.")}</h1>
              <p>{t("Understand your schema, spot gaps, and explore what matters.")}</p>
            </div>
            {data && (
              <button
                ref={uploadTrigger}
                className="primary"
                disabled={busy}
                onClick={() => (authorized ? input.current?.click() : clearDataset())}
              >
                <Upload size={17} />
                {t("Upload file")}
              </button>
            )}
          </div>
          <input
            ref={input}
            type="file"
            accept=".csv,.xlsx,.json,.jsonl,.ndjson,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            aria-label={t("Upload CSV file")}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) routeFile(f);
            }}
          />
          <input
            ref={compareInput}
            type="file"
            accept=".csv,.xlsx,.json,.jsonl,.ndjson,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            aria-label={t("Choose a file to compare")}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void compareWith(f);
            }}
          />
          {error && (
            <div role="alert" className="error">
              {tError(error)}
              <button aria-label={t("Dismiss error")} onClick={() => setError("")}>
                <X size={18} />
              </button>
            </div>
          )}
          {busy && slow && (
            <div role="status" className="slow-notice">
              {t("Still working. The first analysis after a quiet period can take up to about 30 seconds while the service starts; later ones are much faster.")}
            </div>
          )}
          <div aria-live="polite" className="sr-only">
            {busy
              ? t("Analyzing your file")
              : data
                ? tf("{name} analyzed, {rows} rows", { name: data.filename, rows: data.rows })
                : ""}
          </div>
          {!data ? (
            <section
              className="upload-area"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) routeFile(f);
              }}
            >
              <div className="upload-icon">
                <FileSpreadsheet size={26} />
              </div>
              <h2>{t("Your next discovery starts here")}</h2>
              <p>{t("Drop a CSV, Excel (.xlsx) or JSON file here to explore its quality and structure.")}</p>
              <label className="authorization upload-authorization">
                <input
                  type="checkbox"
                  checked={authorized}
                  onChange={(event) => setAuthorized(event.target.checked)}
                />{t("I am allowed to analyze this file, and it contains no personal or sensitive data.")}</label>
              <p className="privacy-note">{t("Current release: use synthetic or confirmed non-personal data only. CSV bytes are sent to the analysis service and may be handled transiently by the hosting framework. DataLens does not intentionally persist the file.")}</p>
              <div className="upload-actions">
                <button
                  className="primary"
                  disabled={busy || !authorized}
                  onClick={() => input.current?.click()}
                >
                  {busy ? t("Analyzing…") : t("Choose a CSV file")}
                  <ArrowUpRight size={17} />
                </button>
              </div>
              {!authorized && <small className="hint">{t("Tick the box above to enable the buttons.")}</small>}
              <div className="samples" role="group" aria-label={t("Try a sample")}>
                <strong>{t("Try a sample")}</strong>
                <div>
                  <button disabled={busy} onClick={() => void trySample("sales-th.csv", "text/csv")}>
                    {t("Thai sales (CSV)")}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void trySample("orders.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                    }
                  >
                    {t("Orders workbook (Excel, 2 sheets)")}
                  </button>
                  <button disabled={busy} onClick={() => void trySample("orders.json", "application/json")}>
                    {t("Orders records (JSON)")}
                  </button>
                </div>
              </div>
              <small>
                {tf("CSV or JSON up to {text} MB, Excel up to {mb} MB · 100,000 rows · 100 columns", { text: MAX_TEXT_MB, mb: MAX_UPLOAD_MB })}
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
                    {tf("{rows} rows · {columns} columns", { rows: fmt(data.rows), columns: data.column_count })}
                  </p>
                </div>
                <div className="file-actions">
                  <button className="report-button" onClick={clearDataset}>
                    <Trash2 size={15} />{t("Clear dataset")}</button>
                  <button
                    className="report-button"
                    disabled={busy}
                    onClick={() => compareInput.current?.click()}
                  >
                    <FileSpreadsheet size={15} />{t("Compare with a file or snapshot")}</button>
                  <button
                    className="report-button"
                    onClick={() => downloadExecutiveReport(data, { followUps, sheets: sheetOverview })}
                  >
                    <Upload size={15} /> {t("Export summary for sharing")}
                  </button>
                  <button
                    className="report-button"
                    onClick={() => {
                      if (!printExecutiveReport(data, { followUps, sheets: sheetOverview })) {
                        setError("Your browser blocked the report window. Allow pop-ups for this site and try again.");
                      }
                    }}
                  >
                    <Printer size={15} /> {t("Print / Save as PDF")}
                  </button>
                  <button
                    className="report-button"
                    onClick={() => downloadSnapshot(buildSnapshot(data, followUps, sheetOverview))}
                  >
                    <Upload size={15} /> {t("Save snapshot")}
                  </button>
                  <span className="analyzed">
                    <Check size={14} />{t("Analysis complete")}</span>
                </div>
              </div>
              <div className="provenance-strip" role="status">
                <strong>{t("Uploaded source file")}</strong>
                <span>
                  {t("All displayed values and metrics derive from this file; no data rows or values were invented.")}
                </span>
                <small>
                  {tf("SHA-256 {hash}… · Method v{version} · {source} · {bytes} bytes", {
                    hash: data.provenance.sha256.slice(0, 12),
                    version: data.provenance.method_version,
                    source:
                      data.provenance.source_format === "xlsx"
                        ? tf("Excel sheet “{sheet}”", { sheet: data.provenance.sheet ?? "" })
                        : data.provenance.source_format === "json"
                          ? t("JSON records")
                          : `${data.provenance.encoding} · ${data.provenance.delimiter}`,
                    bytes: fmt(data.provenance.input_bytes),
                  })}
                </small>
              </div>
              <nav className="tabs" aria-label={t("Dataset views")}>
                {(other ? [...baseTabs, "Compare" as const] : [...baseTabs]).map((name) => (
                  <button
                    key={name}
                    aria-current={tab === name ? "page" : undefined}
                    className={tab === name ? "active" : ""}
                    onClick={() => setTab(name)}
                  >
                    {t(name)}
                  </button>
                ))}
              </nav>
              {tab === "Overview" && (
                <>
                  {snapshotInfo && (
                    <section className="header-notice" role="status">
                      <FileSpreadsheet size={20} />
                      <div>
                        <strong>{t("Opened from a saved snapshot")}</strong>
                        <p>
                          {tf("Saved {when}. The original file is not here, so settings cannot be changed and the analysis cannot be re-run; open the file again to do that.", {
                            when: snapshotInfo === "-" ? "" : new Date(snapshotInfo).toLocaleString(),
                          })}
                        </p>
                      </div>
                    </section>
                  )}
                  {restored && lastFile && (
                    <section className="header-notice" role="status">
                      <Check size={20} />
                      <div>
                        <strong>{t("Settings from last time were applied")}</strong>
                        <p>{t("Header row, business key, date order and similar choices you made for a file with this name were reused. They are kept in this browser only.")}</p>
                      </div>
                      <button
                        onClick={() => {
                          forgetSettings(lastFile.name);
                          setRestored(false);
                        }}
                      >
                        {t("Don't remember these")}
                      </button>
                    </section>
                  )}
                  {data.columns.some((item) => item.pattern) && (
                    <section className="header-notice" role="status">
                      <CircleAlert size={20} />
                      <div>
                        <strong>{t("Personal data was found")}</strong>
                        <p>
                          {tf("These columns look like national ID or phone numbers: {names}. Remove them before sending the file.", {
                            names: data.columns.filter((item) => item.pattern).map((item) => item.name).join(", "),
                          })}
                        </p>
                      </div>
                      {lastFile && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void downloadWithoutColumns(data.columns.filter((item) => item.pattern).map((item) => item.name))
                          }
                        >
                          {t("Download a copy without these columns (CSV)")}
                        </button>
                      )}
                    </section>
                  )}
                  <ExecutiveBrief data={data} />
                  {data.provenance.sheets && data.provenance.sheets.length > 1 && (
                    <section className="header-notice" role="status">
                      <FileSpreadsheet size={20} />
                      <div>
                        <strong>{tf("This workbook has {count} sheets", { count: data.provenance.sheets.length })}</strong>
                        <p>{t("Each sheet is analyzed on its own. Choose the sheet to analyze.")}</p>
                      </div>
                      <select
                        aria-label={t("Worksheet")}
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
                      {!sheetOverview.length && (
                        <button disabled={busy || !lastFile} onClick={() => void analyzeAllSheets()}>
                          {t("Analyze all sheets")}
                        </button>
                      )}
                    </section>
                  )}
                  {sheetOverview.length > 0 && (
                    <SheetOverview
                      sheets={sheetOverview}
                      current={data.provenance.sheet ?? ""}
                      busy={busy}
                      canOpen={Boolean(lastFile)}
                      onOpen={(name) => {
                        if (!lastFile) return;
                        setBusinessRules({});
                        void upload(lastFile, "auto", { sheet: name, business_rules: {} });
                      }}
                    />
                  )}
                  {data.provenance.header_row_suggestion &&
                    data.provenance.header_row !== data.provenance.header_row_suggestion && (
                    <section className="header-notice" role="status">
                      <CircleAlert size={20} />
                      <div>
                        <strong>
                          {tf("Row {row} looks like the column names", { row: data.provenance.header_row_suggestion })}
                        </strong>
                        <p>{t("Rows above it look like a title or notes, so they are being read as data.")}</p>
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
                        {tf("Use row {row} as headers", { row: data.provenance.header_row_suggestion })}
                      </button>
                    </section>
                  )}
                  {data.provenance.date_order_ambiguous && (
                    <section className="header-notice" role="status">
                      <CircleAlert size={20} />
                      <div>
                        <strong>{t("Confirm how dates like 05/06/2024 are written")}</strong>
                        <p>{t("Every date could be read either way, so day/month was assumed.")}</p>
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
                  {data.provenance.two_digit_years > 0 && !data.provenance.year_era && (
                    <section className="header-notice" role="status">
                      <CircleAlert size={20} />
                      <div>
                        <strong>{tf("{count} dates have a two-digit year", { count: data.provenance.two_digit_years })}</strong>
                        <p>{t("A year such as 67 could be 2567 (Buddhist Era) or 1967 / 2067, so these dates were not read. Choose how they are written.")}</p>
                      </div>
                      {(["be", "ce"] as const).map((era) => (
                        <button
                          key={era}
                          disabled={busy || !lastFile}
                          onClick={() => {
                            if (!lastFile) return;
                            setYearEra(era);
                            void upload(lastFile, data.header.used ? "present" : "absent", {
                              year_era: era,
                              column_names: columnNames,
                              type_overrides: Object.fromEntries(
                                columnNames.flatMap((name, index) =>
                                  columnTypes[index] === "auto" ? [] : [[name, columnTypes[index]]],
                                ),
                              ),
                            });
                          }}
                        >
                          {era === "be" ? t("Buddhist Era (67 = 2567)") : t("Christian Era (67 = 2067 or 1967)")}
                        </button>
                      ))}
                    </section>
                  )}
                  {data.header.mode === "auto" && (
                    <section className="header-notice" role="status">
                      <CircleAlert size={20} />
                      <div>
                        <strong>{t("Confirm how row 1 was read")}</strong>
                        <p>
                          {data.header.used
                            ? tf("We treated row 1 as column names: {names}.", { names: data.columns.slice(0, 3).map((item) => item.name).join(", ") })
                            : t("We kept row 1 as data and generated neutral column names.")}
                        </p>
                      </div>
                      <button
                        disabled={busy || !lastFile}
                        onClick={() => lastFile && void upload(lastFile, data.header.used ? "present" : "absent")}
                      >{t("This is correct")}</button>
                      <button
                        disabled={busy || !lastFile}
                        onClick={() => lastFile && void upload(lastFile, data.header.used ? "absent" : "present")}
                      >
                        {t(data.header.used ? "Row 1 is data" : "Row 1 is headers")}
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
                      [t("Total rows"), fmt(data.rows), t("Records in your dataset")],
                      [
                        t("Columns"),
                        fmt(data.column_count),
                        t("Automatically inferred"),
                      ],
                      [
                        t("Missing cells"),
                        fmt(data.missing),
                        tf("{pct}% of all cells", { pct: fmt((data.missing / (data.rows * data.column_count)) * 100) }),
                      ],
                      [
                        t("Duplicate rows"),
                        fmt(data.duplicates),
                        t("Beyond the first occurrence"),
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
                      <h2>{t("A closer look")}</h2>
                      <p>{t("Explore distributions and relationships in your dataset.")}</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setTab("Explore")}
                    >{t("Explore columns")}<ArrowUpRight size={16} />
                    </button>
                  </div>
                  {column && (
                    <ChartBoundary><Suspense fallback={<p>{t("Loading charts…")}</p>}>
                      <Charts data={data} column={column} />
                    </Suspense></ChartBoundary>
                  )}
                  <RulesPanel
                    data={data}
                    rules={businessRules}
                    busy={busy}
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
                  />
                </>
              )}
              {tab === "Issues" && (
                <IssueExplorer
                  data={data}
                  followUps={followUps}
                  onFollowUp={(kind: string, value: FollowUp) =>
                    setFollowUps((current) => ({ ...current, [kind]: value }))
                  }
                />
              )}
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
                    <h2>{t("Column health")}</h2>
                    <p className="muted">{t("A type is inferred only when it has a clear majority. Empty cells are excluded from type checks.")}</p>
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
                              <th key={h}>{t(h)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.columns.map((c) => (
                            <tr key={c.name}>
                              <td>{c.name}</td>
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
                  </section>
                </>
              )}
              {tab === "Explore" && column && (
                <>
                  <div className="section-title">
                    <div>
                      <h2>{t("Explore a column")}</h2>
                      <p>{t("Charts adapt to the inferred data type.")}</p>
                    </div>
                    <select
                      aria-label={t("Column to explore")}
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
                          <span>{t(k)}</span>
                          <strong>{fmt(v)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                  <ChartBoundary><Suspense fallback={<p>{t("Loading charts…")}</p>}>
                    <Charts data={data} column={column} />
                  </Suspense></ChartBoundary>
                </>
              )}
              {tab === "Data preview" && (
                <section className="panel">
                  <div className="section-title">
                    <div>
                      <h2>{t("Data preview")}</h2>
                      <p>
                        {tf("First {shown} of {total} rows · trimmed values · blanks shown as —", { shown: data.preview.length, total: fmt(data.rows) })}
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
                              <small>{t(c.type)}</small>
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
                      {tf("Page {page} of {pages}", { page: page + 1, pages: Math.ceil(data.preview.length / 10) })}
                    </span>
                    <button disabled={!page} onClick={() => setPage(page - 1)}>{t("Previous")}</button>
                    <button
                      disabled={(page + 1) * 10 >= data.preview.length}
                      onClick={() => setPage(page + 1)}
                    >{t("Next")}</button>
                  </div>
                </section>
              )}
            </>
          )}
          <footer>
            <span>
              <BarChart3 size={14} /> DataLens
            </span>
            <span>{t("Transparent metrics. No AI. Just your data.")}</span>
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
          <strong>{t("Dataset setup")}</strong>
          <small>{t("Name columns and confirm how each field should be treated.")}</small>
        </span>
        <span>
          {t(data.header.configured_names ? "Configured" : "Review schema")}
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
                  {type === "auto" ? tf("Auto ({type})", { type: t(column.inferred_type) }) : t(type)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <fieldset className="key-setup">
        <legend>{t("Business key (optional, up to 5 columns)")}</legend>
        <p>{t("Columns that together identify one record, such as an order number. Rows that repeat the key are reported even if other values differ.")}</p>
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
        <label className="date-order">{t("Dates written as 05/06/2024 mean")}<select
            value={dateOrder}
            onChange={(event) => onDateOrder(event.target.value as "dmy" | "mdy")}
          >
            <option value="dmy">5 June 2024 (day / month / year)</option>
            <option value="mdy">6 May 2024 (month / day / year)</option>
          </select>
        </label>
      </fieldset>
      <div className="marker-setup">
        <label htmlFor="missing-markers">{t("Treat these values as missing (comma-separated)")}</label>
        <input
          id="missing-markers"
          value={markers}
          onChange={(event) => onMarkers(event.target.value)}
          placeholder="For example, NA, N/A, null, -"
        />
        <button type="button" onClick={() => onMarkers(MARKER_PRESET.join(", "))}>{t("Use common markers")}</button>
        <small>{t("Matching ignores case. Without markers only empty cells count as missing.")}</small>
      </div>
      {invalid && (
        <p role="alert" className="schema-error">{t("Every column needs a unique name.")}</p>
      )}
      <div className="schema-actions">
        <p>{t("Applying this setup reanalyzes the original file in this browser session.")}</p>
        <button
          className="primary"
          disabled={busy || invalid}
          onClick={onApply}
        >{t("Apply dataset setup")}</button>
      </div>
    </details>
  );
}
function ExecutiveBrief({ data }: { data: Analysis }) {
  const executive = getLanguage() === "th" ? data.executive.thai : data.executive;
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
          <span className="eyebrow">{t("DATA CHECK")}</span>
          <h2 id="executive-title">{tStatus(data.executive.status)}</h2>
          <p>{executive.message}</p>
        </div>
        <div className="executive-count">
          <strong>{data.executive.issue_count}</strong>
          <span>{t("items to review")}</span>
        </div>
      </div>
      {executive.issues.length > 0 ? (
        <div className="issue-list">
          {executive.issues.map((issue) => (
            <article className="issue" key={issue.title}>
              <span className={`severity ${issue.severity}`}>
                {t(issue.severity)}
              </span>
              <div>
                <h3>{issue.title}</h3>
                <p>{issue.detail}</p>
                <small>
                  <strong>{t("Next:")}</strong> {issue.recommendation}
                </small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="no-issues">
          <Check size={17} />{t("No supported structural issues detected.")}</p>
      )}
      {executive.signals.map((signal) => (
        <p className="signal" key={signal}>
          <BarChart3 size={15} /> {signal}
        </p>
      ))}
      <p className="scope-note">{executive.scope_note}</p>
    </section>
  );
}
function Quality({ data }: { data: Analysis }) {
  return (
    <section className="panel quality">
      <div className="quality-summary">
        <span className="eyebrow">{t("DATA QUALITY")}</span>
        <div className="score">
          {fmt(data.scores.Overall ?? 0)}
          <span>/100</span>
        </div>
        <h3>{t("Overall score")}</h3>
        <p>{t("Equal-weight mean of available dimensions.")}</p>
      </div>
      <div className="quality-dimensions">
        {Object.entries(explanations).map(([name, description]) => (
          <div key={name}>
            <div className="dimension-title">
              <strong>{t(name)}</strong>
              <span>
                {data.scores[name] === null
                  ? "N/A"
                  : `${fmt(data.scores[name])}%`}
              </span>
            </div>
            <div className="track">
              <div style={{ width: `${data.scores[name] ?? 0}%` }} />
            </div>
            <p>{t(description)}</p>
          </div>
        ))}
      </div>
      <p className="quality-note">
        {t("Validity checks finite numbers and calendar dates; booleans must be true/false. Text has no domain rules. N/A dimensions are excluded. These scores do not establish real-world accuracy.")}
      </p>
    </section>
  );
}
