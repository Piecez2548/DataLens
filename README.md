# DataLens

DataLens is a deterministic CSV profiling workspace for governed, reviewable data analysis. It derives metrics from uploaded bytes without calling an AI API and does not intentionally persist CSV contents.

| Resource | URL |
| --- | --- |
| Production | https://datalens-kappa-one.vercel.app |
| Repository | https://github.com/Piecez2548/DataLens |
| Project Hub | https://nexus-lemon-eight-32.vercel.app/projects |

The platform supports account-free analysis, structural quality metrics, business rules, review workflows, signed metadata events, and an exportable executive brief. It does not certify that a dataset is accurate, complete, lawful, or suitable for a particular business decision; the accountable data owner remains responsible for those determinations.

## Features (v0.7.1)

- No sign-in: analysis, review, and approval work without an account. Only Nexus Main uses accounts.
- One-step CSV upload with source details, business rules, and approval available after analysis.
- UTF-8 CSV preview, schema inference, governed names and type overrides.
- Missing cells, duplicates, numeric statistics, IQR outliers, Pearson correlations, and adaptive charts.
- Transparent Completeness, Consistency, Uniqueness, Validity, and Overall scores.
- Per-column required, allowed-value, minimum, and maximum business rules.
- Executive readiness summary and a print-ready HTML brief.
- SHA-256 source fingerprint, deterministic method version, and no-generated-values declaration.
- HMAC-SHA256 signed analysis, review, and approval event chain. The server rejects fabricated analysis IDs and approval without matching evidence, review, declarations, confirmed headers, and passing rules.
- Draft structural profiles remain clearly marked until the exact analysis has a valid approval event.
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

There is no authentication to configure. Production needs only `DATALENS_AUDIT_SECRET` (a strong random value; the API answers 503 on Vercel without it) and, if the frontend is served from another origin, `DATALENS_ALLOWED_ORIGINS`. Old `VITE_SUPABASE_*`, `SUPABASE_*`, `DATALENS_AUTH_REQUIRED` and `DATALENS_ALLOWED_ROLES` variables are no longer read and can be deleted from the Vercel project.

`samples/demo.csv` is a fictional test fixture. It must never be presented as business evidence.

## Architecture

```text
Browser
  ├─ React + TypeScript + Tailwind + Recharts
  └─ multipart CSV + governance/rules
                 │ HTTPS
FastAPI on Vercel
  ├─ bounded request and strict CSV parsing
  ├─ Pandas/NumPy deterministic profiler
  ├─ business-rule evaluation
  └─ signed metadata-only audit event
                 │
Browser state + exported HTML brief
```

CSV bytes are released after the request; no application database stores them. Framework or hosting infrastructure may use transient memory or temporary storage while handling the request.

Key files:

- `frontend/src/staleChunkReload.ts`: one automatic reload when a deploy removes a lazy chunk.
- `frontend/src/Governance.tsx`: declaration, rules, review, and approval controls.
- `frontend/src/report.ts`: local executive brief generation.
- `backend/app/security.py`: audit-event signing and verification.
- `backend/app/analysis.py`: pure deterministic analysis engine.
- `backend/app/main.py`: request limits, governance validation, and API lifecycle.

## Quality scoring

Let `R` be rows, `C` columns, `M` missing cells, `P = R×C−M`, `T` type mismatches, `D` duplicate rows beyond the first, `V` invalid typed values, and `K` checked typed values.

| Dimension | Formula |
| --- | --- |
| Completeness | `100 × (1 − M / (R × C))` |
| Consistency | `100 × (1 − T / P)`; N/A when `P=0` |
| Uniqueness | `100 × (1 − D / R)` |
| Validity | `100 × (1 − V / K)`; N/A when `K=0` |
| Overall | Arithmetic mean of available dimensions before rounding |

Only empty or whitespace-only cells count as missing. Literal `NA`, `null`, and `nan` are retained. Numeric statistics exclude missing, mismatched, and nonfinite values. Standard deviation uses `ddof=0`; outliers use 1.5×IQR; correlations need at least three complete finite pairs and do not establish causation.

Business rules are separate from structural quality. A dataset can have a high quality score and still fail a required field, domain, minimum, or maximum rule. Approval is enabled only after a review is recorded, when the structural status is ready, the header is confirmed, and configured rules pass.

Review and approval events are signed session records carried into the exported brief. DataLens does not persist them. Internal workflow approval is not an audit opinion, legal approval, certification, or assurance of source-data accuracy. An organization that needs a system of record must add approved durable audit storage and retention controls.

## Security and data handling

- No accounts: anyone can analyze, review, and approve. Hosted requests must attest that the file is non-personal, and approval records do not identify a person.
- HTTPS is enforced by Vercel; HSTS, CSP, frame blocking, referrer, permissions, and MIME-sniffing headers are configured.
- Uploads are limited to 4 MiB in production, 100,000 rows, and 100 columns.
- Responses use `Cache-Control: no-store`; CSV contents are not intentionally persisted by application code. Platform-level transient handling must be confirmed with the hosting provider before confidential use.
- Audit events contain metadata and are HMAC signed. Review and approval endpoints verify a chain back to the exact completed analysis. The downloaded HTML can still be edited and there is no central audit database, key-rotation record, or independently verifiable ledger.
- `public`, `internal`, and `confidential` classifications are accepted. Restricted/regulatory data needs a separately approved storage, key management, DLP, and retention design.

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

No approved product screenshots are checked into this repository. Demonstrations must use the current production build with `samples/demo.csv`, which is fictional test data and must be labelled as such. Historical local customer-file observations in `VALIDATION.md` are not current-release or business evidence.

## Roadmap

- Operator privacy notice, ROPA, DPA/subprocessor review, transfer assessment, DSAR and incident workflows, followed by Thai counsel/DPO sign-off before personal-data use.
- Durable organization audit storage with customer-managed retention and verification keys.
- Identity, SSO, and role-based approval, if the service is ever used for governed workflows.
- Approved encrypted object storage for files larger than 4 MiB.
- Saved policy templates, custom missing markers, delimiters, encodings, XLSX, and time-series analysis.


