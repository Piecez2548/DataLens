# DataLens

DataLens is a deterministic CSV profiling workspace for governed, reviewable data analysis. It derives metrics from uploaded bytes without calling an AI API and does not intentionally persist CSV contents.

| Resource | URL |
| --- | --- |
| Production | https://datalens-kappa-one.vercel.app |
| Repository | https://github.com/Piecez2548/DataLens |
| Project Hub | https://nexus-lemon-eight-32.vercel.app/projects |

DataLens checks xlsx, csv and json data before you send it to someone else: it shows what is wrong, where, and whether the file is ready to send. There is no sign-in and no approval step. It does not certify that a dataset is accurate, complete, lawful, or suitable for a particular business decision; the accountable data owner remains responsible for those determinations.

## Features (v0.7.1)

- No sign-in and no approval step: the page tells you whether the data is ready to send, needs a check, or must be fixed first.
- One-step upload; business rules are optional and checked on request.
- CSV preview (UTF-8, UTF-16, Thai Windows-874; comma, semicolon, tab or pipe delimiters detected and recorded), schema inference, governed names and type overrides.
- Missing cells, duplicates, numeric statistics, IQR outliers, Pearson correlations, and adaptive charts.
- Transparent Completeness, Consistency, Uniqueness, Validity, and Overall scores.
- Thai/English interface and executive brief; JSON, Excel .xlsx (any sheet) and CSV input; located issue lists exportable as CSV/JSON; user-defined missing markers, Thai national ID/phone personal-data flags, records-over-time chart, two-file comparison, and browser-local rule templates.
- Per-column required, allowed-value, minimum, and maximum business rules.
- "Export rows to fix": the original rows that have problems, with what to fix, as Excel. A copy of the file without detected personal-data columns can be downloaded as CSV. A saved snapshot can be used as the comparison baseline.
- A "ready to send" verdict, a shareable data-check summary (HTML, print or save as PDF) and saved snapshots (`.datalens.json`).
- SHA-256 source fingerprint, deterministic method version, and no-generated-values declaration.
- Conservative header detection and regression coverage for mixed types, sequential numeric measures, alternate delimiters, missing-cell severity, and rule validation.
- Accessible chart-value tables, visible keyboard focus, 44px controls, improved contrast, and deferred chart loading.
- Responsive mobile web layout with safe-area spacing, mobile Nexus navigation, touch-friendly controls, horizontally scrollable tabs and tables, and compact report actions.
- Browser E2E coverage, dependency audits, scheduled production smoke checks, and security headers.

The source SHA-256 identifies the uploaded bytes. DataLens cannot prove that a source file is factually correct, complete for its business purpose, lawful to process, or free from manipulation before upload. The accountable data owner must verify those facts. Release 0.7.1 is limited to synthetic or confirmed non-personal data until the operator completes the privacy and vendor controls in the readiness report.

## Quick start

Requirements: Node.js 22.12+ and Python 3.11+.

```powershell
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

There is no authentication to configure. Production needs no secrets; if the frontend is served from another origin, set `DATALENS_ALLOWED_ORIGINS`. Old `VITE_SUPABASE_*`, `SUPABASE_*`, `DATALENS_AUTH_REQUIRED` and `DATALENS_ALLOWED_ROLES` variables are no longer read and can be deleted from the Vercel project.

`samples/demo.csv` and the files under `frontend/public/samples` (offered as **Try a sample** on the home page) are fictional fixtures. They must never be presented as business evidence.

## Architecture

```text
Browser
  ├─ React + TypeScript + Tailwind + Recharts
  └─ multipart file + schema options/rules
                 │ HTTPS
FastAPI on Vercel
  ├─ bounded request and strict CSV parsing
  ├─ Pandas/NumPy deterministic profiler
  ├─ business-rule evaluation
                 │
Browser state + exported HTML brief
```

CSV bytes are released after the request; no application database stores them. Framework or hosting infrastructure may use transient memory or temporary storage while handling the request.

Key files:

- `frontend/src/staleChunkReload.ts`: one automatic reload when a deploy removes a lazy chunk.
- `frontend/src/Rules.tsx`: optional business-rule editor and saved rule templates.
- `frontend/src/report.ts`: local data-check summary generation.
- `backend/app/analysis.py`: pure deterministic analysis engine.
- `backend/app/main.py`: request limits, the non-personal-data attestation, and API lifecycle.

## Quality scoring

Let `R` be rows, `C` columns, `M` missing cells, `P = R×C−M`, `T` type mismatches, `D` duplicate rows beyond the first, `V` invalid typed values, and `K` checked typed values.

| Dimension | Formula |
| --- | --- |
| Completeness | `100 × (1 − M / (R × C))` |
| Consistency | `100 × (1 − T / P)`; N/A when `P=0` |
| Uniqueness | `100 × (1 − D / R)` |
| Validity | `100 × (1 − V / K)`; N/A when `K=0` |
| Overall | Arithmetic mean of available dimensions before rounding |

Only empty or whitespace-only cells count as missing, plus any markers the user lists (for example `NA`, `N/A`, `-`, matched without regard to case); without markers, literal `NA`, `null`, and `nan` are retained.

Numbers may use thousands separators (`1,234.50`), currency (`฿100`, `$2,000`, `300 บาท`), percent (`15%`, stored as 15), accounting negatives (`(500)`) or European style (`1.234,50`, `12,5`; a lone `1,234` is read as English thousands). Dates are read day-first unless the file proves month-first (a second part above 12) or the user chooses an order; `YYYY-MM-DD`, `YYYY/MM/DD`, `D/M/YYYY`, named months in English and Thai, optional times, and Buddhist Era years from 2400 (converted by subtracting 543) are recognized. Two-digit years (`05/06/67`) are never guessed: the page reports how many there are and the user picks Buddhist Era (25YY) or Christian Era (00–69 → 20YY, 70–99 → 19YY). Rows that repeat a user-chosen business key are reported separately from whole-row duplicates. Numeric statistics exclude missing, mismatched, and nonfinite values. Standard deviation uses `ddof=0`; outliers use 1.5×IQR; correlations need at least three complete finite pairs and do not establish causation.

Business rules are separate from structural quality. A dataset can have a high quality score and still fail a required field, domain, minimum, or maximum rule.


## Security and data handling

- No accounts. Hosted requests must attest that the file is non-personal.
- HTTPS is enforced by Vercel; HSTS, CSP, frame blocking, referrer, permissions, and MIME-sniffing headers are configured.
- Excel files are limited to 4 MiB in production. CSV and JSON files up to 40 MB are compressed (gzip) in the browser before upload so they fit the hosting request limit of 4 MiB; the server unpacks them with a hard size cap. Every file is also limited to 100,000 rows, 100 columns and 2,000,000 cells so that analysis finishes within the 60-second function limit.
- Responses use `Cache-Control: no-store`; CSV contents are not intentionally persisted by application code. Platform-level transient handling must be confirmed with the hosting provider before confidential use.

See [data governance](docs/DATA_GOVERNANCE.md), [threat model](docs/THREAT_MODEL.md), [security review](docs/SECURITY.md), and [operations](docs/OPERATIONS.md).

## Validation

```powershell
cd frontend
npm ci
npm run lint
npm run build
npx playwright install chromium
npm run e2e

cd ../backend
.venv/Scripts/python -m ruff check .
.venv/Scripts/python -m pytest -q
```

CI also runs `npm audit --audit-level=high`, `pip-audit`, and the browser workflow. A scheduled production smoke test verifies availability, an unauthenticated analysis round trip, and security headers without uploading business data.

## Demo evidence

No approved product screenshots are checked into this repository. Demonstrations must use the current production build with the built-in samples or `samples/demo.csv`, which are fictional test data and must be labelled as such. Historical local customer-file observations in `VALIDATION.md` are not current-release or business evidence.

## Roadmap

- Operator privacy notice, ROPA, DPA/subprocessor review, transfer assessment, DSAR and incident workflows, followed by Thai counsel/DPO sign-off before personal-data use.
- Durable organization audit storage with customer-managed retention and verification keys.
- Approved encrypted object storage for Excel files larger than 4 MiB and for text files whose compressed size exceeds 4 MiB.
- Saved policy templates, and richer time-series analysis.


