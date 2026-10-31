# Threat model

## Assets

Uploaded file bytes (CSV, Excel, JSON), derived metrics and previews, exported issue lists, governance declarations, and the audit signing key.

## Trust boundaries and controls

- There are no accounts. Anyone can analyze, review and approve, so approval records do not identify a person. Hosted requests must attest that the file is non-personal, and Thai national ID or phone patterns block approval.
- Excel input reads cached cell values only. Formulas, macros and external links are never evaluated, and decompressed workbook size is capped at 50 MB.
- Extension, byte, row, column, parser, metadata, rule-count, and string-length limits reduce malformed-input and resource-exhaustion risk.
- No-store responses, no application persistence, and a restrictive browser security policy reduce unintended retention and content injection risk.
- HMAC signatures make exported audit-event tampering detectable by the service owner. They do not provide public verification or centralized non-repudiation.

## Residual risks

Formula-like values are shown as text in the browser and HTML report. The CSV issue and summary exports prefix such values with an apostrophe, and the Excel exports write every string as a text cell, so spreadsheet software does not run them. Uploaded facts can be false despite valid structure. Serverless instances do not provide a shared rate-limit ledger. A compromised browser can access any file the user chooses to upload. Rule templates live in the browser local storage and contain column names and thresholds only. The current audit record is portable rather than centrally retained.

