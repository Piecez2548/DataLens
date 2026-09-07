# Validation results

## Production deployment

Published to https://datalens-kappa-one.vercel.app on Vercel. Deployment status: Ready. Unauthenticated HTTPS checks passed for the homepage, `/api/health`, and multipart `/api/analyze`. The v0.4 validation includes the live demo and a local, uncommitted 1,000-row customer file that has no header row. That file was reanalyzed with governed column names and type overrides: all 1,000 records remained, the ID was excluded from numeric analysis, and all 1,000 email values passed the basic format check. The browser-generated executive report passes TypeScript compilation, ESLint, and the production build. Frontend lint/build and all 18 backend tests pass.

Validated on Windows, Node 22.22.3, Python 3.11.9.

| Check                                  | Result                                      |
| -------------------------------------- | ------------------------------------------- |
| Frontend ESLint                        | Passed                                      |
| TypeScript and Vite production build   | Passed                                      |
| Backend Ruff                           | Passed                                      |
| Pytest                                 | 18 passed                                   |
| HTTP smoke test through Vite API proxy | Passed                                      |
| Demo upload                            | 164 rows, 4 duplicates, overall score 99.20 |
| Headerless customer upload with schema | 1,000 rows, ready for exploration           |
| Executive report export                | Self-contained HTML with print/PDF styling  |

The backend test client reports two upstream deprecation warnings (Starlette/httpx and AnyIO). They do not fail tests. Full resolved backend dependencies are captured in `backend/requirements-lock.txt`; use it in place of `requirements.txt` to recreate the validated environment.

The production landing page was visually checked at a compact browser width. Full browser interaction automation was not performed. Screenshot paths in the README remain placeholders. The local preview is served by Vite; the backend is running separately on port 8000.
