# Changelog

## Unreleased

- Snapshots: "Save snapshot" writes the finished analysis, follow-ups and sheet overview to a `.datalens.json` file. Anyone can open it from the home page (or by dropping it in) without the original file or any server storage.
- Follow-up plan: owner, due date and note per issue type, shown in the executive brief and included in the Excel issue list, JSON export and snapshot.
- All sheets: a workbook's sheets can be analyzed in one step and compared in a table (also in the brief); any sheet can be opened from it.
- Remembered settings per file name (header row, business key, date order, year era, missing markers, sheet, summary grouping), kept in the browser only, with a "Don't remember these" button.
- Two-digit years: the page reports them and the user chooses Buddhist Era or Christian Era instead of the app guessing.

- Try a sample: three fictional files (Thai sales CSV, two-sheet Excel workbook with a title row, nested JSON) can be opened from the home page to demonstrate every input type without uploading anything.
- More of the interface is translated in Thai mode: column types and formats, status and counts, chart captions, review-record text, form labels and accessible names.
- Outlier ranges in issue reasons use readable thousands-separated numbers; the printed brief spaces the "Where to act" tables.
- Documentation brought up to date: test checklist, operations, threat model and scoring rules no longer describe sign-in, and VALIDATION.md is marked historical.

- Excel export of the located issue list (summary and issue sheets) and of the group summary, generated in the browser without a spreadsheet library; text cells are never evaluated as formulas.
- "Print / Save as PDF" opens the executive brief and starts the print dialog. The brief's own print button used an inline handler that the site's content security policy blocks.
- European number formats (`1.234,50`, `1 234,50`, `12,5`; a lone `1,234` stays English thousands) and dates with month names in English and Thai (`5 Jan 2024`, `March 7, 2024`, `9 มกราคม 2567`, `10 ก.พ. 2567`).
- Thai translations for the remaining status text, counts and server error messages.
- Performance: per-value work now runs once per distinct value. A 100,000-row, 8-column, 4 MB file takes about 5.6 s locally and about 22 s on the hosted service, inside the 60 s limit; the cold-start notice now says about 30 seconds.

- Thai interface: a language switch (EN / ไทย, remembered in the browser) translates the workspace, tabs, issue locations, summary, comparison and governance panels, plus issue reasons and the exported executive brief. The server returns the executive summary in both languages (`executive.thai`); the canonical English `status` still drives approval.

- Numbers: thousands separators (`1,234.50`), currency (`฿100`, `$2,000`, `300 บาท`), percent (`15%`, kept at face value) and accounting negatives (`(500)`) are numeric, with statistics, outliers and min/max rules. Malformed look-alikes stay text.
- Dates: day-first by default; month-first is used when the data proves it (a second part above 12). Files where every date could be read either way are flagged and the user can confirm the order.
- Header row: choose which row holds the column names (report titles above the table); workbooks suggest it automatically.
- Business key: pick up to 5 columns; rows that repeat the key (with all key cells filled) are reported as a high-priority finding even when other values differ.
- Summary by group: rows, sum, average, min and max of a numeric measure per value of a column (top 50 groups), exportable to CSV.
- Compare now shows issue resolution by type (resolved, new, unchanged) and the status change.
- Performance: a 100,000-row, 10-column file (about 5 MB) analyzes in about 6 seconds locally.

- Accept JSON (array of records, an object wrapping one array, or JSON Lines); nested objects are flattened to dotted columns and arrays kept as JSON text.
- Choose any worksheet of an Excel workbook; the workbook's sheet list is recorded in provenance.
- Locate problems: every missing, duplicate, type-conflict, invalid, outlier and business-rule finding lists its row (matching the original file numbering) or record, column, value and reason. Totals are exact; up to 1,000 examples per kind are returned.
- New Issues tab with filters and export of the issue list to CSV (UTF-8 BOM for Excel, spreadsheet-formula safe) and JSON; the executive brief gains a "Where to act" section.

- Accept real-world exports: UTF-8 (with or without BOM), UTF-16, and Thai Windows-874 files are decoded deterministically; comma, semicolon, tab, and pipe delimiters are detected instead of rejected.
- Record the detected encoding and delimiter in the provenance record, on-screen strip, and executive brief.
- Recognize and validate dates written YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY (day first), with optional time, and Buddhist Era years (2400+, converted by subtracting 543).
- Read Excel `.xlsx` workbooks (first sheet, cached values only; formulas, macros and external links are never evaluated; 50 MB decompressed cap).
- Add user-defined missing markers (for example `NA`, `N/A`, `-`), recorded in provenance; default behavior is unchanged.
- Report the exact rows with the wrong number of fields instead of a generic error.
- Detect Thai national ID (13 digits with check-digit validation) and Thai phone columns; flag them as possible personal data (high priority, blocks approval) and count bad ID check digits as invalid.
- Add a records-over-time chart with empty-period count for the first date column.
- Add in-browser comparison of two files and browser-local rule templates (column names and thresholds only).
- Recognize non-ASCII (for example Thai) header rows.

## 0.8.0 — No sign-in (2026-10-30)

- Remove the Nexus/Supabase login. Analysis, review, and approval no longer need an account; only Nexus Main uses accounts.
- Audit events and the exported brief no longer name an actor; approval no longer needs an approver role.
- Drop the Supabase client, token verification, and httpx/httpcore/certifi from the production bundle.
- Explain slow first requests after a serverless cold start, reload once when a deploy removes a lazy chunk, and enlarge phone touch targets.
- Add robots.txt and a favicon; clear the certifi and dev-tool dependency advisories.

## 0.6.1 — Release reliability addendum (2026-09-08)

- Declare Uvicorn as a runtime dependency so local browser validation and CI start the FastAPI service deterministically.
- Update FastAPI dependency annotations for current type and lint tooling.
- Preserve a clear client error when business rules are not an object.
- Revalidate frontend build, browser workflow, backend tests, lint, and dependency audits before the Nexus executive release.

## 0.5.2 — Exact Tukey fences

- Apply the 1.5×IQR rule when IQR is zero instead of skipping minority values outside the collapsed fence.
- Add a regression case for a mostly constant numeric column.

## 0.5.1 — Embedded-field detection

- Flag repeated pipe delimiters that suggest multiple business fields were exported into one CSV column.
- Keep the numeric quality score separate while changing executive readiness to `Review needed`.
- Verify production calculations independently against `Products.csv` and the Looker Studio milk dataset.

## 0.5.0 — Verifiable source provenance

- Remove the fictional dataset from the production user flow; retain one clearly marked repository fixture for developer tests only.
- Identify uploaded files separately and state that displayed values and metrics derive from that file.
- Add an SHA-256 input fingerprint, byte and row counts, deterministic method version, and a no-generated-values declaration to every analysis response.
- Carry the provenance record into the downloadable executive report.
- Replace relationship wording with the precise observed Pearson coefficient description.

## 0.4.0 — Portable executive brief

- Export a self-contained HTML executive brief directly in the browser.
- Include the readiness decision, quality scorecard, priority findings, analytical signals, outlier evidence, and method limits.
- Add print styling so the exported brief can be saved as PDF without another service receiving the dataset.

## 0.3.0 — Governed schema and deeper evidence

- Let users name columns and override inferred types, then reanalyze the unchanged source file.
- Recognize identifier and email fields, validate basic email shape, and exclude identifiers from numeric findings.
- Add IQR outlier counts and Pearson correlations with explicit statistical limits.
- Use the strongest correlated pair for the scatter preview and surface it as an executive signal.
- Validate the supplied 1,000-row customer file without committing its contents.
- Expand backend coverage from 14 to 18 tests.

## 0.2.0 — Executive readiness foundation

- Detect headerless CSV files and preserve the first record instead of silently using it as column names.
- Add an explicit header-mode API and a user override in the Overview.
- Add an Executive brief that separates structural readiness from the numeric data-quality score.
- Prioritize missing values, duplicates, type mismatches, invalid typed values, and missing headers with impact and next actions.
- Validate the supplied 1,000-row customer dataset without committing private customer data to the repository.
- Expand backend coverage from 10 to 14 tests.

## 0.1.0 — MVP

- CSV upload, schema inference, quality scoring, statistics, charts, preview, sample data, GitHub Actions, and Vercel deployment.
