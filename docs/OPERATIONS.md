# Operations

## Release

1. Run frontend lint/build/E2E and backend Ruff/pytest.
2. Confirm dependency audits have no high-severity finding.
3. Deploy with Vercel from the repository root.
4. Verify `/api/health`, a non-sensitive CSV analysis through the sample buttons, an Excel and a JSON analysis, governance metadata, rules, review, exports (CSV, Excel, JSON, print), and clearing the dataset.
5. Preserve the Git commit and deployment URL in the release record.

## Incident response

For suspected credential or signing-key exposure, rotate `DATALENS_AUDIT_SECRET` in Vercel (this invalidates previously issued review and approval events), redeploy, and record the affected deployment interval. For unexpected data retention, stop production traffic, preserve platform logs, and involve the data owner and privacy/security contacts.

## Monitoring

GitHub Actions runs a scheduled public smoke check. It verifies the health endpoint, an analysis round trip with synthetic data, and browser security headers. It does not upload business data. Review Vercel function failures and duration in the dashboard; a 100,000-row file near the 4 MiB limit takes about 16 seconds, against a 60-second function limit.

