# Threat model

## Assets

Uploaded file bytes (CSV, Excel, JSON), derived metrics and previews, exported issue lists.

## Trust boundaries and controls

- There are no accounts and no approval or audit records. Hosted requests must attest that the file is non-personal, and Thai national ID or phone patterns block approval.
- Excel input reads cached cell values only. Formulas, macros and external links are never evaluated, and decompressed workbook size is capped at 50 MB.
- Extension, byte, row, column, parser, metadata, rule-count, and string-length limits reduce malformed-input and resource-exhaustion risk.
- No-store responses, no application persistence, and a restrictive browser security policy reduce unintended retention and content injection risk.

- A snapshot (`.datalens.json`) is created in the browser and opened in the browser; nothing is stored on the server. Its content is untrusted on opening: the shape is checked, text fields are length-limited and everything is rendered as text. A snapshot can be edited by anyone who holds it, so it is a convenience for sharing, not evidence; approval needs the original file.
- Follow-up owners, dates and notes and remembered per-file settings stay in the browser (memory, snapshot files and `localStorage`); remembered settings hold choices only, never file contents.

## Residual risks

Formula-like values are shown as text in the browser and HTML report. The CSV issue and summary exports prefix such values with an apostrophe, and the Excel exports write every string as a text cell, so spreadsheet software does not run them. Uploaded facts can be false despite valid structure. Serverless instances do not provide a shared rate-limit ledger. A compromised browser can access any file the user chooses to upload. Rule templates live in the browser local storage and contain column names and thresholds only. The current audit record is portable rather than centrally retained.

