# DataLens

**Live demo:** https://datalens-kappa-one.vercel.app

A focused CSV profiling workspace for a software/data portfolio. React + TypeScript + Tailwind + Recharts on the frontend; FastAPI + Pandas + NumPy on the backend. No AI API, database, or account required.

## v0.1 features

- Upload or drop a UTF-8 CSV; bundled retail demo (164 rows).
- Schema inference: numeric, categorical, ISO date, boolean, empty.
- Table preview with pagination, missing cells, duplicates, column health.
- Numeric count, min, max, mean, median, population standard deviation.
- Histogram, top-category bar chart, schema donut, numeric scatter plot.
- Four transparent quality dimensions and an overall score.
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

Open http://127.0.0.1:5173 and choose **Explore sample dataset**, or upload `samples/demo.csv`. Vite forwards `/api` to port 8000. The API documentation is at http://127.0.0.1:8000/docs. No environment secrets are required.

## Architecture

```text
frontend/
  src/App.tsx       Upload state, views, quality cards, preview
  src/Charts.tsx    Lazy-loaded Recharts visualization module
  src/types.ts      API response interfaces
  src/style.css     Tailwind import, theme tokens, responsive UI
  public/demo.csv   Browser-accessible demo
backend/
  app/main.py       HTTP validation, upload lifecycle, threadpool execution
  app/analysis.py   Pure deterministic parsing and profiling engine
  tests/           Engine edge cases and HTTP integration tests
samples/demo.csv   Standalone synthetic demo data
docs/              Screenshot placeholders
```

Flow: browser → multipart `POST /api/analyze` → bounded file read → strict CSV parsing → Pandas normalization → NumPy statistics → JSON → React views. The CPU-bound profiler runs in a worker thread. Data is held in memory for the request and in browser state for the current session; there is no app-level persistence. Framework multipart handling may spool larger uploads to temporary storage before the endpoint reads them.

## Scoring formula

Let R = rows, C = columns, M = empty cells after trimming, P = R×C−M, T = type mismatches, D = duplicate rows beyond the first occurrence, V = invalid typed values, K = checked typed values.

| Dimension | Score |
|---|---|
| Completeness | `100 × (1 − M / (R × C))` |
| Consistency | `100 × (1 − T / P)`; N/A if P=0 |
| Uniqueness | `100 × (1 − D / R)` |
| Validity | `100 × (1 − V / K)`; N/A if K=0 |
| Overall | Arithmetic mean of available dimensions, calculated before rounding |

Scores are rounded to two decimals. Duplicate comparison uses trimmed strings and normalized blanks across all columns; numeric spellings such as `1` and `1.0` remain different. Only empty/whitespace cells are missing: literal `NA`, `null`, and `nan` are not silently discarded.

Each non-empty token is classified as boolean (`true`/`false`, case insensitive), numeric (decimal/scientific notation or nonfinite tokens), date-shaped (`YYYY-MM-DD`), or categorical. A non-text type is selected only if at least 80% of non-empty tokens match it; otherwise the column is categorical. All-empty columns use `empty`. Leading-zero identifiers can therefore be inferred as numeric; schema overrides are a roadmap item. Raw preview strings preserve leading zeros.

Consistency checks lexical agreement with the inferred type. Validity separately checks matching numeric tokens for finiteness and matching date tokens for a real calendar date within Pandas' supported timestamp range. Matching boolean tokens are valid. Mismatches do not enter the validity denominator; categorical values have no validity rule. The UI displays N/A when no typed checks are possible. A text-heavy dataset can score highly despite factual errors: these are profiling heuristics, **not a certification of data accuracy**.

Statistics and histograms exclude missing, mismatched and nonfinite numeric values. Standard deviation uses `ddof=0`. Histograms use up to 12 equal-width bins. Categories show the ten most frequent non-empty values. Scatter uses the first two numeric columns and up to the first 500 complete finite pairs; this is a preview, not a representative statistical sample.

## Limits and deployment

### Vercel deployment

The repository includes `vercel.json`, a Python ASGI entry at `api/index.py`, and runtime-only root `requirements.txt`. Vercel builds the React frontend and routes `/api/*` to the same FastAPI engine used locally. Deploy from the repository root with `npx vercel --prod`; select a separate DataLens project.

Production frontend builds limit CSV uploads to **4 MiB** to leave multipart overhead below Vercel's 4.5 MB request limit. The backend applies the same limit when `VERCEL` is set. Development mode retains 10 MiB. Larger-file support will require a storage-based upload flow. See [Vercel function limits](https://vercel.com/docs/functions/limitations).

The included deployment configuration sets a 60-second function limit and excludes frontend sources and local development environments from the Python function bundle. No secrets or external services are required.

- UTF-8 comma-separated CSV only; quoted delimiters/newlines are supported.
- 10 MB, 100,000 rows, 100 columns; header-only, malformed, duplicate-header and binary inputs are rejected.
- Preview: first 100 rows, ten per page. Full data is analyzed within the limits.
- No domain validity rules, time series chart, outlier detection, XLSX or persistence yet.
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

| Capture | Placeholder |
|---|---|
| Light overview with demo dataset | `docs/overview-light.png` |
| Dark overview | `docs/overview-dark.png` |
| Column health and numeric exploration | `docs/explore.png` |

See [capture checklist](docs/screenshots.md). These are explicitly placeholders, not screenshots of a verified browser session.

## Roadmap

- v0.2: schema overrides, custom missing markers, delimiter/encoding selection, XLSX.
- v0.3: date-series charts, configurable scatter axes, correlations and IQR outliers.
- v0.4: explicit column validity rules, downloadable reports and browser regression tests.

## References

- [Vite setup and build guide](https://vite.dev/guide/)
- [FastAPI file upload guide](https://fastapi.tiangolo.com/tutorial/request-files/)

## Publish to GitHub

After reviewing files, initialize Git in this folder, create a repository and push it. Dependencies, environments and build output are excluded by `.gitignore`; `frontend/package-lock.json` is included for reproducible installs. No GitHub repository has been created automatically.
