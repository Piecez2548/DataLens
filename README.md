# DataLens

**Live demo:** https://datalens-kappa-one.vercel.app

**GitHub:** https://github.com/Piecez2548/DataLens · **Nexus hub:** https://nexus-lemon-eight-32.vercel.app/projects

DataLens is a standalone workspace linked from Nexus. It does not share authentication or uploaded data with Nexus. See [release test checklist](docs/TESTING.md).

A focused CSV profiling workspace for a software/data portfolio. React + TypeScript + Tailwind + Recharts on the frontend; FastAPI + Pandas + NumPy on the backend. No AI API, database, or account required.

## v0.5 features

- Upload or drop a UTF-8 CSV; production does not preload or offer fictional business data.
- Schema inference: numeric, categorical, ISO date, boolean, email, identifier, empty.
- Editable column names and governed type overrides without discarding source rows.
- Table preview with pagination, missing cells, duplicates, column health.
- Numeric count, min, max, mean, median, population standard deviation, IQR outliers, and Pearson correlations.
- Histogram, top-category bar chart, schema donut, numeric scatter plot.
- Four transparent quality dimensions and an overall score.
- Automatic header-row detection that preserves every record in headerless CSV files.
- Executive brief with readiness status, prioritized risks, business impact, and recommended actions.
- Downloadable, print-ready executive brief with scoring limits and decision notes.
- Evidence provenance with SHA-256 input fingerprint, analyzed row counts, deterministic method version, and a no-generated-values declaration.
- Explicit header override when automatic detection needs human correction.
- Light/dark themes, responsive layout, accessible labels, loading and error states.

## Quick start

Requirements: Node.js 22.12+ and Python 3.11+. Run two terminals from this repository.

**Backend — Windows PowerShell**

```powershell
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Backend — macOS/Linux**

```sh
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend — another terminal**

```sh
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:5173 and upload a CSV whose source you can verify. Vite forwards `/api` to port 8000. The API documentation is at http://127.0.0.1:8000/docs. No environment secrets are required. `samples/demo.csv` is a fictional developer test fixture only; it is not offered in the production interface and must never be cited as business evidence.

## Architecture

```text
frontend/
  src/App.tsx       Upload state, views, quality cards, preview
  src/Charts.tsx    Lazy-loaded Recharts visualization module
  src/report.ts     Private, browser-generated executive report
  src/types.ts      API response interfaces
  src/style.css     Tailwind import, theme tokens, responsive UI
backend/
  app/main.py       HTTP validation, upload lifecycle, threadpool execution
  app/analysis.py   Pure deterministic parsing and profiling engine
  tests/           Engine edge cases and HTTP integration tests
samples/demo.csv   Fictional developer test fixture; never business evidence
docs/              Screenshot placeholders
```

Flow: browser → multipart `POST /api/analyze?header_mode=auto` with an optional JSON `schema` form field → bounded file read → strict CSV parsing and header detection → governed naming/type overrides → Pandas normalization → NumPy statistics → executive risk summary → JSON → React views. The CPU-bound profiler runs in a worker thread. Data is held in memory for the request and in browser state for the current session; there is no app-level persistence. Framework multipart handling may spool larger uploads to temporary storage before the endpoint reads them.

Every response includes an SHA-256 fingerprint of the exact uploaded bytes, input size, parsed and analyzed row counts, calculation method version, and an explicit `data_values_generated: false` provenance field. DataLens generates labels, metrics, and recommendations from deterministic rules; it does not invent or fill source values. Recommendations are procedural review steps rather than claims about the business.

## Scoring formula

Let R = rows, C = columns, M = empty cells after trimming, P = R×C−M, T = type mismatches, D = duplicate rows beyond the first occurrence, V = invalid typed values, K = checked typed values.

| Dimension    | Score                                                               |
| ------------ | ------------------------------------------------------------------- |
| Completeness | `100 × (1 − M / (R × C))`                                           |
| Consistency  | `100 × (1 − T / P)`; N/A if P=0                                     |
| Uniqueness   | `100 × (1 − D / R)`                                                 |
| Validity     | `100 × (1 − V / K)`; N/A if K=0                                     |
| Overall      | Arithmetic mean of available dimensions, calculated before rounding |

Scores are rounded to two decimals. Duplicate comparison uses trimmed strings and normalized blanks across all columns; numeric spellings such as `1` and `1.0` remain different. Only empty/whitespace cells are missing: literal `NA`, `null`, and `nan` are not silently discarded.

Each non-empty token is classified as boolean (`true`/`false`, case insensitive), numeric (decimal/scientific notation or nonfinite tokens), date-shaped (`YYYY-MM-DD`), email-shaped, or categorical. A non-text type is selected only if at least 80% of non-empty tokens match it; otherwise the column is categorical. Common ID names and unique sequential number columns are inferred as identifiers. All-empty columns use `empty`. Users can rename columns and override the inferred types; raw preview strings preserve leading zeros.

Consistency checks lexical agreement with the inferred type. Validity separately checks matching numeric tokens for finiteness, matching date tokens for a real calendar date within Pandas' supported timestamp range, and email values for a basic address shape. Matching boolean tokens are valid. Mismatches do not enter the validity denominator; categorical and identifier values have no validity rule. The UI displays N/A when no typed checks are possible. A text-heavy dataset can score highly despite factual errors: these are profiling heuristics, **not a certification of data accuracy**.

Statistics and histograms exclude missing, mismatched and nonfinite numeric values. Standard deviation uses `ddof=0`. Potential outliers use the standard 1.5×IQR rule. Pearson correlations require at least three complete finite pairs and do not imply causation. Histograms use up to 12 equal-width bins. Categories show the ten most frequent non-empty values. Scatter uses the strongest available correlated numeric pair and up to the first 500 complete finite pairs; this is a preview, not a representative statistical sample.

## Limits and deployment

### Vercel deployment

The repository includes `vercel.json`, a Python ASGI entry at `api/index.py`, and runtime-only root `requirements.txt`. Vercel builds the React frontend and routes `/api/*` to the same FastAPI engine used locally. Deploy from the repository root with `npx vercel --prod`; select a separate DataLens project.

Production frontend builds limit CSV uploads to **4 MiB** to leave multipart overhead below Vercel's 4.5 MB request limit. The backend applies the same limit when `VERCEL` is set. Development mode retains 10 MiB. Larger-file support will require a storage-based upload flow. See [Vercel function limits](https://vercel.com/docs/functions/limitations).

The included deployment configuration sets a 60-second function limit and excludes frontend sources and local development environments from the Python function bundle. No secrets or external services are required.

- UTF-8 comma-separated CSV only; quoted delimiters/newlines are supported.
- 10 MB, 100,000 rows, 100 columns; header-only, malformed, duplicate-header and binary inputs are rejected.
- Preview: first 100 rows, ten per page. Full data is analyzed within the limits.
- No domain-specific validity rules, time series chart, XLSX or persistence yet.
- Header detection is heuristic. The response states what was used and the interface offers a manual override.
- Intended as a local MVP. For deployment, host `frontend/dist` with an HTTP reverse proxy routing `/api` to FastAPI. Vite's production preview does not provide the development API proxy.
- Before exposing publicly, configure HTTPS, request-body limits at the proxy (including multipart overhead), authentication if needed, rate limits and concurrency/resource limits. The application size check runs after multipart parsing.

## Validation

```sh
cd frontend
npm run lint
npm run build
```

```powershell
cd backend
.venv/Scripts/python -m ruff check .
.venv/Scripts/python -m pytest
```

On macOS/Linux replace `.venv/Scripts/python` with `.venv/bin/python`. Tests cover hand-calculated scores, numeric statistics, invalid dates, type mismatches, nonfinite numbers, missing-only data, parser failures and API uploads.

## Screenshots

Place actual captures in these locations before publishing your portfolio:

| Capture                               | Placeholder               |
| ------------------------------------- | ------------------------- |
| Light overview with cited public data | `docs/overview-light.png` |
| Dark overview                         | `docs/overview-dark.png`  |
| Column health and numeric exploration | `docs/explore.png`        |

See [capture checklist](docs/screenshots.md). These are explicitly placeholders, not screenshots of a verified browser session.

## Roadmap

- v0.6: custom missing markers, delimiter/encoding selection, XLSX, and configurable chart axes.
- v0.7: date-series analysis and explicit business validity rules.
- v0.8: saved quality policies, browser regression coverage, and dataset audit history.

## References

- [Vite setup and build guide](https://vite.dev/guide/)
- [FastAPI file upload guide](https://fastapi.tiangolo.com/tutorial/request-files/)

## Publish to GitHub

Source is published at `Piecez2548/DataLens`. Pushes and pull requests run frontend lint/build and backend lint/tests in GitHub Actions. Dependencies, environments and build output are excluded by `.gitignore`; `frontend/package-lock.json` is included for reproducible installs.
