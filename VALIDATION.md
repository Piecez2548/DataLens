# Validation results

## Production deployment

Published to https://datalens-kappa-one.vercel.app on Vercel. Deployment status: Ready. Unauthenticated HTTPS checks passed for the homepage, `/api/health`, and multipart `/api/analyze`. The v0.5.2 production workflow accepts only user-uploaded source files and does not offer fictional business data. Validation used a local, uncommitted 1,000-row customer file that has no header row. That file was reanalyzed with governed column names and type overrides: all 1,000 records remained, the ID was excluded from numeric analysis, and all 1,000 email values passed the basic format check. Its independently calculated SHA-256 fingerprint matched the response provenance, which also reported 73,426 input bytes, 1,000 analyzed rows, deterministic method v0.5.2, and no generated data values. The browser-generated executive report passes TypeScript compilation, ESLint, and the production build. Frontend lint/build and all 21 backend tests pass.

Additional production checks used two other existing local files without displaying or committing their row values. `Products.csv` returned 80 rows, two columns, no missing or duplicate rows, and `Review needed` because repeated pipe delimiters suggest that product category and product name may be embedded in one CSV field. The Looker Studio milk dataset returned 10 rows, seven columns, no missing or duplicate rows, ten IQR outliers, ten reported numeric correlations, and `Review needed`. Two volume values are outside the collapsed 180 ml Tukey fence; v0.5.2 corrects the earlier zero-IQR handling that omitted them. Both API responses matched independently calculated SHA-256 fingerprints and declared no generated data values. Independent calculations matched the API for row counts, missing cells, duplicates, numeric descriptive statistics, IQR outliers, and reported Pearson coefficients. A matching fingerprint proves which exact bytes were analyzed; it does not independently prove that facts recorded inside a source file are true.

Validated on Windows, Node 22.22.3, Python 3.11.9.

| Check                                  | Result                                      |
| -------------------------------------- | ------------------------------------------- |
| Frontend ESLint                        | Passed                                      |
| TypeScript and Vite production build   | Passed                                      |
| Backend Ruff                           | Passed                                      |
| Pytest                                 | 21 passed                                   |
| HTTP smoke test through Vite API proxy | Passed                                      |
| Developer fixture regression           | 164 rows, 4 duplicates, overall score 99.20 |
| Headerless customer upload with schema | 1,000 rows, ready for exploration           |
| Products upload                        | 80 rows, embedded fields, review needed     |
| Looker Studio milk upload              | 10 rows, 10 outliers, review needed         |
| Executive report export                | Self-contained HTML with print/PDF styling  |
| Exact-input provenance                 | Independent SHA-256 match                   |

The backend test client reports two upstream deprecation warnings (Starlette/httpx and AnyIO). They do not fail tests. Full resolved backend dependencies are captured in `backend/requirements-lock.txt`; use it in place of `requirements.txt` to recreate the validated environment.

The production landing page was visually checked at a compact browser width. Full browser interaction automation was not performed. Screenshot paths in the README remain placeholders. The local preview is served by Vite; the backend is running separately on port 8000.
