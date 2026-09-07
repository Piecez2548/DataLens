# Validation results

## Production deployment

Published to https://datalens-kappa-one.vercel.app on Vercel. Deployment status: Ready. Unauthenticated HTTPS checks passed for the homepage, `/api/health`, and multipart `/api/analyze`. Live demo analysis returned 164 rows, 4 duplicate rows and a 99.20 overall score. Frontend lint/build and all 10 backend tests passed again after deployment configuration changes.

Validated on Windows, Node 22.22.3, Python 3.11.9.

| Check | Result |
|---|---|
| Frontend ESLint | Passed |
| TypeScript and Vite production build | Passed |
| Backend Ruff | Passed |
| Pytest | 10 passed |
| HTTP smoke test through Vite API proxy | Passed |
| Demo upload | 164 rows, 4 duplicates, overall score 99.20 |

The backend test client reports two upstream deprecation warnings (Starlette/httpx and AnyIO). They do not fail tests. Full resolved backend dependencies are captured in `backend/requirements-lock.txt`; use it in place of `requirements.txt` to recreate the validated environment.

Browser visual and interaction automation was not performed. Screenshot paths in the README remain placeholders. The local preview is served by Vite; the backend is running separately on port 8000.
