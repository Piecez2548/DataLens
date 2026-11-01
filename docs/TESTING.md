# Release test checklist

Automated checks run on every push and pull request through GitHub Actions: backend Ruff and pytest, frontend ESLint, TypeScript build, `npm audit`, `pip-audit`, and the Playwright browser workflows in `frontend/e2e`.

## Manual acceptance

Use the **Try a sample** buttons on the home page for repeatable demonstrations. The samples in `frontend/public/samples` are fictional; never cite their values as business evidence.

### Access and results
- There is no sign-in. Confirm upload is disabled until the non-personal-data authorization attestation is checked (the sample buttons check it for you because the data is fictional).
- Confirm the verdict ("Ready to send", "Check before sending" or "Fix before sending") and the listed problems with their recommended next action appear before the detail metrics.
- Confirm the page and exported summary show the same SHA-256 fingerprint, input size, analyzed rows, method version and source format.
- Export the summary for sharing and confirm it carries the verdict, scores, findings, where to act, follow-up plan and sheet table when present. There is no review or approval control anywhere.
- Choose **Clear dataset** and verify the preview, metrics, rules, follow-ups, comparison and in-memory file reference disappear.

### Input formats
- **CSV:** UTF-8 with and without BOM, UTF-16, and Thai Windows-874 files decode correctly. Comma, semicolon, tab and pipe delimiters are detected and shown in the provenance strip. Open `sales-th.csv` (Thai headers, baht amounts, Buddhist Era dates).
- **Excel:** open `orders.xlsx`. Expect a two-sheet notice, a suggestion to use row 3 as headers, and a working sheet selector. Formulas are never evaluated.
- **JSON:** open `orders.json`. Nested objects become dotted columns; arrays are kept as text.
- A file with a report title above the table: set **Header row** before upload (CSV) or accept the suggestion (Excel).
- A file with rows of unequal width: the error names the rows.

### Calculations
- Numbers: `1,234.50`, `฿100`, `300 บาท`, `15%`, `(500)`, `1.234,50` and `12,5` are numeric; `$$5` and `--3` stay text.
- Dates: `31/12/2567`, `2025-03-15`, `5 Jan 2024`, `9 มกราคม 2567`. A calendar-impossible date such as `31/02/2568` is invalid. When every date could be day/month or month/day, the confirmation notice appears. A date-named column of whole numbers in the Excel date range (for example 45366) is reported as "Numbers that look like Excel dates". Two-digit years (`05/06/67`) are reported with a Buddhist Era / Christian Era choice; until chosen they are not read as dates, and `67` becomes 2024 (BE) or 2067 (CE).
- Missing markers: enter `NA, N/A, -` under Dataset setup and confirm the missing count changes and the markers appear in provenance.
- Business key: choose the order-number column in `sales-th.csv` and confirm the repeated order number is a high-priority finding with the row it repeats.
- Thai ID and phone columns are flagged as possible personal data.
- Configure a required, domain or range rule, reanalyze, and compare every violation count with an independent row filter.
- Upload numeric columns with an extreme value and a related pair; confirm the IQR outlier count and correlation signal.

### Locating and exporting problems
- Open **Issues**. Each type lists row (or record) number, column, value and reason, and the numbers match the original file, counting the header. Export CSV, Excel and JSON and confirm the totals match the page. Open the CSV in Excel with Thai text and confirm values starting with `=` appear as text.
- Open **Summary**, group by a column with a numeric measure, and compare one group's sum with an independent filter. Export CSV and Excel.
- Use **Compare with another file** with a corrected copy and confirm the resolved, new and unchanged counts.
- Use **Print / Save as PDF**. If the browser blocks the window, an error explains how to allow pop-ups.

### Handing results on
- Issues tab: fill owner, due date and note for an issue type; confirm they appear in the exported brief ("Follow-up plan"), the Excel issue list, the JSON export and the snapshot.
- Save snapshot, clear the dataset and open the `.datalens.json` file: the analysis, follow-ups and sheet overview return, with a notice that the original file is absent. A file that is not a snapshot is rejected with a clear message.
- Re-upload a file name used before: header row, business key, date order, year era, markers, sheet and summary grouping are reused and a notice offers "Don't remember these".
- Workbook with several sheets: "Analyze all sheets" lists rows, columns, status, items to review and scores per sheet (up to 12) and each sheet can be opened.

### Language, layout and limits
- Switch to Thai and walk through every tab. Remaining English should be limited to data values, file names and technical identifiers.
- Repeat at mobile width (about 375 px): no horizontal page scroll and controls at least 44 px tall.
- Toggle dark and light themes.
- Upload an invalid file and an Excel file above 4 MiB; verify a clear error and that the prior dataset remains usable.
- A 10–40 MB CSV is accepted because it is compressed before upload (the page keeps working; a file with more than 4,000,000 cells gets a clear message).
- Export rows to fix: open the Excel file, confirm the Row and What to fix columns and that IDs with leading zeros stay text.
- Open a snapshot saved earlier as the comparison baseline of a corrected file.
- A file with a Thai phone or ID column shows "Personal data was found"; the downloaded copy has no such column and the original is unchanged.
- Context warnings: a column named like `order_date` with a future date, a column named like `amount` with negative values, and a text column with `Bangkok` / `bangkok ` each produce a medium finding; the located spelling variants appear under "Spelling variants". Type-conflict findings name example values.
- Performance reference: a 100,000-row, 8-column, 4 MB CSV completes in about 16 seconds on the hosted service (about 6 seconds locally).
- Choose Back to Nexus; verify the hub opens without transferring file contents.

DataLens has no account system. File contents and analysis state are not transferred to Nexus.
