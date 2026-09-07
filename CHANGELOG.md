# Changelog

## 0.2.0 — Executive readiness foundation

- Detect headerless CSV files and preserve the first record instead of silently using it as column names.
- Add an explicit header-mode API and a user override in the Overview.
- Add an Executive brief that separates structural readiness from the numeric data-quality score.
- Prioritize missing values, duplicates, type mismatches, invalid typed values, and missing headers with impact and next actions.
- Validate the supplied 1,000-row customer dataset without committing private customer data to the repository.
- Expand backend coverage from 10 to 14 tests.

## 0.1.0 — MVP

- CSV upload, schema inference, quality scoring, statistics, charts, preview, sample data, GitHub Actions, and Vercel deployment.
