# Security review

Version 0.6.1 requires authentication in production, validates roles server-side, keeps credentials in deployment environment variables, signs metadata-only audit events, and does not persist uploaded datasets. The release pipeline runs lint, unit/integration tests, browser E2E, npm vulnerability audit, and Python dependency audit.

Security headers include HSTS, CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, no-sniff, no-referrer, and a restrictive Permissions Policy. All API responses are non-cacheable. No secret is included in the repository or frontend bundle; Supabase's anonymous key is intentionally public and authorization remains enforced by the verified user token and backend role checks.

Before use with restricted or regulated data, require an organizational security/privacy review, centralized immutable audit storage, formal incident response, SSO lifecycle controls, penetration testing, shared rate limiting, customer-managed retention, and documented Vercel/Supabase data residency.

Report vulnerabilities privately to the repository owner. Do not include datasets, tokens, or personal data in a GitHub issue.
