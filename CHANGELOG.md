# Changelog

## Unreleased

- Accept real-world exports: UTF-8 (with or without BOM), UTF-16, and Thai Windows-874 files are decoded deterministically; comma, semicolon, tab, and pipe delimiters are detected instead of rejected.
- Record the detected encoding and delimiter in the provenance record, on-screen strip, and executive brief.
- Recognize and validate dates written YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY (day first), with optional time, and Buddhist Era years (2400+, converted by subtracting 543).
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
