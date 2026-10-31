# Release test checklist

Automated checks run on every push and pull request through GitHub Actions: backend Ruff and pytest, frontend ESLint, TypeScript build, `npm audit`, `pip-audit`, and the Playwright browser workflows in `frontend/e2e`.

## Manual acceptance

Use the **Try a sample** buttons on the home page for repeatable demonstrations. The samples in `frontend/public/samples` are fictional; never cite their values as business evidence.

### Access and governance
- There is no sign-in. Confirm upload is disabled until the non-personal-data authorization attestation is checked (the sample buttons check it for you because the data is fictional).
- Confirm the Executive brief reports risks, impact and the recommended next action before the detail metrics.
- Export before approval and confirm the HTML is visibly marked Draft. After a review and approval, confirm the approved label, metadata, scores, findings, full event signatures and decision limits are present.
- Confirm the page and exported brief show the same SHA-256 fingerprint, input size, analyzed rows, method version and source format.
- Mark a passing analysis reviewed, then record approval. Approval must stay disabled until the header is confirmed, the owner and purpose are saved, rules are configured and pass, and the status is Ready.
- Choose **Clear dataset** and verify the preview, metrics, rules, audit events, declaration, comparison and in-memory file reference disappear.

### Input formats
- **CSV:** UTF-8 with and without BOM, UTF-16, and Thai Windows-874 files decode correctly. Comma, semicolon, tab and pipe delimiters are detected and shown in the provenance strip. Open `sales-th.csv` (Thai headers, baht amounts, Buddhist Era dates).
- **Excel:** open `orders.xlsx`. Expect a two-sheet notice, a suggestion to use row 3 as headers, and a working sheet selector. Formulas are never evaluated.
- **JSON:** open `orders.json`. Nested objects become dotted columns; arrays are kept as text.
- A file with a report title above the table: set **Header row** before upload (CSV) or accept the suggestion (Excel).
- A file with rows of unequal width: the error names the rows.

### Calculations
- Numbers: `1,234.50`, `฿100`, `300 บาท`, `15%`, `(500)`, `1.234,50` and `12,5` are numeric; `$$5` and `--3` stay text.
- Dates: `31/12/2567`, `2025-03-15`, `5 Jan 2024`, `9 มกราคม 2567`. A calendar-impossible date such as `31/02/2568` is invalid. When every date could be day/month or month/day, the confirmation notice appears. Two-digit years are not interpreted.
- Missing markers: enter `NA, N/A, -` under Dataset setup and confirm the missing count changes and the markers appear in provenance.
- Business key: choose the order-number column in `sales-th.csv` and confirm the repeated order number is a high-priority finding with the row it repeats.
- Thai ID and phone columns are flagged as possible personal data and block approval.
- Configure a required, domain or range rule, reanalyze, and compare every violation count with an independent row filter.
- Upload numeric columns with an extreme value and a related pair; confirm the IQR outlier count and correlation signal.

### Locating and exporting problems
- Open **Issues**. Each type lists row (or record) number, column, value and reason, and the numbers match the original file, counting the header. Export CSV, Excel and JSON and confirm the totals match the page. Open the CSV in Excel with Thai text and confirm values starting with `=` appear as text.
- Open **Summary**, group by a column with a numeric measure, and compare one group's sum with an independent filter. Export CSV and Excel.
- Use **Compare with another file** with a corrected copy and confirm the resolved, new and unchanged counts.
- Use **Print / Save as PDF**. If the browser blocks the window, an error explains how to allow pop-ups.

### Language, layout and limits
- Switch to Thai and walk through every tab. Remaining English should be limited to data values, file names and technical identifiers.
- Repeat at mobile width (about 375 px): no horizontal page scroll and controls at least 44 px tall.
- Toggle dark and light themes.
- Upload an invalid file and a file above 4 MiB; verify a clear error and that the prior dataset remains usable.
- Performance reference: a 100,000-row, 8-column, 4 MB CSV completes in about 16 seconds on the hosted service (about 6 seconds locally).
- Choose Back to Nexus; verify the hub opens without transferring file contents.

DataLens has no account system. File contents and analysis state are not transferred to Nexus.
