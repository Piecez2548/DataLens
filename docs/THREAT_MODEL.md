# Threat model

## Assets

Uploaded CSV bytes, derived metrics and previews, Supabase sessions, governance declarations, and audit signing keys.

## Trust boundaries and controls

- The browser obtains a Supabase session; the API independently validates the bearer token with Supabase.
- Role allowlisting denies accounts outside the configured set. Approval additionally requires an approver, admin, or developer role.
- Extension, byte, row, column, parser, metadata, rule-count, and string-length limits reduce malformed-input and resource-exhaustion risk.
- No-store responses, no application persistence, and a restrictive browser security policy reduce unintended retention and content injection risk.
- HMAC signatures make exported audit-event tampering detectable by the service owner. They do not provide public verification or centralized non-repudiation.

## Residual risks

Formula-like CSV values are displayed as text in the browser and HTML report, but exporting results into spreadsheet software can reintroduce formula-injection risk. Uploaded facts can be false despite valid structure. Serverless instances do not provide a shared rate-limit ledger. A compromised browser or Supabase account can access any file the user chooses to upload. The current audit record is portable rather than centrally retained.

