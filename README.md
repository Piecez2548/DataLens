# DataLens

**Production:** https://datalens-kappa-one.vercel.app · **GitHub:** https://github.com/Piecez2548/DataLens · **Nexus:** https://nexus-lemon-eight-32.vercel.app/projects

DataLens is a CSV structural-profiling workspace for reviewable decisions. It uses the same Supabase account as Nexus, calculates every metric deterministically from the uploaded bytes, and does not call an AI API. The application does not intentionally persist CSV contents; transient processing by the web framework and hosting platform can occur.

## v0.7.1

- Supabase authentication with allowlisted roles and a shared Nexus account.
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
$env:VITE_AUTH_BYPASS="true"
npm run dev
```

The bypass works only in Vite development mode. Production requires `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATALENS_AUTH_REQUIRED=true`, `DATALENS_ALLOWED_ROLES`, `DATALENS_ALLOWED_ORIGINS`, and a strong `DATALENS_AUDIT_SECRET`.

`samples/demo.csv` is a fictional test fixture. It must never be presented as business evidence.

## Architecture

```text
Browser
  ├─ Supabase identity shared with Nexus; separate origin session
  ├─ React + TypeScript + Tailwind + Recharts
  └─ multipart CSV + governance/rules
                 │ HTTPS + bearer token
FastAPI on Vercel
  ├─ token verification and role authorization
  ├─ bounded request and strict CSV parsing
  ├─ Pandas/NumPy deterministic profiler
  ├─ business-rule evaluation
  └─ signed metadata-only audit event
                 │
Browser state + exported HTML brief
CSV bytes are released after the request; no application database stores them. Framework or hosting infrastructure may use transient memory or temporary storage while handling the request.
```

Key files:

- `frontend/src/auth.tsx`: session gate and Nexus account sign-in.
- `frontend/src/Governance.tsx`: declaration, rules, review, and approval controls.
- `frontend/src/report.ts`: local executive brief generation.
- `backend/app/security.py`: token validation, role checks, and audit signing.
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

Business rules are separate from structural quality. A dataset can have a high quality score and still fail a required field, domain, minimum, or maximum rule. Approval is enabled only for an approver/admin/developer role when the structural status is ready and configured rules pass.

## Security and data handling

- Production analysis endpoints require a valid Supabase bearer token and an allowed role.
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

CI also runs `npm audit --audit-level=high`, `pip-audit`, and the browser workflow. A scheduled production smoke test verifies availability, auth enforcement, and security headers without uploading business data.

## Screenshots

| Capture | Placeholder |
| --- | --- |
| Governed upload | `docs/overview-light.png` |
| Quality and evidence view | `docs/overview-dark.png` |
| Rules and approval | `docs/explore.png` |

## Roadmap

- Operator privacy notice, ROPA, DPA/subprocessor review, transfer assessment, DSAR and incident workflows, followed by Thai counsel/DPO sign-off before personal-data use.
- Durable organization audit storage with customer-managed retention and verification keys.
- SAML/OIDC enterprise SSO, SCIM, and group-to-role mapping.
- Approved encrypted object storage for files larger than 4 MiB.
- Saved policy templates, custom missing markers, delimiters, encodings, XLSX, and time-series analysis.
