# Operations

## Release

1. Run frontend lint/build/E2E and backend Ruff/pytest.
2. Confirm dependency audits have no high-severity finding.
3. Deploy with Vercel from the repository root.
4. Verify `/api/health`, unauthenticated rejection, login, a non-sensitive CSV analysis, governance metadata, rules, review, export, and logout.
5. Preserve the Git commit and deployment URL in the release record.

## Incident response

For suspected credential or signing-key exposure, rotate the affected Vercel environment variable, revoke Supabase sessions if needed, redeploy, and record the affected deployment interval. For unexpected data retention, stop production traffic, preserve platform logs, and involve the data owner and privacy/security contacts.

## Monitoring

GitHub Actions runs a scheduled public smoke check. It verifies the health endpoint, authentication enforcement, and browser security headers. It deliberately does not possess a user credential or upload a dataset. Review Vercel function failures and Supabase authentication events in their respective dashboards.

