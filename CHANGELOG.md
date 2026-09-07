# Changelog

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
