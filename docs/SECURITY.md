# Security review

Version 0.7.0 fails closed for authentication on Vercel, validates roles server-side, keeps credentials in deployment environment variables, and verifies a signed evidence chain before approval. Application code does not intentionally persist uploaded datasets, although framework/hosting infrastructure can handle request bytes transiently. The release pipeline runs lint, unit/integration tests, browser E2E, npm vulnerability audit, and Python dependency audit.

Security headers include HSTS, CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, no-sniff, no-referrer, and a restrictive Permissions Policy. All API responses are non-cacheable. No secret is included in the repository or frontend bundle; Supabase's anonymous key is intentionally public and authorization remains enforced by the verified user token and backend role checks.

The current release is limited to synthetic or confirmed non-personal data. Before any personal, restricted, or regulated data is enabled, require the controls and approvals in `EXECUTIVE_READINESS_REPORT_2026-09-09.md` and `PRIVACY_DEPLOYMENT_CHECKLIST.md`.

Report vulnerabilities privately to the repository owner. Do not include datasets, tokens, or personal data in a GitHub issue.
